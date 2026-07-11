import 'dotenv/config';
import { PoolClient } from 'pg';
import { pool, withTransaction } from '../config/database.js';
import { hashPassword } from '../utils/security.js';

const SEED_PASSWORD = 'Password@123';

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

const SEED_USERS: SeedUser[] = [
  {
    email: 'superadmin@edutech.com',
    firstName: 'Rahul',
    lastName: 'Sharma',
    phone: '9876500001',
    role: 'super_admin',
  },
  {
    email: 'orgadmin@edutech.com',
    firstName: 'Priya',
    lastName: 'Verma',
    phone: '9876500002',
    role: 'org_admin',
  },
  {
    email: 'branchadmin@edutech.com',
    firstName: 'Amit',
    lastName: 'Kumar',
    phone: '9876500003',
    role: 'branch_admin',
    branchCode: 'main',
  },
  {
    email: 'teacher1@edutech.com',
    firstName: 'Sneha',
    lastName: 'Gupta',
    phone: '9876500004',
    role: 'teacher',
    branchCode: 'main',
    teacherMeta: { employeeId: 'TCH-001' },
  },
  {
    email: 'teacher2@edutech.com',
    firstName: 'Vikram',
    lastName: 'Singh',
    phone: '9876500005',
    role: 'teacher',
    branchCode: 'city',
    teacherMeta: { employeeId: 'TCH-002' },
  },
  {
    email: 'examiner@edutech.com',
    firstName: 'Deepak',
    lastName: 'Rao',
    phone: '9876500006',
    role: 'examiner',
    branchCode: 'main',
  },
  {
    email: 'evaluator@edutech.com',
    firstName: 'Kavita',
    lastName: 'Nair',
    phone: '9876500007',
    role: 'evaluator',
    branchCode: 'main',
  },
  {
    email: 'student1@edutech.com',
    firstName: 'Arjun',
    lastName: 'Mehta',
    phone: '9876500011',
    role: 'student',
    branchCode: 'main',
    studentMeta: { admissionNo: 'ADM-2025-001', batch: 'JEE-2026-A', walletBalance: 500 },
  },
  {
    email: 'student2@edutech.com',
    firstName: 'Isha',
    lastName: 'Patel',
    phone: '9876500012',
    role: 'student',
    branchCode: 'main',
    studentMeta: { admissionNo: 'ADM-2025-002', batch: 'JEE-2026-A', walletBalance: 250 },
  },
  {
    email: 'student3@edutech.com',
    firstName: 'Rohan',
    lastName: 'Das',
    phone: '9876500013',
    role: 'student',
    branchCode: 'city',
    studentMeta: { admissionNo: 'ADM-2025-003', batch: 'NEET-2026-B', walletBalance: 100 },
  },
  {
    email: 'student4@edutech.com',
    firstName: 'Ananya',
    lastName: 'Joshi',
    phone: '9876500014',
    role: 'student',
    branchCode: 'city',
    studentMeta: { admissionNo: 'ADM-2025-004', batch: 'NEET-2026-B', walletBalance: 0 },
  },
  {
    email: 'student5@edutech.com',
    firstName: 'Karan',
    lastName: 'Malhotra',
    phone: '9876500015',
    role: 'student',
    branchCode: 'main',
    studentMeta: { admissionNo: 'ADM-2025-005', batch: 'FOUNDATION-10', walletBalance: 750 },
  },
  {
    email: 'parent@edutech.com',
    firstName: 'Suresh',
    lastName: 'Mehta',
    phone: '9876500020',
    role: 'parent',
  },
  {
    email: 'support@edutech.com',
    firstName: 'Neha',
    lastName: 'Reddy',
    phone: '9876500030',
    role: 'support',
  },
  {
    email: 'finance@edutech.com',
    firstName: 'Rajesh',
    lastName: 'Iyer',
    phone: '9876500040',
    role: 'finance',
  },
];

async function getRoleId(client: PoolClient, roleName: string): Promise<string> {
  const result = await client.query<{ id: string }>(
    'SELECT id FROM roles WHERE name = $1',
    [roleName],
  );
  if (!result.rows[0]) {
    throw new Error(`Role not found: ${roleName}`);
  }
  return result.rows[0].id;
}

