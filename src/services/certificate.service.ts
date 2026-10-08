import { createHash, randomBytes } from 'node:crypto';
import PDFDocument from 'pdfkit';

import { query } from '../config/database.js';
import { env, frontendUrl } from '../config/env.js';
import {
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from '../utils/errors.js';
import { formatDate } from '../utils/dateFormat.js';

export interface CertificateRow {
  id: string;
  organization_id: string;
  result_id: string;
  student_id: string;
  certificate_no: string;
  verification_code: string;
  status: 'issued' | 'revoked';
  issued_at: string | Date;
  revoked_at: string | Date | null;
  metadata: Record<string, unknown>;
  test_title?: string;
  percentage?: number;
  total_score?: number;
  max_score?: number;
  first_name?: string;
  last_name?: string;
  email?: string;
  org_name?: string;
  enrollment_no?: string | null;
}

function makeCertificateNo(orgSlugPart: string): string {
  const y = new Date().getFullYear();
  const rand = randomBytes(3).toString('hex').toUpperCase();

  return `EDM-${y}-${orgSlugPart.slice(0, 6).toUpperCase()}-${rand}`;
}

function makeVerificationCode(): string {
  return randomBytes(5).toString('hex').toUpperCase();
}

/**
 * Checks whether a result is eligible for a certificate.
 *
 * passing_marks can represent:
 *
 * 1. Absolute marks
 *    Example:
 *      maxScore = 100
 *      passingMarks = 40
 *      score = 45
 *      => PASS
 *
 * 2. Percentage
 *    Example:
 *      maxScore = 2
 *      passingMarks = 40
 *      score = 2
 *      percentage = 100
 *      => PASS
 *
 * If passing_marks is greater than maxScore,
 * it is treated as a percentage threshold.
 */
function passedExam(
  percentage: number,
  totalScore: number,
  passingMarks: number | null,
  maxScore: number,
): boolean {
  const safePercentage = Number(percentage) || 0;
  const safeTotalScore = Number(totalScore) || 0;
  const safePassingMarks = Number(passingMarks);
  const safeMaxScore = Number(maxScore) || 0;

  /*
   * No valid passing mark configured.
   * Use default 40%.
   */
  if (
    passingMarks == null ||
    !Number.isFinite(safePassingMarks) ||
    safePassingMarks <= 0
  ) {
    return safePercentage + 1e-9 >= 40;
  }

  /*
   * If passing marks are greater than the maximum
   * possible marks, treat passing_marks as percentage.
   *
   * Example:
   * maxScore = 2
   * passingMarks = 40
   * percentage = 100
   *
   * 100 >= 40 => PASS
   */
  if (
    safeMaxScore > 0 &&
    safePassingMarks > safeMaxScore
  ) {
    return safePercentage + 1e-9 >= safePassingMarks;
  }

  /*
   * Otherwise passing_marks is treated as
   * an absolute score.
   *
   * Example:
   * maxScore = 100
   * passingMarks = 40
   * totalScore = 50
   *
   * 50 >= 40 => PASS
   */
  if (safeMaxScore > 0) {
    return safeTotalScore + 1e-9 >= safePassingMarks;
  }

  return safePercentage + 1e-9 >= safePassingMarks;
}

async function loadResultForIssue(
  resultId: string,
  organizationId: string,
) {
  const result = await query<{
    id: string;
    student_id: string;
    test_id: string;
    total_score: number;
    max_score: number;
    percentage: number;
    test_title: string;
    passing_marks: number | null;
    organization_id: string;
    org_name: string;
    org_slug: string;
    first_name: string;
    last_name: string;
    email: string;
    enrollment_no: string | null;
  }>(
    `SELECT
       r.id,
       r.student_id,
       r.test_id,
       r.total_score,
       r.max_score,
       r.percentage,
       t.title AS test_title,
       t.passing_marks,
       t.organization_id,
       o.name AS org_name,
       o.slug AS org_slug,
       u.first_name,
       u.last_name,
       u.email,
       s.admission_no AS enrollment_no
     FROM results r
     JOIN tests t ON t.id = r.test_id
     JOIN organizations o ON o.id = t.organization_id
     JOIN students s ON s.id = r.student_id
     JOIN users u ON u.id = s.user_id
     WHERE r.id = $1
       AND t.organization_id = $2`,
    [resultId, organizationId],
  );

  if (!result.rows[0]) {
    throw new NotFoundError('Result');
  }

  return result.rows[0];
}

export async function issueCertificateForResult(
  resultId: string,
  organizationId: string,
  issuedByUserId: string,
) {
  const row = await loadResultForIssue(
    resultId,
    organizationId,
  );

  const isPassed = passedExam(
    Number(row.percentage),
    Number(row.total_score),
    row.passing_marks,
    Number(row.max_score),
  );

  console.log('[CERTIFICATE] Passing check:', {
    resultId,
    totalScore: Number(row.total_score),
    maxScore: Number(row.max_score),
    percentage: Number(row.percentage),
    passingMarks: row.passing_marks,
    passed: isPassed,
  });

  if (!isPassed) {
    throw new ValidationError(
      'Certificate can only be issued for a passing result',
    );
  }

  /*
   * Prevent duplicate certificates for the same result.
   */
  const existing = await query<CertificateRow>(
    `SELECT
       id,
       certificate_no,
       verification_code,
       status,
       issued_at
     FROM certificates
     WHERE result_id = $1
     LIMIT 1`,
    [resultId],
  );

  if (existing.rows[0]) {
    if (existing.rows[0].status === 'revoked') {
      throw new ValidationError(
        'Certificate was revoked for this result; contact admin',
      );
    }

    return getCertificateById(
      existing.rows[0].id,
      organizationId,
    );
  }

  const certificateNo = makeCertificateNo(
    row.org_slug || 'ORG',
  );

  const verificationCode = makeVerificationCode();

  const metadata = {
    testTitle: row.test_title,
    studentName:
      `${row.first_name} ${row.last_name}`.trim(),
    percentage: Number(row.percentage),
    totalScore: Number(row.total_score),
    maxScore: Number(row.max_score),
    passingMarks:
      row.passing_marks != null
        ? Number(row.passing_marks)
        : null,
    issuedBy: issuedByUserId,
    organizationName: row.org_name,
  };

  /*
   * MySQL / MariaDB does not use PostgreSQL-style
   * INSERT ... RETURNING.
   *
   * First insert the certificate.
   */
  await query(
    `INSERT INTO certificates (
       organization_id,
       result_id,
       student_id,
       certificate_no,
       verification_code,
       status,
       metadata
     )
     VALUES (
       $1,
       $2,
       $3,
       $4,
       $5,
       'issued',
       $6
     )`,
    [
      organizationId,
      resultId,
      row.student_id,
      certificateNo,
      verificationCode,
      JSON.stringify(metadata),
    ],
  );

  /*
   * Now retrieve the newly created certificate.
   *
   * certificate_no is generated uniquely above,
   * so it is safe to use it to retrieve the inserted row.
   */
  const created = await query<CertificateRow>(
    `SELECT
       id,
       organization_id,
       result_id,
       student_id,
       certificate_no,
       verification_code,
       status,
       issued_at,
       revoked_at,
       metadata
     FROM certificates
     WHERE certificate_no = $1
       AND organization_id = $2
     LIMIT 1`,
    [certificateNo, organizationId],
  );

  if (!created.rows[0]) {
    throw new NotFoundError(
      'Certificate after creation',
    );
  }

  console.log('[CERTIFICATE] Created:', {
    id: created.rows[0].id,
    certificateNo,
    verificationCode,
    resultId,
    studentId: row.student_id,
  });

  return getCertificateById(
    created.rows[0].id,
    organizationId,
  );
}

export async function getCertificateById(
  id: string,
  organizationId: string,
) {
  const result = await query<CertificateRow>(
    `SELECT
       c.id,
       c.organization_id,
       c.result_id,
       c.student_id,
       c.certificate_no,
       c.verification_code,
       c.status,
       c.issued_at,
       c.revoked_at,
       c.metadata,
       t.title AS test_title,
       r.percentage,
       r.total_score,
       r.max_score,
       u.first_name,
       u.last_name,
       u.email,
       o.name AS org_name,
       s.admission_no AS enrollment_no
     FROM certificates c
     JOIN results r ON r.id = c.result_id
     JOIN tests t ON t.id = r.test_id
     JOIN organizations o ON o.id = c.organization_id
     JOIN students s ON s.id = c.student_id
     JOIN users u ON u.id = s.user_id
     WHERE c.id = $1
       AND c.organization_id = $2`,
    [id, organizationId],
  );

  if (!result.rows[0]) {
    throw new NotFoundError('Certificate');
  }

  return enrichCertificate(result.rows[0]);
}

function enrichCertificate(row: CertificateRow) {
  const verifyPath =
    `/verify-certificate?code=${encodeURIComponent(
      row.verification_code,
    )}`;

  return {
    ...row,
    student_name:
      `${row.first_name ?? ''} ${row.last_name ?? ''}`.trim(),
    verify_url: frontendUrl(verifyPath),
  };
}

export async function listCertificatesForStudent(
  studentId: string,
  organizationId: string,
) {
  const result = await query<CertificateRow>(
    `SELECT
       c.id,
       c.organization_id,
       c.result_id,
       c.student_id,
       c.certificate_no,
       c.verification_code,
       c.status,
       c.issued_at,
       c.revoked_at,
       c.metadata,
       t.title AS test_title,
       r.percentage,
       r.total_score,
       r.max_score,
       u.first_name,
       u.last_name,
       u.email,
       o.name AS org_name,
       s.admission_no AS enrollment_no
     FROM certificates c
     JOIN results r ON r.id = c.result_id
     JOIN tests t ON t.id = r.test_id
     JOIN organizations o ON o.id = c.organization_id
     JOIN students s ON s.id = c.student_id
     JOIN users u ON u.id = s.user_id
     WHERE c.student_id = $1
       AND c.organization_id = $2
     ORDER BY c.issued_at DESC`,
    [studentId, organizationId],
  );

  return result.rows.map(enrichCertificate);
}

export async function listCertificatesForOrg(
  organizationId: string,
  page: number,
  limit: number,
) {
  const offset = (page - 1) * limit;

  const [data, count] = await Promise.all([
    query<CertificateRow>(
      `SELECT
         c.id,
         c.organization_id,
         c.result_id,
         c.student_id,
         c.certificate_no,
         c.verification_code,
         c.status,
         c.issued_at,
         c.revoked_at,
         c.metadata,
         t.title AS test_title,
         r.percentage,
         r.total_score,
         r.max_score,
         u.first_name,
         u.last_name,
         u.email,
         o.name AS org_name,
         s.admission_no AS enrollment_no
       FROM certificates c
       JOIN results r ON r.id = c.result_id
       JOIN tests t ON t.id = r.test_id
       JOIN organizations o ON o.id = c.organization_id
       JOIN students s ON s.id = c.student_id
       JOIN users u ON u.id = s.user_id
       WHERE c.organization_id = $1
       ORDER BY c.issued_at DESC
       LIMIT $2
       OFFSET $3`,
      [organizationId, limit, offset],
    ),

    query<{ total: number }>(
      `SELECT
         COUNT(*) AS total
       FROM certificates
       WHERE organization_id = $1`,
      [organizationId],
    ),
  ]);

  const total = Number(
    count.rows[0]?.total ?? 0,
  );

  return {
    data: data.rows.map(enrichCertificate),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

export async function revokeCertificate(
  id: string,
  organizationId: string,
) {
  /*
   * MySQL / MariaDB compatible UPDATE.
   *
   * No RETURNING here.
   */
  const updated = await query(
    `UPDATE certificates
     SET
       status = 'revoked',
       revoked_at = NOW()
     WHERE id = $1
       AND organization_id = $2
       AND status = 'issued'`,
    [id, organizationId],
  );

  /*
   * Verify that a certificate was actually updated.
   */
  if (
    !updated ||
    (updated as { affectedRows?: number }).affectedRows === 0
  ) {
    /*
     * Some database wrappers do not expose affectedRows.
     * In that case, perform an explicit lookup.
     */
    const check = await query<CertificateRow>(
      `SELECT
         id,
         certificate_no,
         status,
         revoked_at
       FROM certificates
       WHERE id = $1
         AND organization_id = $2
       LIMIT 1`,
      [id, organizationId],
    );

    if (!check.rows[0]) {
      throw new NotFoundError('Certificate');
    }

    if (check.rows[0].status === 'revoked') {
      return check.rows[0];
    }

    throw new NotFoundError('Certificate');
  }

  /*
   * Retrieve the updated certificate.
   */
  const result = await query<CertificateRow>(
    `SELECT
       id,
       certificate_no,
       status,
       revoked_at
     FROM certificates
     WHERE id = $1
       AND organization_id = $2
     LIMIT 1`,
    [id, organizationId],
  );

  if (!result.rows[0]) {
    throw new NotFoundError('Certificate');
  }

  return result.rows[0];
}

/**
 * Public certificate verification — no authentication required.
 */
export async function verifyCertificatePublic(
  codeOrNumber: string,
) {
  const key = codeOrNumber.trim().toUpperCase();

  if (!key) {
    throw new ValidationError(
      'Verification code is required',
    );
  }

  const result = await query<CertificateRow>(
    `SELECT
       c.id,
       c.organization_id,
       c.result_id,
       c.student_id,
       c.certificate_no,
       c.verification_code,
       c.status,
       c.issued_at,
       c.revoked_at,
       c.metadata,
       t.title AS test_title,
       r.percentage,
       r.total_score,
       r.max_score,
       u.first_name,
       u.last_name,
       o.name AS org_name,
       s.admission_no AS enrollment_no
     FROM certificates c
     JOIN results r ON r.id = c.result_id
     JOIN tests t ON t.id = r.test_id
     JOIN organizations o ON o.id = c.organization_id
     JOIN students s ON s.id = c.student_id
     JOIN users u ON u.id = s.user_id
     WHERE UPPER(c.verification_code) = $1
        OR UPPER(c.certificate_no) = $1
     LIMIT 1`,
    [key],
  );

  const row = result.rows[0];

  if (!row) {
    return {
      valid: false,
      message: 'No certificate found for this code',
    };
  }

  if (row.status === 'revoked') {
    return {
      valid: false,
      message: 'This certificate has been revoked',
      certificate_no: row.certificate_no,
      status: row.status,
    };
  }

  const fingerprint = createHash('sha256')
    .update(
      `${row.certificate_no}|${row.verification_code}|${row.result_id}`,
    )
    .digest('hex')
    .slice(0, 16)
    .toUpperCase();

  return {
    valid: true,
    message: 'Certificate is authentic',
    certificate_no: row.certificate_no,
    verification_code: row.verification_code,
    status: row.status,
    issued_at: row.issued_at,
    student_name:
      `${row.first_name ?? ''} ${row.last_name ?? ''}`.trim(),
    test_title: row.test_title,
    organization: row.org_name,
    percentage: Number(row.percentage),
    score: `${row.total_score}/${row.max_score}`,
    fingerprint,
  };
}

export async function assertCertificateAccess(
  cert: Awaited<ReturnType<typeof getCertificateById>>,
  opts: {
    userId: string;
    roles: string[];
    studentId?: string | null;
  },
) {
  if (
    opts.roles.includes('super_admin') ||
    opts.roles.includes('org_admin') ||
    opts.roles.includes('staff') ||
    opts.roles.includes('teacher')
  ) {
    return;
  }

  if (
    opts.studentId &&
    cert.student_id === opts.studentId
  ) {
    return;
  }

  throw new ForbiddenError(
    'You cannot access this certificate',
  );
}

export async function buildCertificatePdf(
  cert: Awaited<ReturnType<typeof getCertificateById>>,
): Promise<Buffer> {
  const student =
    cert.student_name || 'Student';

  const testTitle =
    cert.test_title ||
    String(
      cert.metadata?.testTitle ??
        'Examination',
    );

  const org =
    cert.org_name || env.APP_NAME;

  const pct = Number(
    cert.percentage ??
      cert.metadata?.percentage ??
      0,
  ).toFixed(1);

  const issued = formatDate(
    cert.issued_at,
  );

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      layout: 'landscape',
      margin: 40,
    });

    const chunks: Buffer[] = [];

    doc.on('data', (c) =>
      chunks.push(c as Buffer),
    );

    doc.on('end', () =>
      resolve(Buffer.concat(chunks)),
    );

    doc.on('error', reject);

    const w = doc.page.width;
    const h = doc.page.height;

    doc
      .rect(20, 20, w - 40, h - 40)
      .lineWidth(2)
      .stroke('#1e3a5f');

    doc
      .rect(28, 28, w - 56, h - 56)
      .lineWidth(0.5)
      .stroke('#94a3b8');

    doc
      .font('Helvetica-Bold')
      .fontSize(14)
      .fillColor('#1e3a5f')
      .text(
        org.toUpperCase(),
        50,
        55,
        {
          align: 'center',
          width: w - 100,
        },
      );

    doc
      .font('Helvetica')
      .fontSize(11)
      .fillColor('#64748b')
      .text(
        'Certificate of Achievement',
        50,
        80,
        {
          align: 'center',
          width: w - 100,
        },
      );

    doc
      .font('Helvetica-Bold')
      .fontSize(28)
      .fillColor('#0f172a')
      .text(
        'CERTIFICATE',
        50,
        115,
        {
          align: 'center',
          width: w - 100,
        },
      );

    doc
      .font('Helvetica')
      .fontSize(12)
      .fillColor('#334155')
      .text(
        'This is to certify that',
        50,
        165,
        {
          align: 'center',
          width: w - 100,
        },
      );

    doc
      .font('Helvetica-Bold')
      .fontSize(22)
      .fillColor('#1e3a5f')
      .text(
        student,
        50,
        190,
        {
          align: 'center',
          width: w - 100,
        },
      );

    doc
      .font('Helvetica')
      .fontSize(12)
      .fillColor('#334155')
      .text(
        'has successfully completed the examination',
        50,
        230,
        {
          align: 'center',
          width: w - 100,
        },
      );

    doc
      .font('Helvetica-Bold')
      .fontSize(16)
      .fillColor('#0f172a')
      .text(
        testTitle,
        50,
        255,
        {
          align: 'center',
          width: w - 100,
        },
      );

    doc
      .font('Helvetica')
      .fontSize(12)
      .fillColor('#334155')
      .text(
        `Score: ${cert.total_score}/${cert.max_score}  ·  Percentage: ${pct}%`,
        50,
        295,
        {
          align: 'center',
          width: w - 100,
        },
      );

    doc
      .fontSize(10)
      .fillColor('#64748b')
      .text(
        `Certificate No: ${cert.certificate_no}`,
        60,
        h - 110,
      )
      .text(
        `Verification Code: ${cert.verification_code}`,
        60,
        h - 95,
      )
      .text(
        `Issued: ${issued}`,
        60,
        h - 80,
      )
      .text(
        `Verify at: ${cert.verify_url}`,
        60,
        h - 65,
        {
          width: w / 2,
        },
      );

    doc
      .font('Helvetica-Oblique')
      .fontSize(10)
      .fillColor('#94a3b8')
      .text(
        env.APP_NAME,
        w / 2,
        h - 95,
        {
          align: 'center',
          width: w / 2 - 60,
        },
      );

    doc.end();
  });
}

