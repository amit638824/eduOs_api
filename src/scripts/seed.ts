/**
 * =============================================================================
 * EduTech Multi-Vendor Exam Platform — SINGLE SEED FILE
 * =============================================================================
 *
 * Hierarchy seeded here:
 *   Super Admin
 *     → Organizations (verified / pending)
 *       → Branches → Departments
 *       → Users (org_admin, teachers, students, …)
 *       → Roles → Permissions
 *       → Department → Subject → Chapter → Topic → Questions → Tests
 *
 * USAGE
 *   npm run db:seed       # wipe all data + insert fresh demo
 *   npm run db:setup      # migrate + seed
 *
 * Edit ONLY this file for demo data.
 * =============================================================================
 */
import 'dotenv/config';
import type { PoolClient } from 'pg';
import { pool, withTransaction } from '../config/database.js';
import { hashPassword } from '../utils/security.js';

// =============================================================================
// ▼▼▼  EDIT YOUR DEMO DATA HERE  ▼▼▼
// =============================================================================

const SEED_PASSWORD = 'Test@12345';

/**
 * Multi-vendor orgs.
 * isActive=false = registered but NOT verified (cannot act until super admin verifies).
 */
const ORGANIZATIONS = [
  {
    key: 'sca' as const,
    name: 'Super Computer Academy',
    slug: 'super-computer-academy',
    isActive: true,
    theme: { primaryColor: '#2563eb', secondaryColor: '#1e40af' },
    locale: { timezone: 'Asia/Kolkata', currency: 'INR', language: 'en' },
    branches: [
      {
        key: 'main' as const,
        name: 'Kerakat Campus',
        code: 'SCA-MAIN',
        address: 'Behind Maa Kali Temple, Near S.L.B.S School, Kerakat, Jaunpur, UP',
      },
      {
        key: 'city' as const,
        name: 'Jaunpur Branch',
        code: 'SCA-JNP',
        address: 'Kerakat Road, Jaunpur, UP',
      },
    ],
    departments: [
      { branchKey: 'main' as const, name: 'Computer Science', code: 'CS' },
      { branchKey: 'main' as const, name: 'Hardware & Networking', code: 'HW' },
      { branchKey: 'city' as const, name: 'Office Automation', code: 'OA' },
    ],
    academicSession: {
      name: '2025-26',
      startDate: '2025-04-01',
      endDate: '2026-03-31',
      isCurrent: true,
    },
  },
  {
    key: 'pending' as const,
    name: 'Sunrise Learning Hub',
    slug: 'sunrise-learning-hub',
    isActive: false,
    theme: { primaryColor: '#059669', secondaryColor: '#047857' },
    locale: { timezone: 'Asia/Kolkata', currency: 'INR', language: 'en' },
    branches: [
      {
        key: 'hq' as const,
        name: 'Head Office',
        code: 'SLH-HQ',
        address: 'Civil Lines, Allahabad, UP',
      },
    ],
    departments: [{ branchKey: 'hq' as const, name: 'General Studies', code: 'GS' }],
    academicSession: {
      name: '2025-26',
      startDate: '2025-04-01',
      endDate: '2026-03-31',
      isCurrent: true,
    },
  },
];

/** 'razorpay' = live keys from .env | 'demo' = mock checkout without Razorpay */
const PAYMENT_GATEWAY = {
  provider: 'demo' as 'razorpay' | 'demo',
  currency: 'INR',
  demoPayments: [
    { email: 'student1@edutech.com', amount: 999, status: 'completed' as const, ref: 'PAY-001' },
    { email: 'student2@edutech.com', amount: 500, status: 'completed' as const, ref: 'PAY-002' },
    { email: 'student3@edutech.com', amount: 299, status: 'pending' as const, ref: null },
    { email: 'student5@edutech.com', amount: 1499, status: 'completed' as const, ref: 'PAY-004' },
  ],
};

const PLATFORM_SETTINGS = {
  branding: {
    appName: 'EduTech Exam',
    parentCompany: 'EduTech',
    tagline: 'Multi-vendor online testing platform',
  },
  social_links: {
    facebook: 'https://facebook.com/supercomputeracademy',
    twitter: '',
    linkedin: '',
    instagram: '',
  },
  exam_rules: {
    negativeMarking: true,
    allowResume: false,
    calculatorAllowed: true,
    defaultDurationMinutes: 60,
  },
  integrations: {
    emailProvider: 'smtp',
    smsProvider: 'disabled',
    get paymentGateway() {
      return PAYMENT_GATEWAY.provider;
    },
  },
};

/**
 * Users — orgKey links to ORGANIZATIONS.key (null = platform super admin).
 * Pending org users stay status=pending until org is verified.
 */
