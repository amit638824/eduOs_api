import { Request, Response, NextFunction } from 'express';
import { vParams, vQuery } from '../middleware/validate.js';
import { query } from '../config/database.js';
import { resolveOrganizationId } from '../utils/orgAccess.js';
import * as certificateService from '../services/certificate.service.js';
import * as attemptService from '../services/attempt.service.js';
import { ForbiddenError } from '../utils/errors.js';

async function orgContext(req: Request) {
  const isSuperAdmin = req.user!.roles.includes('super_admin');
  const orgId = await resolveOrganizationId(req.user!.organizationId, isSuperAdmin, req);
  return { orgId, userId: req.user!.id, roles: req.user!.roles };
}

/** Public — no auth */
export async function verifyCertificate(req: Request, res: Response, next: NextFunction) {
  try {
    const code = String(req.params.code ?? req.query.code ?? '');
    const data = await certificateService.verifyCertificatePublic(code);
    res.json({ success: true, data });
  } catch (e) {
    next(e);
  }
}

export async function issueCertificate(req: Request, res: Response, next: NextFunction) {
  try {
    const { orgId, userId, roles } = await orgContext(req);
    const { resultId } = vParams(req) as { resultId: string };
    if (roles.includes('student') && !roles.some((r) => ['org_admin', 'super_admin', 'staff', 'teacher'].includes(r))) {
      const studentId = await attemptService.getStudentIdByUserId(userId);
      const owned = await query(
        `SELECT r.id FROM results r
         JOIN tests t ON t.id = r.test_id
         WHERE r.id = $1 AND r.student_id = $2 AND t.organization_id = $3`,
        [resultId, studentId, orgId],
      );
      if (!owned.rows[0]) {
        throw new ForbiddenError('You can only issue certificates for your own results');
      }
    }
    const cert = await certificateService.issueCertificateForResult(resultId, orgId, userId);
    res.status(201).json({ success: true, data: cert });
  } catch (e) {
    next(e);
  }
}

export async function listMyCertificates(req: Request, res: Response, next: NextFunction) {
  try {
    const { orgId } = await orgContext(req);
    const studentId = await attemptService.getStudentIdByUserId(req.user!.id);
    const data = await certificateService.listCertificatesForStudent(studentId, orgId);
    res.json({ success: true, data });
  } catch (e) {
    next(e);
  }
}

export async function listCertificates(req: Request, res: Response, next: NextFunction) {
  try {
    const { orgId, roles, userId } = await orgContext(req);
    const { page = 1, limit = 50 } = (vQuery(req) as { page?: number; limit?: number }) ?? {};
    if (roles.includes('student') && !roles.some((r) => ['org_admin', 'super_admin', 'staff', 'teacher'].includes(r))) {
      const studentId = await attemptService.getStudentIdByUserId(userId);
      const data = await certificateService.listCertificatesForStudent(studentId, orgId);
      res.json({ success: true, data, pagination: { page: 1, limit: data.length, total: data.length, totalPages: 1 } });
      return;
    }
    const result = await certificateService.listCertificatesForOrg(orgId, Number(page), Number(limit));
    res.json({ success: true, ...result });
  } catch (e) {
    next(e);
  }
}

export async function getCertificate(req: Request, res: Response, next: NextFunction) {
  try {
    const { orgId, roles, userId } = await orgContext(req);
    const { id } = vParams(req) as { id: string };
    const cert = await certificateService.getCertificateById(id, orgId);
    let studentId: string | null = null;
    if (roles.includes('student')) {
      try {
        studentId = await attemptService.getStudentIdByUserId(userId);
      } catch {
        studentId = null;
      }
    }
    await certificateService.assertCertificateAccess(cert, { userId, roles, studentId });
    res.json({ success: true, data: cert });
  } catch (e) {
    next(e);
  }
}

export async function downloadCertificatePdf(req: Request, res: Response, next: NextFunction) {
  try {
    const { orgId, roles, userId } = await orgContext(req);
    const { id } = vParams(req) as { id: string };
    const cert = await certificateService.getCertificateById(id, orgId);
    let studentId: string | null = null;
    if (roles.includes('student')) {
      try {
        studentId = await attemptService.getStudentIdByUserId(userId);
      } catch {
        studentId = null;
      }
    }
    await certificateService.assertCertificateAccess(cert, { userId, roles, studentId });
    if (cert.status === 'revoked') {
      res.status(410).json({ success: false, message: 'Certificate revoked' });
      return;
    }
    const pdf = await certificateService.buildCertificatePdf(cert);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="certificate-${cert.certificate_no}.pdf"`,
    );
    res.send(pdf);
  } catch (e) {
    next(e);
  }
}

export async function revokeCertificate(req: Request, res: Response, next: NextFunction) {
  try {
    const { orgId } = await orgContext(req);
    const { id } = vParams(req) as { id: string };
    const data = await certificateService.revokeCertificate(id, orgId);
    res.json({ success: true, data });
  } catch (e) {
    next(e);
  }
}