async function seedOrganizationData(client: PoolClient) {
  const orgResult = await client.query<{ id: string }>(
    `INSERT INTO organizations (name, slug, theme, settings)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
     RETURNING id`,
    [
      'EduTech Academy',
      'edutech-academy',
      JSON.stringify({ primaryColor: '#2563eb', secondaryColor: '#1e40af' }),
      JSON.stringify({ timezone: 'Asia/Kolkata', currency: 'INR', language: 'en' }),
    ],
  );
  const orgId = orgResult.rows[0].id;

  const mainBranch = await client.query<{ id: string }>(
    `INSERT INTO branches (organization_id, name, code, address)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (organization_id, code) DO UPDATE SET name = EXCLUDED.name
     RETURNING id`,
    [orgId, 'Main Campus', 'DEL-MAIN', 'Connaught Place, New Delhi'],
  );

  const cityBranch = await client.query<{ id: string }>(
    `INSERT INTO branches (organization_id, name, code, address)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (organization_id, code) DO UPDATE SET name = EXCLUDED.name
     RETURNING id`,
    [orgId, 'City Branch', 'DEL-CITY', 'Noida Sector 62, UP'],
  );

  await client.query(
    `INSERT INTO departments (branch_id, name, code)
     VALUES ($1, $2, $3)
     ON CONFLICT (branch_id, code) DO NOTHING`,
    [mainBranch.rows[0].id, 'Science', 'SCI'],
  );

  await client.query(
    `INSERT INTO departments (branch_id, name, code)
     VALUES ($1, $2, $3)
     ON CONFLICT (branch_id, code) DO NOTHING`,
    [mainBranch.rows[0].id, 'Commerce', 'COM'],
  );

  const sessionExists = await client.query(
    'SELECT id FROM academic_sessions WHERE organization_id = $1 AND name = $2',
    [orgId, '2025-26'],
  );

  if (!sessionExists.rowCount) {
    await client.query(
      `INSERT INTO academic_sessions (organization_id, name, start_date, end_date, is_current)
       VALUES ($1, $2, $3, $4, TRUE)`,
      [orgId, '2025-26', '2025-04-01', '2026-03-31'],
    );
  }

  return {
    orgId,
    branches: {
      main: mainBranch.rows[0].id,
      city: cityBranch.rows[0].id,
    },
  };
}

async function createUser(
  client: PoolClient,
  user: SeedUser,
  passwordHash: string,
  orgId: string,
  branches: { main: string; city: string },
  assignedBy: string | null,
): Promise<string | null> {
  const existing = await client.query('SELECT id FROM users WHERE email = $1', [user.email]);
  if (existing.rowCount) {
    console.log(`  skip  ${user.email} (already exists)`);
    return null;
  }

  const branchId =
    user.branchCode === 'main'
      ? branches.main
      : user.branchCode === 'city'
        ? branches.city
        : null;

  const organizationId = user.role === 'super_admin' ? null : orgId;

  const userResult = await client.query<{ id: string }>(
    `INSERT INTO users (
       organization_id, branch_id, email, password_hash,
       first_name, last_name, phone, status, email_verified
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'active', TRUE)
     RETURNING id`,
    [
      organizationId,
      branchId,
      user.email,
      passwordHash,
      user.firstName,
      user.lastName,
      user.phone,
    ],
  );

  const userId = userResult.rows[0].id;
  const roleId = await getRoleId(client, user.role);

  await client.query(
    'INSERT INTO user_roles (user_id, role_id, assigned_by) VALUES ($1, $2, $3)',
    [userId, roleId, assignedBy],
  );

  if (user.role === 'student' && user.studentMeta) {
    await client.query(
      `INSERT INTO students (
         user_id, organization_id, branch_id, admission_no, batch, wallet_balance, enrolled_at
       ) VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
      [
        userId,
        orgId,
        branchId,
        user.studentMeta.admissionNo,
        user.studentMeta.batch,
        user.studentMeta.walletBalance ?? 0,
      ],
    );
  }

  if (user.role === 'teacher' && user.teacherMeta) {
    await client.query(
      `INSERT INTO teachers (user_id, organization_id, branch_id, employee_id)
       VALUES ($1, $2, $3, $4)`,
      [userId, orgId, branchId, user.teacherMeta.employeeId],
    );
  }

  console.log(`  added ${user.email} [${user.role}]`);
  return userId;
}

export async function seedUsers(): Promise<void> {
  const passwordHash = await hashPassword(SEED_PASSWORD);

  await withTransaction(async (client) => {
    const { orgId, branches } = await seedOrganizationData(client);

    let superAdminId: string | null = null;

    for (const user of SEED_USERS) {
      const userId = await createUser(
        client,
        user,
        passwordHash,
        orgId,
        branches,
        superAdminId,
      );
      if (user.role === 'super_admin' && userId) {
        superAdminId = userId;
      }
    }
  });
}

async function main() {
  console.log('Seeding users & organization data...');
  console.log(`Default password for all users: ${SEED_PASSWORD}`);
  await seedUsers();
  console.log('User seed complete.');
  await pool.end();
}

if (process.argv[1]?.includes('seed-users')) {
  main().catch((err) => {
    console.error('User seed failed:', err);
    process.exit(1);
  });
}