const SEED_USERS = [
  // Platform
  {
    email: 'superadmin@edutech.com',
    firstName: 'Rahul',
    lastName: 'Sharma',
    phone: '9876500001',
    role: 'super_admin',
  },

  // Verified org — Super Computer Academy
  {
    email: 'orgadmin@edutech.com',
    firstName: 'Priya',
    lastName: 'Verma',
    phone: '9876500002',
    role: 'org_admin',
    orgKey: 'sca' as const,
  },
  {
    email: 'branchadmin@edutech.com',
    firstName: 'Amit',
    lastName: 'Kumar',
    phone: '9876500003',
    role: 'branch_admin',
    orgKey: 'sca' as const,
    branchCode: 'main' as const,
  },
  {
    email: 'teacher1@edutech.com',
    firstName: 'Sneha',
    lastName: 'Gupta',
    phone: '9876500004',
    role: 'teacher',
    orgKey: 'sca' as const,
    branchCode: 'main' as const,
    teacherMeta: { employeeId: 'TCH-001' },
  },
  {
    email: 'teacher2@edutech.com',
    firstName: 'Vikram',
    lastName: 'Singh',
    phone: '9876500005',
    role: 'teacher',
    orgKey: 'sca' as const,
    branchCode: 'city' as const,
    teacherMeta: { employeeId: 'TCH-002' },
  },
  {
    email: 'examiner@edutech.com',
    firstName: 'Deepak',
    lastName: 'Rao',
    phone: '9876500006',
    role: 'examiner',
    orgKey: 'sca' as const,
    branchCode: 'main' as const,
  },
  {
    email: 'evaluator@edutech.com',
    firstName: 'Kavita',
    lastName: 'Nair',
    phone: '9876500007',
    role: 'evaluator',
    orgKey: 'sca' as const,
    branchCode: 'main' as const,
  },
  {
    email: 'student1@edutech.com',
    firstName: 'Arjun',
    lastName: 'Mehta',
    phone: '9876500011',
    role: 'student',
    orgKey: 'sca' as const,
    branchCode: 'main' as const,
    studentMeta: { admissionNo: 'ADM-2025-001', batch: 'HW-2026-A', walletBalance: 500 },
  },
  {
    email: 'student2@edutech.com',
    firstName: 'Isha',
    lastName: 'Patel',
    phone: '9876500012',
    role: 'student',
    orgKey: 'sca' as const,
    branchCode: 'main' as const,
    studentMeta: { admissionNo: 'ADM-2025-002', batch: 'HW-2026-A', walletBalance: 250 },
  },
  {
    email: 'student3@edutech.com',
    firstName: 'Rohan',
    lastName: 'Das',
    phone: '9876500013',
    role: 'student',
    orgKey: 'sca' as const,
    branchCode: 'city' as const,
    studentMeta: { admissionNo: 'ADM-2025-003', batch: 'CCC-2026-B', walletBalance: 100 },
  },
  {
    email: 'student4@edutech.com',
    firstName: 'Ananya',
    lastName: 'Joshi',
    phone: '9876500014',
    role: 'student',
    orgKey: 'sca' as const,
    branchCode: 'city' as const,
    studentMeta: { admissionNo: 'ADM-2025-004', batch: 'CCC-2026-B', walletBalance: 0 },
  },
  {
    email: 'student5@edutech.com',
    firstName: 'Karan',
    lastName: 'Malhotra',
    phone: '9876500015',
    role: 'student',
    orgKey: 'sca' as const,
    branchCode: 'main' as const,
    studentMeta: { admissionNo: 'ADM-2025-005', batch: 'DIPLOMA-NET', walletBalance: 750 },
  },
  {
    email: 'parent@edutech.com',
    firstName: 'Suresh',
    lastName: 'Mehta',
    phone: '9876500020',
    role: 'parent',
    orgKey: 'sca' as const,
  },
  {
    email: 'support@edutech.com',
    firstName: 'Neha',
    lastName: 'Reddy',
    phone: '9876500030',
    role: 'support',
    orgKey: 'sca' as const,
  },
  {
    email: 'finance@edutech.com',
    firstName: 'Rajesh',
    lastName: 'Iyer',
    phone: '9876500040',
    role: 'finance',
    orgKey: 'sca' as const,
  },

  // Pending org — waiting for super-admin verification
  {
    email: 'pending.admin@sunrise.com',
    firstName: 'Meena',
    lastName: 'Yadav',
    phone: '9876500101',
    role: 'org_admin',
    orgKey: 'pending' as const,
    forceStatus: 'pending' as const,
  },
  {
    email: 'pending.teacher@sunrise.com',
    firstName: 'Ravi',
    lastName: 'Tiwari',
    phone: '9876500102',
    role: 'teacher',
    orgKey: 'pending' as const,
    branchCode: 'hq' as const,
    forceStatus: 'pending' as const,
    teacherMeta: { employeeId: 'SLH-T01' },
  },
];

const SEED_NOTIFICATIONS = [
  { email: 'student1@edutech.com', title: 'Test Assigned', body: 'PC Hardware Mock Test 1 has been assigned to you.' },
  { email: 'student1@edutech.com', title: 'Result Published', body: 'Your PC Hardware Mock Test result is now available.' },
  { email: 'teacher1@edutech.com', title: 'Question Approved', body: '8 questions approved in question bank.' },
  { email: 'orgadmin@edutech.com', title: 'Weekly Report Ready', body: 'Organization analytics report is ready.' },
  { email: 'student2@edutech.com', title: 'Payment Received', body: 'Wallet top-up of ₹500 successful.' },
  {
    email: 'superadmin@edutech.com',
    title: 'Org Pending Verification',
    body: 'Sunrise Learning Hub registered and awaits your verification.',
  },
];

