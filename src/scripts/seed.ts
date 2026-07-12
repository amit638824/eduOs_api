/**
 * =============================================================================
 * EduTest Pro — Phase 1 Database Seed (single entry point)
 * =============================================================================
 *
 * WHAT IT DOES
 *   1. Wipes ALL application data (keeps schema_migrations intact)
 *   2. Re-seeds RBAC roles & permissions from SQL files
 *   3. Inserts fresh demo data for every Phase 1 module
 *
 * USAGE
 *   npm run db:seed              # wipe + seed (from eduOs_api)
 *   npm run db:setup             # migrate + seed
 *
 *   From project root (Windows):
 *   .\scripts\setup-phase1.ps1
 *
 * DEFAULT PASSWORD (all demo users): Password@123
 *
 * DEMO LOGINS
 *   student1@edutech.com   → Student dashboard
 *   teacher1@edutech.com   → Teacher / Question Bank / Tests
 *   orgadmin@edutech.com   → Admin / Users / Reports / Payments
 *   superadmin@edutech.com → Full platform access
 *
 * =============================================================================
 */
import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { PoolClient } from 'pg';
import { pool, withTransaction } from '../config/database.js';
import { hashPassword } from '../utils/security.js';

const SEED_PASSWORD = 'Password@123';
const SEED_DIR = path.resolve(process.cwd(), 'database/seed');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SeedUser {
  email: string;
  firstName: string;
  lastName: string;
  phone: string;
  role: string;
  branchCode?: 'main' | 'city';
  studentMeta?: { admissionNo: string; batch: string; walletBalance?: number };
  teacherMeta?: { employeeId: string };
}

interface OrgContext {
  orgId: string;
  branches: { main: string; city: string };
  teacherId: string;
  orgAdminId: string;
  students: Record<string, string>;
  users: Record<string, string>;
}

// ---------------------------------------------------------------------------
// Demo users (15 roles)
// ---------------------------------------------------------------------------

const SEED_USERS: SeedUser[] = [
  { email: 'superadmin@edutech.com', firstName: 'Rahul', lastName: 'Sharma', phone: '9876500001', role: 'super_admin' },
  { email: 'orgadmin@edutech.com', firstName: 'Priya', lastName: 'Verma', phone: '9876500002', role: 'org_admin' },
  { email: 'branchadmin@edutech.com', firstName: 'Amit', lastName: 'Kumar', phone: '9876500003', role: 'branch_admin', branchCode: 'main' },
  { email: 'teacher1@edutech.com', firstName: 'Sneha', lastName: 'Gupta', phone: '9876500004', role: 'teacher', branchCode: 'main', teacherMeta: { employeeId: 'TCH-001' } },
  { email: 'teacher2@edutech.com', firstName: 'Vikram', lastName: 'Singh', phone: '9876500005', role: 'teacher', branchCode: 'city', teacherMeta: { employeeId: 'TCH-002' } },
  { email: 'examiner@edutech.com', firstName: 'Deepak', lastName: 'Rao', phone: '9876500006', role: 'examiner', branchCode: 'main' },
  { email: 'evaluator@edutech.com', firstName: 'Kavita', lastName: 'Nair', phone: '9876500007', role: 'evaluator', branchCode: 'main' },
  { email: 'student1@edutech.com', firstName: 'Arjun', lastName: 'Mehta', phone: '9876500011', role: 'student', branchCode: 'main', studentMeta: { admissionNo: 'ADM-2025-001', batch: 'JEE-2026-A', walletBalance: 500 } },
  { email: 'student2@edutech.com', firstName: 'Isha', lastName: 'Patel', phone: '9876500012', role: 'student', branchCode: 'main', studentMeta: { admissionNo: 'ADM-2025-002', batch: 'JEE-2026-A', walletBalance: 250 } },
  { email: 'student3@edutech.com', firstName: 'Rohan', lastName: 'Das', phone: '9876500013', role: 'student', branchCode: 'city', studentMeta: { admissionNo: 'ADM-2025-003', batch: 'NEET-2026-B', walletBalance: 100 } },
  { email: 'student4@edutech.com', firstName: 'Ananya', lastName: 'Joshi', phone: '9876500014', role: 'student', branchCode: 'city', studentMeta: { admissionNo: 'ADM-2025-004', batch: 'NEET-2026-B', walletBalance: 0 } },
  { email: 'student5@edutech.com', firstName: 'Karan', lastName: 'Malhotra', phone: '9876500015', role: 'student', branchCode: 'main', studentMeta: { admissionNo: 'ADM-2025-005', batch: 'FOUNDATION-10', walletBalance: 750 } },
  { email: 'parent@edutech.com', firstName: 'Suresh', lastName: 'Mehta', phone: '9876500020', role: 'parent' },
  { email: 'support@edutech.com', firstName: 'Neha', lastName: 'Reddy', phone: '9876500030', role: 'support' },
  { email: 'finance@edutech.com', firstName: 'Rajesh', lastName: 'Iyer', phone: '9876500040', role: 'finance' },
];