export async function buildTestReportPdf(
  payload: {
    testTitle: string;
    orgName?: string;
    stats: Record<string, unknown>;
    results: Array<Record<string, unknown>>;
  },
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margin: 40,
    });

    const chunks: Buffer[] = [];

    doc.on('data', (c) =>
      chunks.push(c as Buffer),
    );

    doc.on('end', () =>
      resolve(Buffer.concat(chunks)),
    );

    doc.on('error', reject);

    doc
      .font('Helvetica-Bold')
      .fontSize(18)
      .fillColor('#0f172a')
      .text(env.APP_NAME);

    doc.moveDown(0.3);

    doc
      .font('Helvetica-Bold')
      .fontSize(14)
      .text(
        `Test Report — ${payload.testTitle}`,
      );

    doc.moveDown(0.5);

    doc
      .font('Helvetica')
      .fontSize(10)
      .fillColor('#334155');

    doc.text(
      `Attempts: ${
        payload.stats.attempt_count ?? 0
      }`,
    );

    doc.text(
      `Average score: ${Number(
        payload.stats.avg_score ?? 0,
      ).toFixed(2)}`,
    );

    doc.text(
      `Highest: ${
        payload.stats.max_score ?? 0
      }  ·  Lowest: ${
        payload.stats.min_score ?? 0
      }`,
    );

    if (payload.stats.pass_rate != null) {
      doc.text(
        `Pass rate: ${Number(
          payload.stats.pass_rate,
        ).toFixed(1)}%`,
      );
    }

    doc.moveDown();

    doc
      .font('Helvetica-Bold')
      .text(
        'Rank  Student                          Score    %',
      );

    doc.moveDown(0.3);

    doc
      .font('Helvetica')
      .fontSize(9);

    for (const [
      i,
      r,
    ] of payload.results
      .slice(0, 80)
      .entries()) {
      const name =
        `${r.first_name ?? ''} ${
          r.last_name ?? ''
        }`.trim() || '—';

      const line =
        `${String(
          r.rank ?? i + 1,
        ).padStart(4)}  ` +
        `${name
          .slice(0, 28)
          .padEnd(28)}  ` +
        `${String(
          r.total_score,
        ).padStart(5)}  ` +
        `${Number(
          r.percentage,
        ).toFixed(1)}%`;

      doc.text(line);

      if (doc.y > 760) {
        doc.addPage();

        doc
          .font('Helvetica')
          .fontSize(9);
      }
    }

    if (payload.results.length > 80) {
      doc
        .moveDown()
        .text(
          `… and ${
            payload.results.length - 80
          } more rows (see CSV export for full list)`,
        );
    }

    doc.end();
  });
}