/** Exam security — edit per test in liveTests[].config */
const EXAM_SECURITY_CONFIG = {
  shuffleQuestions: true,
  shuffleOptions: true,
  negativeMarking: true,
  fullScreen: true,
  browserLock: true,
  blockCopyPaste: true,
  autoSubmit: true,
  allowResume: true,
  maxTabSwitches: 3,
};

/**
 * Exam content for verified org (SCA).
 * Flow: Department → Subject → Chapter → Topic → Questions → Tests
 */
const SEED_EXAMS = {
  orgKey: 'sca' as const,
  questionCategory: 'General Aptitude',
  departments: [
    {
      code: 'HW',
      subjects: [
        {
          name: 'PC Hardware',
          code: 'HW',
          chapter: 'Computer Components',
          topic: { name: 'Hardware Basics', difficulty: 2, tags: ['hardware', 'networking'] },
          questions: [
            {
              type: 'mcq' as const,
              text: 'Which device is known as the brain of the computer?',
              options: [
                { text: 'RAM', correct: false },
                { text: 'CPU', correct: true },
                { text: 'HDD', correct: false },
                { text: 'Monitor', correct: false },
              ],
            },
            {
              type: 'mcq' as const,
              text: 'What does RAM stand for?',
              options: [
                { text: 'Read Access Memory', correct: false },
                { text: 'Random Access Memory', correct: true },
                { text: 'Run All Memory', correct: false },
                { text: 'Rapid Application Module', correct: false },
              ],
            },
            {
              type: 'mcq' as const,
              text: 'Which port is commonly used for network cables?',
              options: [
                { text: 'USB', correct: false },
                { text: 'HDMI', correct: false },
                { text: 'RJ-45', correct: true },
                { text: 'VGA', correct: false },
              ],
            },
          ],
        },
      ],
    },
    {
      code: 'OA',
      subjects: [
        {
          name: 'Computer Application',
          code: 'CA',
          chapter: 'MS Office',
          topic: { name: 'Word & Excel', difficulty: 3, tags: ['software', 'ccc'] },
          questions: [
            {
              type: 'msq' as const,
              text: 'Which are prime numbers?',
              options: [
                { text: '2', correct: true },
                { text: '4', correct: false },
                { text: '3', correct: true },
                { text: '9', correct: false },
              ],
            },
            {
              type: 'true_false' as const,
              text: 'MS Word is used for word processing.',
              options: [
                { text: 'True', correct: true },
                { text: 'False', correct: false },
              ],
            },
            {
              type: 'fill_blank' as const,
              text: 'Capital of India is ____.',
              options: [{ text: 'New Delhi', correct: true }],
            },
            {
              type: 'integer' as const,
              text: 'What is 12 + 8?',
              options: [{ value: 20, correct: true }],
            },
            {
              type: 'numerical' as const,
              text: 'Value of pi (2 decimal places)?',
              options: [{ value: 3.14, correct: true }],
            },
          ],
        },
      ],
    },
  ],
  liveTests: [
    {
      key: 'hardware-mock-1',
      subjectCode: 'HW',
      title: 'PC Hardware Mock Test 1',
      description: 'Hardware & Networking MCQs demo',
      sectionName: 'Section A',
      durationMinutes: 30,
      passingMarks: 2,
      instructions: 'Read all questions carefully. Do not switch tabs during exam.',
      config: { ...EXAM_SECURITY_CONFIG, shuffleQuestions: false },
    },
    {
      key: 'ccc-quiz',
      subjectCode: 'CA',
      title: 'CCC Practice Quiz',
      description: 'Mixed question types',
      sectionName: 'Mixed Section',
      durationMinutes: 20,
      passingMarks: 3,
      instructions: 'Attempt all questions. Negative marking applies.',
      config: { ...EXAM_SECURITY_CONFIG },
    },
  ],
  draftTests: [
    {
      title: 'Networking Draft Test',
      description: 'Draft for test builder',
      durationMinutes: 45,
      instructions: 'Not yet published',
    },
  ],
  assignments: {
    studentEmails: ['student1@edutech.com', 'student2@edutech.com', 'student3@edutech.com'],
    testKeys: ['hardware-mock-1', 'ccc-quiz'],
  },
  sampleResult: {
    studentEmail: 'student1@edutech.com',
    testKey: 'hardware-mock-1',
    certificateNo: 'CERT-STUDENT1-001',
  },
};

// =============================================================================
// RBAC — roles & permissions (inline; no external SQL files)
// =============================================================================