// ---------------------------------------------------------------------------
// Step 0 — Wipe all data
// ---------------------------------------------------------------------------

async function resetDatabase(): Promise<void> {
  console.log('  Truncating all application tables...');
  await pool.query(`
    TRUNCATE TABLE
      certificates,
      results,
      attempt_answers,
      test_attempts,
      test_assignments,
      test_questions,
      test_sections,
      tests,
      question_media,
      question_options,
      questions,
      question_categories,
      topics,
      chapters,
      subjects,
      notifications,
      payments,
      settings,
      attachments,
      audit_logs,
      activity_logs,
      students,
      teachers,
      otp_codes,
      password_reset_tokens,
      refresh_tokens,
      user_roles,
      users,
      departments,
      academic_sessions,
      branches,
      organizations,
      role_permissions,
      permissions,
      roles
    RESTART IDENTITY CASCADE
  `);
  console.log('  All records deleted.');
}

// ---------------------------------------------------------------------------
// Step 1 — RBAC from SQL files
// ---------------------------------------------------------------------------

async function seedRbac(): Promise<void> {
  const files = (await fs.readdir(SEED_DIR))
    .filter((f) => f.endsWith('.sql'))
    .sort();

  for (const file of files) {
    const sql = await fs.readFile(path.join(SEED_DIR, file), 'utf-8');
    await pool.query(sql);
    console.log(`  ✓ ${file}`);
  }
}

// ---------------------------------------------------------------------------
// Step 2 — Organization & users
// ---------------------------------------------------------------------------

async function getRoleId(client: PoolClient, roleName: string): Promise<string> {
  const result = await client.query<{ id: string }>('SELECT id FROM roles WHERE name = $1', [roleName]);
  if (!result.rows[0]) throw new Error(`Role not found: ${roleName}`);
  return result.rows[0].id;
}