const RBAC_SQL = `
INSERT INTO roles (name, display_name, description, is_system) VALUES
  ('super_admin', 'Super Admin', 'Platform-wide administrator — manages all organizations', TRUE),
  ('org_admin', 'Organization Admin', 'Manages entire organization after verification', TRUE),
  ('branch_admin', 'Branch Admin', 'Manages a branch', TRUE),
  ('teacher', 'Teacher', 'Creates questions and tests under department subjects', TRUE),
  ('examiner', 'Examiner', 'Manages exam conduct', TRUE),
  ('evaluator', 'Evaluator', 'Evaluates subjective answers', TRUE),
  ('student', 'Student', 'Takes exams', TRUE),
  ('parent', 'Parent', 'Views student progress', TRUE),
  ('support', 'Support', 'Customer support staff', TRUE),
  ('finance', 'Finance', 'Handles payments and billing', TRUE)
ON CONFLICT (name) DO NOTHING;

INSERT INTO permissions (resource, action, description) VALUES
  ('organization', 'create', 'Create organizations'),
  ('organization', 'read', 'View organizations'),
  ('organization', 'update', 'Update organizations'),
  ('organization', 'delete', 'Delete organizations'),
  ('organization', 'manage', 'Full organization management'),
  ('organization', 'verify', 'Verify / activate pending organizations'),
  ('branch', 'create', 'Create branches'),
  ('branch', 'read', 'View branches'),
  ('branch', 'update', 'Update branches'),
  ('branch', 'delete', 'Delete branches'),
  ('department', 'create', 'Create departments'),
  ('department', 'read', 'View departments'),
  ('department', 'update', 'Update departments'),
  ('department', 'delete', 'Delete departments'),
  ('user', 'create', 'Create users'),
  ('user', 'read', 'View users'),
  ('user', 'update', 'Update users'),
  ('user', 'delete', 'Delete users'),
  ('user', 'assign', 'Assign roles to users'),
  ('role', 'read', 'View roles'),
  ('role', 'assign', 'Assign roles'),
  ('permission', 'read', 'View permissions'),
  ('subject', 'create', 'Create subjects'),
  ('subject', 'read', 'View subjects'),
  ('subject', 'update', 'Update subjects'),
  ('subject', 'delete', 'Delete subjects'),
  ('topic', 'create', 'Create topics'),
  ('topic', 'read', 'View topics'),
  ('topic', 'update', 'Update topics'),
  ('topic', 'delete', 'Delete topics'),
  ('question', 'create', 'Create questions'),
  ('question', 'read', 'View questions'),
  ('question', 'update', 'Update questions'),
  ('question', 'delete', 'Delete questions'),
  ('question', 'approve', 'Approve questions'),
  ('question', 'import', 'Bulk import questions'),
  ('question', 'export', 'Export questions'),
  ('test', 'create', 'Create tests'),
  ('test', 'read', 'View tests'),
  ('test', 'update', 'Update tests'),
  ('test', 'delete', 'Delete tests'),
  ('test', 'publish', 'Publish tests'),
  ('test', 'assign', 'Assign tests to students'),
  ('attempt', 'read', 'View test attempts'),
  ('attempt', 'manage', 'Manage test attempts'),
  ('result', 'read', 'View results'),
  ('result', 'export', 'Export results'),
  ('analytics', 'read', 'View analytics'),
  ('report', 'read', 'View reports'),
  ('report', 'export', 'Export reports'),
  ('payment', 'read', 'View payments'),
  ('payment', 'manage', 'Manage payments'),
  ('settings', 'read', 'View settings'),
  ('settings', 'update', 'Update settings'),
  ('audit_log', 'read', 'View audit logs')
ON CONFLICT (resource, action) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p WHERE r.name = 'super_admin'
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r
JOIN permissions p ON p.resource IN (
  'organization', 'branch', 'department', 'user', 'role', 'permission',
  'subject', 'topic', 'question', 'test',
  'attempt', 'result', 'analytics', 'report', 'settings', 'audit_log', 'payment'
) AND NOT (p.resource = 'organization' AND p.action = 'verify')
WHERE r.name = 'org_admin'
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r
JOIN permissions p ON (
  (p.resource = 'question' AND p.action IN ('create', 'read', 'update', 'import'))
  OR (p.resource = 'test' AND p.action IN ('create', 'read', 'update', 'publish', 'assign'))
  OR (p.resource IN ('subject', 'topic') AND p.action IN ('create', 'read', 'update'))
  OR (p.resource IN ('result', 'analytics', 'report') AND p.action = 'read')
) WHERE r.name = 'teacher'
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r
JOIN permissions p ON (
  (p.resource = 'test' AND p.action = 'read')
  OR (p.resource = 'attempt' AND p.action IN ('read', 'manage'))
  OR (p.resource = 'result' AND p.action = 'read')
) WHERE r.name = 'student'
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r
JOIN permissions p ON (
  p.resource IN ('branch', 'department', 'user', 'test', 'attempt', 'result', 'report', 'analytics')
  AND p.action IN ('read', 'update', 'manage', 'assign', 'create')
) WHERE r.name = 'branch_admin'
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r
JOIN permissions p ON (
  (p.resource = 'test' AND p.action IN ('read', 'update', 'publish', 'assign'))
  OR (p.resource = 'attempt' AND p.action IN ('read', 'manage'))
  OR (p.resource IN ('result', 'report') AND p.action = 'read')
) WHERE r.name = 'examiner'
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r
JOIN permissions p ON (
  (p.resource = 'question' AND p.action IN ('read', 'approve'))
  OR (p.resource IN ('attempt', 'result') AND p.action IN ('read', 'manage'))
  OR (p.resource = 'report' AND p.action = 'read')
) WHERE r.name = 'evaluator'
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r
JOIN permissions p ON (
  (p.resource IN ('result', 'report', 'analytics') AND p.action = 'read')
  OR (p.resource = 'user' AND p.action = 'read')
) WHERE r.name = 'parent'
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r
JOIN permissions p ON (
  (p.resource = 'user' AND p.action IN ('read', 'update'))
  OR (p.resource IN ('audit_log', 'report') AND p.action = 'read')
) WHERE r.name = 'support'
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r
JOIN permissions p ON (
  (p.resource = 'payment' AND p.action IN ('read', 'manage'))
  OR (p.resource IN ('report', 'user') AND p.action IN ('read', 'export'))
) WHERE r.name = 'finance'
ON CONFLICT DO NOTHING;
`;

// =============================================================================
// Types & helpers
// =============================================================================

type OrgKey = (typeof ORGANIZATIONS)[number]['key'];
type BranchKey = string;

interface SeedUser {
  email: string;
  firstName: string;
  lastName: string;
  phone: string;
  role: string;
  orgKey?: OrgKey;
  branchCode?: BranchKey;
  forceStatus?: 'active' | 'pending' | 'inactive' | 'suspended';
  studentMeta?: { admissionNo: string; batch: string; walletBalance?: number };
  teacherMeta?: { employeeId: string };
}

interface OrgContext {
  orgIds: Record<OrgKey, string>;
  branches: Record<OrgKey, Record<string, string>>;
  teacherId: string;
  orgAdminId: string;
  students: Record<string, string>;
  users: Record<string, string>;
  primaryOrgId: string;
}

type QuestionOption =
  | { text: string; correct: boolean }
  | { value: number; correct: boolean };

interface SeedQuestion {
  type: string;
  text: string;
  options: QuestionOption[];
}

// =============================================================================
// Step 0 — Wipe all data
// =============================================================================

async function resetDatabase(): Promise<void> {
  console.log('  Truncating all application tables...');
  await pool.query(`
    TRUNCATE TABLE
      certificates, results, attempt_answers, test_attempts, test_assignments,
      test_questions, test_sections, tests, question_media, question_options,
      questions, question_categories, topics, chapters, subjects,
      notifications, payments, settings, attachments, audit_logs, activity_logs,
      students, teachers, otp_codes, password_reset_tokens, refresh_tokens,
      user_roles, users, departments, academic_sessions, branches, organizations,
      role_permissions, permissions, roles
    RESTART IDENTITY CASCADE
  `);
  console.log('  All records deleted.');
}

// ---------------------------------------------------------------------------
// Step 1 — RBAC
// ---------------------------------------------------------------------------

async function seedRbac(): Promise<void> {
  await pool.query(RBAC_SQL);
  console.log('  ✓ roles, permissions & role_permissions');
}