async function seedOrgAndUsers(): Promise<OrgContext> {
  const passwordHash = await hashPassword(SEED_PASSWORD);
  const users: Record<string, string> = {};
  const students: Record<string, string> = {};

  return withTransaction(async (client) => {
    const org = await client.query<{ id: string }>(
      `INSERT INTO organizations (name, slug, theme, settings)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [
        'EduTech Academy',
        'edutech-academy',
        JSON.stringify({ primaryColor: '#2563eb', secondaryColor: '#1e40af' }),
        JSON.stringify({ timezone: 'Asia/Kolkata', currency: 'INR', language: 'en' }),
      ],
    );
    const orgId = org.rows[0].id;

    const main = await client.query<{ id: string }>(
      `INSERT INTO branches (organization_id, name, code, address)
       VALUES ($1, 'Main Campus', 'DEL-MAIN', 'Connaught Place, New Delhi') RETURNING id`,
      [orgId],
    );
    const city = await client.query<{ id: string }>(
      `INSERT INTO branches (organization_id, name, code, address)
       VALUES ($1, 'City Branch', 'DEL-CITY', 'Noida Sector 62, UP') RETURNING id`,
      [orgId],
    );
    const branches = { main: main.rows[0].id, city: city.rows[0].id };

    await client.query(`INSERT INTO departments (branch_id, name, code) VALUES ($1, 'Science', 'SCI'), ($1, 'Commerce', 'COM')`, [branches.main]);
    await client.query(
      `INSERT INTO academic_sessions (organization_id, name, start_date, end_date, is_current)
       VALUES ($1, '2025-26', '2025-04-01', '2026-03-31', TRUE)`,
      [orgId],
    );

    let superAdminId: string | null = null;

    for (const u of SEED_USERS) {
      const branchId = u.branchCode === 'main' ? branches.main : u.branchCode === 'city' ? branches.city : null;
      const organizationId = u.role === 'super_admin' ? null : orgId;

      const row = await client.query<{ id: string }>(
        `INSERT INTO users (organization_id, branch_id, email, password_hash, first_name, last_name, phone, status, email_verified)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'active', TRUE) RETURNING id`,
        [organizationId, branchId, u.email, passwordHash, u.firstName, u.lastName, u.phone],
      );
      const userId = row.rows[0].id;
      users[u.email] = userId;

      const roleId = await getRoleId(client, u.role);
      await client.query('INSERT INTO user_roles (user_id, role_id, assigned_by) VALUES ($1, $2, $3)', [
        userId,
        roleId,
        superAdminId,
      ]);

      if (u.role === 'student' && u.studentMeta) {
        const s = await client.query<{ id: string }>(
          `INSERT INTO students (user_id, organization_id, branch_id, admission_no, batch, wallet_balance, enrolled_at)
           VALUES ($1, $2, $3, $4, $5, $6, NOW()) RETURNING id`,
          [userId, orgId, branchId, u.studentMeta.admissionNo, u.studentMeta.batch, u.studentMeta.walletBalance ?? 0],
        );
        students[u.email] = s.rows[0].id;
      }

      if (u.role === 'teacher' && u.teacherMeta) {
        await client.query(
          `INSERT INTO teachers (user_id, organization_id, branch_id, employee_id) VALUES ($1, $2, $3, $4)`,
          [userId, orgId, branchId, u.teacherMeta.employeeId],
        );
      }

      if (u.role === 'super_admin') superAdminId = userId;
      console.log(`  + ${u.email} [${u.role}]`);
    }

    return {
      orgId,
      branches,
      teacherId: users['teacher1@edutech.com'],
      orgAdminId: users['orgadmin@edutech.com'],
      students,
      users,
    };
  });
}

// ---------------------------------------------------------------------------
// Step 3 — Examination (subjects, questions, tests, attempt, result)
// ---------------------------------------------------------------------------

async function seedExamination(ctx: OrgContext): Promise<{ satTestId: string; physicsTestId: string }> {
  const { orgId, teacherId, students } = ctx;

  // --- Math subject + SAT test ---
  const mathSubject = await pool.query<{ id: string }>(
    `INSERT INTO subjects (organization_id, name, code) VALUES ($1, 'Mathematics', 'MATH') RETURNING id`,
    [orgId],
  );
  const mathChapter = await pool.query<{ id: string }>(
    `INSERT INTO chapters (subject_id, name, sort_order) VALUES ($1, 'Algebra', 1) RETURNING id`,
    [mathSubject.rows[0].id],
  );
  const mathTopic = await pool.query<{ id: string }>(
    `INSERT INTO topics (chapter_id, name, difficulty, tags, sort_order)
     VALUES ($1, 'Linear Equations', 2, ARRAY['sat','algebra'], 1) RETURNING id`,
    [mathChapter.rows[0].id],
  );

  const satQuestions = [
    { text: 'What is the value of x if 2x + 6 = 14?', options: [{ text: '2', correct: false }, { text: '4', correct: true }, { text: '6', correct: false }, { text: '8', correct: false }] },
    { text: 'Solve for y: 3y - 9 = 0', options: [{ text: '1', correct: false }, { text: '2', correct: false }, { text: '3', correct: true }, { text: '9', correct: false }] },
    { text: 'Which is equivalent to 5(x + 2)?', options: [{ text: '5x + 2', correct: false }, { text: '5x + 10', correct: true }, { text: 'x + 10', correct: false }, { text: '5x + 7', correct: false }] },
  ];

  const satQuestionIds: string[] = [];
  for (const q of satQuestions) {
    const row = await pool.query<{ id: string }>(
      `INSERT INTO questions (organization_id, topic_id, created_by, type, status, content, marks, difficulty)
       VALUES ($1, $2, $3, 'mcq', 'approved', $4, 1, 2) RETURNING id`,
      [orgId, mathTopic.rows[0].id, teacherId, JSON.stringify({ text: q.text })],
    );
    satQuestionIds.push(row.rows[0].id);
    for (const [i, opt] of q.options.entries()) {
      await pool.query(
        `INSERT INTO question_options (question_id, content, is_correct, sort_order) VALUES ($1, $2, $3, $4)`,
        [row.rows[0].id, JSON.stringify({ text: opt.text }), opt.correct, i],
      );
    }
  }

  const satTest = await pool.query<{ id: string }>(
    `INSERT INTO tests (organization_id, created_by, title, description, status, duration_minutes, passing_marks, instructions, published_at, total_marks)
     VALUES ($1, $2, 'SAT Math Practice Test 1', 'Algebra MCQs demo', 'live', 30, 2, 'Answer all questions.', NOW(), 3) RETURNING id`,
    [orgId, teacherId],
  );
  const satTestId = satTest.rows[0].id;
  const satSection = await pool.query<{ id: string }>(
    `INSERT INTO test_sections (test_id, name, sort_order) VALUES ($1, 'Section A', 1) RETURNING id`,
    [satTestId],
  );
  for (const [i, qid] of satQuestionIds.entries()) {
    await pool.query(
      `INSERT INTO test_questions (test_id, section_id, question_id, sort_order) VALUES ($1, $2, $3, $4)`,
      [satTestId, satSection.rows[0].id, qid, i + 1],
    );
  }

  // --- Physics subject + multi-type questions ---
  const category = await pool.query<{ id: string }>(
    `INSERT INTO question_categories (organization_id, name) VALUES ($1, 'General Aptitude') RETURNING id`,
    [orgId],
  );
  const phySubject = await pool.query<{ id: string }>(
    `INSERT INTO subjects (organization_id, name, code) VALUES ($1, 'Physics', 'PHY') RETURNING id`,
    [orgId],
  );
  const phyChapter = await pool.query<{ id: string }>(
    `INSERT INTO chapters (subject_id, name, sort_order) VALUES ($1, 'Mechanics', 1) RETURNING id`,
    [phySubject.rows[0].id],
  );
  const phyTopic = await pool.query<{ id: string }>(
    `INSERT INTO topics (chapter_id, name, difficulty, tags, sort_order)
     VALUES ($1, 'Motion', 3, ARRAY['physics'], 1) RETURNING id`,
    [phyChapter.rows[0].id],
  );

  const multiTypeQuestions = [
    { type: 'msq', text: 'Which are prime numbers?', options: [{ text: '2', correct: true }, { text: '4', correct: false }, { text: '3', correct: true }, { text: '9', correct: false }] },
    { type: 'true_false', text: 'The Earth revolves around the Sun.', options: [{ text: 'True', correct: true }, { text: 'False', correct: false }] },
    { type: 'fill_blank', text: 'Capital of India is ____.', options: [{ text: 'New Delhi', correct: true }] },
    { type: 'integer', text: 'What is 12 + 8?', options: [{ value: 20, correct: true }] },
    { type: 'numerical', text: 'Value of pi (2 decimal places)?', options: [{ value: 3.14, correct: true }] },
  ];

  const phyQuestionIds: string[] = [];
  for (const q of multiTypeQuestions) {
    const row = await pool.query<{ id: string }>(
      `INSERT INTO questions (organization_id, category_id, topic_id, created_by, type, status, content, marks, difficulty)
       VALUES ($1, $2, $3, $4, $5, 'approved', $6, 1, 2) RETURNING id`,
      [orgId, category.rows[0].id, phyTopic.rows[0].id, teacherId, q.type, JSON.stringify({ text: q.text })],
    );
    phyQuestionIds.push(row.rows[0].id);
    for (const [i, opt] of q.options.entries()) {
      const content = 'value' in opt ? { value: opt.value } : { text: (opt as { text: string }).text };
      await pool.query(
        `INSERT INTO question_options (question_id, content, is_correct, sort_order) VALUES ($1, $2, $3, $4)`,
        [row.rows[0].id, JSON.stringify(content), opt.correct, i],
      );
    }
  }

  const physicsTest = await pool.query<{ id: string }>(
    `INSERT INTO tests (organization_id, created_by, title, description, status, duration_minutes, passing_marks, instructions, published_at, total_marks, config)
     VALUES ($1, $2, 'Physics Quick Quiz', 'Mixed question types', 'live', 20, 3, 'Attempt all questions.', NOW(), $3, $4) RETURNING id`,
    [orgId, teacherId, phyQuestionIds.length, JSON.stringify({ shuffleOptions: true, negativeMarking: true })],
  );
  const physicsTestId = physicsTest.rows[0].id;
  const phySection = await pool.query<{ id: string }>(
    `INSERT INTO test_sections (test_id, name, sort_order) VALUES ($1, 'Mixed Section', 1) RETURNING id`,
    [physicsTestId],
  );
  for (const [i, qid] of phyQuestionIds.entries()) {
    await pool.query(
      `INSERT INTO test_questions (test_id, section_id, question_id, sort_order) VALUES ($1, $2, $3, $4)`,
      [physicsTestId, phySection.rows[0].id, qid, i + 1],
    );
  }

  await pool.query(
    `INSERT INTO tests (organization_id, created_by, title, description, status, duration_minutes, instructions)
     VALUES ($1, $2, 'Chemistry Draft Test', 'Draft for test builder', 'draft', 45, 'Not yet published')`,
    [orgId, teacherId],
  );

  // Assignments for 3 students
  for (const email of ['student1@edutech.com', 'student2@edutech.com', 'student3@edutech.com']) {
    const sid = students[email];
    if (!sid) continue;
    for (const tid of [satTestId, physicsTestId]) {
      await pool.query(
        `INSERT INTO test_assignments (test_id, assignee_type, assignee_id) VALUES ($1, 'student', $2)`,
        [tid, sid],
      );
    }
  }

  // Completed attempt + result + certificate for student1 on SAT test
  const student1Id = students['student1@edutech.com'];
  const attempt = await pool.query<{ id: string }>(
    `INSERT INTO test_attempts (test_id, student_id, status, submitted_at, time_spent_sec)
     VALUES ($1, $2, 'submitted', NOW() - INTERVAL '2 days', 1200) RETURNING id`,
    [satTestId, student1Id],
  );

  let totalScore = 0;
  let correct = 0;
  for (const qid of satQuestionIds) {
    const opt = await pool.query<{ id: string }>(
      `SELECT id FROM question_options WHERE question_id = $1 AND is_correct = TRUE LIMIT 1`,
      [qid],
    );
    totalScore += 1;
    correct += 1;
    await pool.query(
      `INSERT INTO attempt_answers (attempt_id, question_id, answer, is_correct, marks_awarded, answered_at)
       VALUES ($1, $2, $3, TRUE, 1, NOW())`,
      [attempt.rows[0].id, qid, JSON.stringify({ selectedOptionIds: [opt.rows[0].id] })],
    );
  }

  const result = await pool.query<{ id: string }>(
    `INSERT INTO results (attempt_id, student_id, test_id, total_score, max_score, percentage, accuracy, rank, percentile, analysis)
     VALUES ($1, $2, $3, $4, 3, 100, 100, 1, 100, $5) RETURNING id`,
    [attempt.rows[0].id, student1Id, satTestId, totalScore, JSON.stringify({ correct, total: 3 })],
  );

  await pool.query(
    `INSERT INTO certificates (result_id, student_id, certificate_no, metadata)
     VALUES ($1, $2, 'CERT-STUDENT1-001', $3)`,
    [result.rows[0].id, student1Id, JSON.stringify({ testTitle: 'SAT Math Practice Test 1' })],
  );

  console.log(`  + 8 questions, 3 tests, assignments, 1 completed attempt (3/3)`);
  return { satTestId, physicsTestId };
}

// ---------------------------------------------------------------------------
// Step 4 — Platform modules (settings, notifications, payments, logs)
// ---------------------------------------------------------------------------

async function seedPlatform(ctx: OrgContext): Promise<void> {
  const settings = [
    { key: 'branding', value: { appName: 'EduTest Pro', parentCompany: 'TechWagger', tagline: 'Enterprise Online Examination' } },
    { key: 'social_links', value: { facebook: 'https://facebook.com/techwagger', twitter: 'https://twitter.com/techwagger', linkedin: 'https://linkedin.com/company/techwagger', instagram: 'https://instagram.com/techwagger' } },
    { key: 'exam_rules', value: { negativeMarking: true, allowResume: false, calculatorAllowed: true, defaultDurationMinutes: 60 } },
    { key: 'integrations', value: { emailProvider: 'smtp', smsProvider: 'disabled', paymentGateway: 'demo' } },
  ];
  for (const s of settings) {
    await pool.query(`INSERT INTO settings (organization_id, key, value) VALUES ($1, $2, $3)`, [
      ctx.orgId,
      s.key,
      JSON.stringify(s.value),
    ]);
  }

  const notifications = [
    { email: 'student1@edutech.com', title: 'Test Assigned', body: 'SAT Math Practice Test 1 has been assigned to you.' },
    { email: 'student1@edutech.com', title: 'Result Published', body: 'Your SAT Math result is now available.' },
    { email: 'teacher1@edutech.com', title: 'Question Approved', body: '8 questions approved in question bank.' },
    { email: 'orgadmin@edutech.com', title: 'Weekly Report Ready', body: 'Organization analytics report is ready.' },
    { email: 'student2@edutech.com', title: 'Payment Received', body: 'Wallet top-up of ₹500 successful.' },
  ];
  for (const n of notifications) {
    await pool.query(
      `INSERT INTO notifications (user_id, channel, title, body, sent_at) VALUES ($1, 'in_app', $2, $3, NOW())`,
      [ctx.users[n.email], n.title, n.body],
    );
  }

  const payments = [
    { email: 'student1@edutech.com', amount: 999, status: 'completed', ref: 'PAY-001' },
    { email: 'student2@edutech.com', amount: 500, status: 'completed', ref: 'PAY-002' },
    { email: 'student3@edutech.com', amount: 299, status: 'pending', ref: null },
    { email: 'student5@edutech.com', amount: 1499, status: 'completed', ref: 'PAY-004' },
  ];
  for (const p of payments) {
    await pool.query(
      `INSERT INTO payments (organization_id, user_id, amount, currency, status, gateway_ref, metadata)
       VALUES ($1, $2, $3, 'INR', $4, $5, $6)`,
      [ctx.orgId, ctx.users[p.email], p.amount, p.status, p.ref, JSON.stringify({ source: 'seed' })],
    );
  }

  const audits = [
    { action: 'create', resource: 'test', userId: ctx.teacherId },
    { action: 'approve', resource: 'question', userId: ctx.teacherId },
    { action: 'assign', resource: 'test', userId: ctx.orgAdminId },
    { action: 'login', resource: 'session', userId: ctx.users['student1@edutech.com'] },
    { action: 'export', resource: 'report', userId: ctx.orgAdminId },
  ];
  for (const a of audits) {
    await pool.query(
      `INSERT INTO audit_logs (organization_id, user_id, action, resource, ip_address) VALUES ($1, $2, $3, $4, '127.0.0.1')`,
      [ctx.orgId, a.userId, a.action, a.resource],
    );
  }

  const activities = [
    { userId: ctx.users['student1@edutech.com'], activity: 'test_started', meta: { test: 'SAT Math' } },
    { userId: ctx.users['student1@edutech.com'], activity: 'test_submitted', meta: { test: 'SAT Math' } },
    { userId: ctx.users['teacher1@edutech.com'], activity: 'question_created', meta: { count: 8 } },
    { userId: ctx.users['orgadmin@edutech.com'], activity: 'user_created', meta: { role: 'student' } },
  ];
  for (const act of activities) {
    await pool.query(
      `INSERT INTO activity_logs (user_id, activity, metadata, ip_address) VALUES ($1, $2, $3, '127.0.0.1')`,
      [act.userId, act.activity, JSON.stringify(act.meta)],
    );
  }

  console.log('  + settings, 5 notifications, 4 payments, audit + activity logs');
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

function printSummary(): void {
  console.log(`
${'='.repeat(60)}
  SEED COMPLETE — Demo Credentials
${'='.repeat(60)}
  Password (all users): ${SEED_PASSWORD}

  student1@edutech.com   →  /dashboard/student-dashboard
  teacher1@edutech.com   →  /dashboard/teacher-dashboard
  orgadmin@edutech.com   →  /dashboard/admin-dashboard

  UI:    http://localhost:5173/login
  API:   http://127.0.0.1:3000/api/v1/health

  Start: cd eduOs_api && npm run dev
         cd eduOs_ui  && npm run dev
${'='.repeat(60)}
`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log('\n[EduTest Pro] Phase 1 Seed — wipe & fresh insert\n');

  console.log('STEP 1/4 — Delete all existing records');
  await resetDatabase();

  console.log('\nSTEP 2/4 — RBAC (roles & permissions)');
  await seedRbac();

  console.log('\nSTEP 3/4 — Organization, users & examination');
  const ctx = await seedOrgAndUsers();
  await seedExamination(ctx);

  console.log('\nSTEP 4/4 — Platform modules');
  await seedPlatform(ctx);

  printSummary();
  await pool.end();
}

main().catch((err) => {
  console.error('\nSeed failed:', err);
  process.exit(1);
});