// ---------------------------------------------------------------------------
// Step 2 — Organizations & users
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
  const orgIds = {} as Record<OrgKey, string>;
  const branches = {} as Record<OrgKey, Record<string, string>>;

  return withTransaction(async (client) => {
    for (const org of ORGANIZATIONS) {
      const row = await client.query<{ id: string }>(
        `INSERT INTO organizations (name, slug, theme, settings, is_active)
         VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [
          org.name,
          org.slug,
          JSON.stringify(org.theme),
          JSON.stringify({
            ...org.locale,
            verificationStatus: org.isActive ? 'verified' : 'pending',
          }),
          org.isActive,
        ],
      );
      const orgId = row.rows[0].id;
      orgIds[org.key] = orgId;
      branches[org.key] = {};

      for (const b of org.branches) {
        const br = await client.query<{ id: string }>(
          `INSERT INTO branches (organization_id, name, code, address) VALUES ($1, $2, $3, $4) RETURNING id`,
          [orgId, b.name, b.code, b.address],
        );
        branches[org.key][b.key] = br.rows[0].id;
      }

      for (const d of org.departments) {
        await client.query(`INSERT INTO departments (branch_id, name, code) VALUES ($1, $2, $3)`, [
          branches[org.key][d.branchKey],
          d.name,
          d.code,
        ]);
      }

      const s = org.academicSession;
      await client.query(
        `INSERT INTO academic_sessions (organization_id, name, start_date, end_date, is_current)
         VALUES ($1, $2, $3, $4, $5)`,
        [orgId, s.name, s.startDate, s.endDate, s.isCurrent],
      );

      console.log(`  + org [${org.key}] ${org.name} (${org.isActive ? 'verified' : 'PENDING'})`);
    }

    let superAdminId: string | null = null;

    for (const u of SEED_USERS as SeedUser[]) {
      const orgId = u.orgKey ? orgIds[u.orgKey] : null;
      const branchId = u.orgKey && u.branchCode ? branches[u.orgKey][u.branchCode] ?? null : null;

      let status: string = 'active';
      if (u.forceStatus) {
        status = u.forceStatus;
      } else if (u.orgKey) {
        const org = ORGANIZATIONS.find((o) => o.key === u.orgKey);
        if (org && !org.isActive) status = 'pending';
      }

      const row = await client.query<{ id: string }>(
        `INSERT INTO users (organization_id, branch_id, email, password_hash, first_name, last_name, phone, status, email_verified)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, TRUE) RETURNING id`,
        [orgId, branchId, u.email, passwordHash, u.firstName, u.lastName, u.phone, status],
      );
      const userId = row.rows[0].id;
      users[u.email] = userId;

      const roleId = await getRoleId(client, u.role);
      await client.query('INSERT INTO user_roles (user_id, role_id, assigned_by) VALUES ($1, $2, $3)', [
        userId,
        roleId,
        superAdminId,
      ]);

      if (u.role === 'student' && u.studentMeta && orgId) {
        const st = await client.query<{ id: string }>(
          `INSERT INTO students (user_id, organization_id, branch_id, admission_no, batch, wallet_balance, enrolled_at)
           VALUES ($1, $2, $3, $4, $5, $6, NOW()) RETURNING id`,
          [userId, orgId, branchId, u.studentMeta.admissionNo, u.studentMeta.batch, u.studentMeta.walletBalance ?? 0],
        );
        students[u.email] = st.rows[0].id;
      }

      if (u.role === 'teacher' && u.teacherMeta && orgId) {
        await client.query(
          `INSERT INTO teachers (user_id, organization_id, branch_id, employee_id) VALUES ($1, $2, $3, $4)`,
          [userId, orgId, branchId, u.teacherMeta.employeeId],
        );
      }

      if (u.role === 'super_admin') superAdminId = userId;
      console.log(`  + ${u.email} [${u.role}] status=${status}`);
    }

    return {
      orgIds,
      branches,
      teacherId: users['teacher1@edutech.com'],
      orgAdminId: users['orgadmin@edutech.com'],
      students,
      users,
      primaryOrgId: orgIds.sca,
    };
  });
}

// ---------------------------------------------------------------------------
// Step 3 — Examination (department → subject → topic → questions → tests)
// ---------------------------------------------------------------------------

async function insertQuestion(
  orgId: string,
  teacherId: string,
  topicId: string,
  categoryId: string | null,
  q: SeedQuestion,
): Promise<string> {
  const row = await pool.query<{ id: string }>(
    `INSERT INTO questions (organization_id, category_id, topic_id, created_by, type, status, content, marks, negative_marks, difficulty)
     VALUES ($1, $2, $3, $4, $5, 'approved', $6, 1, $7, 2) RETURNING id`,
    [
      orgId,
      categoryId,
      topicId,
      teacherId,
      q.type,
      JSON.stringify({ text: q.text }),
      EXAM_SECURITY_CONFIG.negativeMarking ? 0.25 : 0,
    ],
  );
  for (const [i, opt] of q.options.entries()) {
    const content = 'value' in opt ? { value: opt.value } : { text: opt.text };
    await pool.query(
      `INSERT INTO question_options (question_id, content, is_correct, sort_order) VALUES ($1, $2, $3, $4)`,
      [row.rows[0].id, JSON.stringify(content), opt.correct, i],
    );
  }
  return row.rows[0].id;
}

async function seedExamination(ctx: OrgContext): Promise<Record<string, string>> {
  const orgId = ctx.orgIds[SEED_EXAMS.orgKey];
  const { teacherId, students } = ctx;
  const testIds: Record<string, string> = {};
  const questionsBySubject = new Map<string, string[]>();

  const category = await pool.query<{ id: string }>(
    `INSERT INTO question_categories (organization_id, name) VALUES ($1, $2) RETURNING id`,
    [orgId, SEED_EXAMS.questionCategory],
  );
  const categoryId = category.rows[0].id;

  for (const dept of SEED_EXAMS.departments) {
    for (const subject of dept.subjects) {
      const sub = await pool.query<{ id: string }>(
        `INSERT INTO subjects (organization_id, name, code) VALUES ($1, $2, $3) RETURNING id`,
        [orgId, subject.name, subject.code],
      );
      const chapter = await pool.query<{ id: string }>(
        `INSERT INTO chapters (subject_id, name, sort_order) VALUES ($1, $2, 1) RETURNING id`,
        [sub.rows[0].id, subject.chapter],
      );
      const topic = await pool.query<{ id: string }>(
        `INSERT INTO topics (chapter_id, name, difficulty, tags, sort_order) VALUES ($1, $2, $3, $4, 1) RETURNING id`,
        [chapter.rows[0].id, subject.topic.name, subject.topic.difficulty, subject.topic.tags],
      );

      const qids: string[] = [];
      for (const q of subject.questions) {
        const useCategory = subject.code === 'CA' ? categoryId : null;
        qids.push(await insertQuestion(orgId, teacherId, topic.rows[0].id, useCategory, q));
      }
      questionsBySubject.set(subject.code, qids);
      console.log(`  + dept ${dept.code} → subject ${subject.code} → topic "${subject.topic.name}" (${qids.length} Qs)`);
    }
  }

  const totalQuestions = [...questionsBySubject.values()].reduce((n, arr) => n + arr.length, 0);

  for (const test of SEED_EXAMS.liveTests) {
    const qids = questionsBySubject.get(test.subjectCode) ?? [];
    const params: unknown[] = [
      orgId,
      teacherId,
      test.title,
      test.description,
      test.durationMinutes,
      test.passingMarks,
      test.instructions,
      qids.length,
    ];
    let sql = `INSERT INTO tests (organization_id, created_by, title, description, status, duration_minutes, passing_marks, instructions, published_at, total_marks`;
    if (test.config) {
      sql += `, config) VALUES ($1, $2, $3, $4, 'live', $5, $6, $7, NOW(), $8, $9) RETURNING id`;
      params.push(JSON.stringify(test.config));
    } else {
      sql += `) VALUES ($1, $2, $3, $4, 'live', $5, $6, $7, NOW(), $8) RETURNING id`;
    }
    const row = await pool.query<{ id: string }>(sql, params);
    testIds[test.key] = row.rows[0].id;

    const section = await pool.query<{ id: string }>(
      `INSERT INTO test_sections (test_id, name, sort_order) VALUES ($1, $2, 1) RETURNING id`,
      [row.rows[0].id, test.sectionName],
    );
    for (const [i, qid] of qids.entries()) {
      await pool.query(
        `INSERT INTO test_questions (test_id, section_id, question_id, sort_order) VALUES ($1, $2, $3, $4)`,
        [row.rows[0].id, section.rows[0].id, qid, i + 1],
      );
    }
  }

  for (const draft of SEED_EXAMS.draftTests) {
    await pool.query(
      `INSERT INTO tests (organization_id, created_by, title, description, status, duration_minutes, instructions)
       VALUES ($1, $2, $3, $4, 'draft', $5, $6)`,
      [orgId, teacherId, draft.title, draft.description, draft.durationMinutes, draft.instructions],
    );
  }

  for (const email of SEED_EXAMS.assignments.studentEmails) {
    const sid = students[email];
    if (!sid) continue;
    for (const key of SEED_EXAMS.assignments.testKeys) {
      const tid = testIds[key];
      if (!tid) continue;
      await pool.query(
        `INSERT INTO test_assignments (test_id, assignee_type, assignee_id) VALUES ($1, 'student', $2)`,
        [tid, sid],
      );
    }
  }

  const sample = SEED_EXAMS.sampleResult;
  const sampleTestId = testIds[sample.testKey];
  const student1Id = students[sample.studentEmail];
  const sampleQids =
    questionsBySubject.get(SEED_EXAMS.liveTests.find((t) => t.key === sample.testKey)?.subjectCode ?? 'HW') ?? [];

  if (sampleTestId && student1Id && sampleQids.length > 0) {
    const attempt = await pool.query<{ id: string }>(
      `INSERT INTO test_attempts (test_id, student_id, status, submitted_at, time_spent_sec)
       VALUES ($1, $2, 'submitted', NOW() - INTERVAL '2 days', 1200) RETURNING id`,
      [sampleTestId, student1Id],
    );

    let totalScore = 0;
    let correct = 0;
    for (const qid of sampleQids) {
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

    const testTitle = SEED_EXAMS.liveTests.find((t) => t.key === sample.testKey)?.title ?? 'Mock Test';
    const result = await pool.query<{ id: string }>(
      `INSERT INTO results (attempt_id, student_id, test_id, total_score, max_score, percentage, accuracy, rank, percentile, analysis)
       VALUES ($1, $2, $3, $4, $5, 100, 100, 1, 100, $6) RETURNING id`,
      [
        attempt.rows[0].id,
        student1Id,
        sampleTestId,
        totalScore,
        sampleQids.length,
        JSON.stringify({ correct, total: sampleQids.length }),
      ],
    );

    await pool.query(
      `INSERT INTO certificates (result_id, student_id, certificate_no, metadata) VALUES ($1, $2, $3, $4)`,
      [result.rows[0].id, student1Id, sample.certificateNo, JSON.stringify({ testTitle })],
    );
  }

  console.log(
    `  + ${totalQuestions} questions, ${SEED_EXAMS.liveTests.length + SEED_EXAMS.draftTests.length} tests, assignments, 1 sample result`,
  );
  return testIds;
}

// ---------------------------------------------------------------------------
// Step 4 — Platform (settings, payments, notifications)
// ---------------------------------------------------------------------------

async function seedPlatform(ctx: OrgContext): Promise<void> {
  const settingsEntries = [
    { key: 'branding', value: PLATFORM_SETTINGS.branding },
    { key: 'social_links', value: PLATFORM_SETTINGS.social_links },
    { key: 'exam_rules', value: PLATFORM_SETTINGS.exam_rules },
    { key: 'integrations', value: PLATFORM_SETTINGS.integrations },
  ];
  for (const s of settingsEntries) {
    await pool.query(`INSERT INTO settings (organization_id, key, value) VALUES ($1, $2, $3)`, [
      ctx.primaryOrgId,
      s.key,
      JSON.stringify(s.value),
    ]);
  }

  // Platform-level branding (org_id null) for super admin console
  await pool.query(`INSERT INTO settings (organization_id, key, value) VALUES (NULL, 'branding', $1)`, [
    JSON.stringify(PLATFORM_SETTINGS.branding),
  ]);

  for (const n of SEED_NOTIFICATIONS) {
    const uid = ctx.users[n.email];
    if (!uid) continue;
    await pool.query(
      `INSERT INTO notifications (user_id, channel, title, body, sent_at) VALUES ($1, 'in_app', $2, $3, NOW())`,
      [uid, n.title, n.body],
    );
  }

  for (const p of PAYMENT_GATEWAY.demoPayments) {
    const uid = ctx.users[p.email];
    if (!uid) continue;
    await pool.query(
      `INSERT INTO payments (organization_id, user_id, amount, currency, status, gateway_ref, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        ctx.primaryOrgId,
        uid,
        p.amount,
        PAYMENT_GATEWAY.currency,
        p.status,
        p.ref,
        JSON.stringify({ source: 'seed', gateway: PAYMENT_GATEWAY.provider }),
      ],
    );
  }

  const audits = [
    { action: 'create', resource: 'test', userId: ctx.teacherId },
    { action: 'approve', resource: 'question', userId: ctx.teacherId },
    { action: 'assign', resource: 'test', userId: ctx.orgAdminId },
    { action: 'login', resource: 'session', userId: ctx.users['student1@edutech.com'] },
    { action: 'export', resource: 'report', userId: ctx.orgAdminId },
    {
      action: 'register',
      resource: 'organization',
      userId: ctx.users['superadmin@edutech.com'],
    },
  ];
  for (const a of audits) {
    if (!a.userId) continue;
    await pool.query(
      `INSERT INTO audit_logs (organization_id, user_id, action, resource, ip_address) VALUES ($1, $2, $3, $4, '127.0.0.1')`,
      [ctx.primaryOrgId, a.userId, a.action, a.resource],
    );
  }

  const activities = [
    { userId: ctx.users['student1@edutech.com'], activity: 'test_started', meta: { test: 'PC Hardware Mock Test' } },
    { userId: ctx.users['student1@edutech.com'], activity: 'test_submitted', meta: { test: 'PC Hardware Mock Test' } },
    { userId: ctx.users['teacher1@edutech.com'], activity: 'question_created', meta: { count: 8 } },
    { userId: ctx.users['orgadmin@edutech.com'], activity: 'user_created', meta: { role: 'student' } },
  ];
  for (const act of activities) {
    if (!act.userId) continue;
    await pool.query(
      `INSERT INTO activity_logs (user_id, activity, metadata, ip_address) VALUES ($1, $2, $3, '127.0.0.1')`,
      [act.userId, act.activity, JSON.stringify(act.meta)],
    );
  }

  console.log(
    `  + settings, ${SEED_NOTIFICATIONS.length} notifications, ${PAYMENT_GATEWAY.demoPayments.length} payments (gateway: ${PAYMENT_GATEWAY.provider})`,
  );
}

// ---------------------------------------------------------------------------
// Summary & main
// ---------------------------------------------------------------------------

function printSummary(): void {
  console.log(`
${'='.repeat(60)}
  SEED COMPLETE — Multi-Vendor Demo Credentials
${'='.repeat(60)}
  Password (all users): ${SEED_PASSWORD}
  Payment gateway:      ${PAYMENT_GATEWAY.provider}

  Hierarchy:
    Super Admin → Organizations → Departments → Users → Roles
    Department → Subject → Topic → Questions → Tests

  Login accounts:
    superadmin@edutech.com     platform super admin
    orgadmin@edutech.com       verified org admin (SCA)
    teacher1@edutech.com       teacher
    student1@edutech.com       student
    pending.admin@sunrise.com  PENDING org (is_active=false)

  UI:    http://localhost:5173/login
  API:   http://127.0.0.1:3000/api/v1/health

  Edit data only in: eduOs_api/src/scripts/seed.ts
${'='.repeat(60)}
`);
}

async function main(): Promise<void> {
  console.log('\n[EduTech] Multi-vendor seed — wipe & fresh insert (single file)\n');

  console.log('STEP 1/4 — Delete all existing records');
  await resetDatabase();

  console.log('\nSTEP 2/4 — RBAC (roles & permissions)');
  await seedRbac();

  console.log('\nSTEP 3/4 — Organizations, users & examination');
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
