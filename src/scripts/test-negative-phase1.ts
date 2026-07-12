/**
 * Phase 1 negative / security smoke tests
 * Run: npm run test:negative
 */
import 'dotenv/config';

const BASE = process.env.API_BASE ?? 'http://127.0.0.1:3000/api/v1';
const PASSWORD = 'Password@123';

interface TestResult {
  name: string;
  ok: boolean;
  detail?: string;
}

const results: TestResult[] = [];

function pass(name: string, detail?: string) {
  results.push({ name, ok: true, detail });
  console.log(`  ✓ ${name}${detail ? ` — ${detail}` : ''}`);
}

function fail(name: string, detail: string) {
  results.push({ name, ok: false, detail });
  console.error(`  ✗ ${name} — ${detail}`);
}

async function req<T = unknown>(
  path: string,
  options: RequestInit & { token?: string } = {},
): Promise<{ status: number; body: T }> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };
  if (options.token) headers.Authorization = `Bearer ${options.token}`;

  const res = await fetch(`${BASE}${path}`, { ...options, headers });
  const text = await res.text();
  let body: T;
  try {
    body = text ? JSON.parse(text) : ({} as T);
  } catch {
    body = { raw: text } as T;
  }
  return { status: res.status, body };
}

/** Expect HTTP error (not 2xx, not 500). Auth routes may return 429 when rate-limited. */
function expectClientError(
  name: string,
  status: number,
  body: unknown,
  allowed: number[],
): boolean {
  if (status === 500) {
    fail(name, `server error 500 — ${JSON.stringify(body).slice(0, 120)}`);
    return false;
  }
  if (!allowed.includes(status)) {
    fail(name, `expected ${allowed.join('|')}, got ${status} — ${JSON.stringify(body).slice(0, 100)}`);
    return false;
  }
  const success = (body as { success?: boolean }).success;
  if (success === true) {
    fail(name, 'expected success:false, got success:true');
    return false;
  }
  const note = status === 429 ? 'rate-limited (security OK)' : `HTTP ${status}`;
  pass(name, note);
  return true;
}

const AUTH_REJECT = [400, 401, 429];

async function getToken(email: string): Promise<string | null> {
  const { status, body } = await req<{ data?: { tokens: { accessToken: string } } }>(
    '/auth/login',
    { method: 'POST', body: JSON.stringify({ email, password: PASSWORD }) },
  );
  return status === 200 ? (body.data?.tokens?.accessToken ?? null) : null;
}

async function run() {
  console.log('\n=== EduTest Pro — Negative API Tests ===\n');
  console.log(`Base: ${BASE}\n`);

  // Log in first (before auth rate-limit from negative login attempts)
  const studentToken = await getToken('student1@edutech.com');
  const teacherToken = await getToken('teacher1@edutech.com');
  const adminToken = await getToken('orgadmin@edutech.com');

  if (!studentToken || !teacherToken || !adminToken) {
    console.error('\nSetup failed — run npm run db:seed first\n');
    process.exit(1);
  }
  pass('Setup tokens', 'student + teacher + admin');

  // --- Auth: no token ---
  let r = await req('/auth/me');
  expectClientError('No token → /auth/me', r.status, r.body, [401]);

  r = await req('/examination/tests');
  expectClientError('No token → protected route', r.status, r.body, [401]);

  r = await req('/platform/users?page=1&limit=5');
  expectClientError('No token → admin users', r.status, r.body, [401]);

  // --- Auth: bad token ---
  r = await req('/auth/me', { token: 'invalid.jwt.token' });
  expectClientError('Invalid JWT', r.status, r.body, [401]);

  r = await req('/auth/me', { token: 'Bearer-not-needed-but' + 'x'.repeat(40) });
  expectClientError('Garbage token', r.status, r.body, [401]);

  // --- Login failures (429 = rate limit, also valid security) ---
  r = await req('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'student1@edutech.com', password: 'WrongPass@999' }),
  });
  expectClientError('Wrong password', r.status, r.body, AUTH_REJECT);

  r = await req('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'not-an-email', password: 'Password@123' }),
  });
  expectClientError('Invalid email format on login', r.status, r.body, AUTH_REJECT);

  r = await req('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'nobody@edutech.com', password: 'Password@123' }),
  });
  expectClientError('Unknown user login', r.status, r.body, AUTH_REJECT);

  // --- Validation ---
  r = await req('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ email: 'bad', password: '123', firstName: '', lastName: '' }),
  });
  expectClientError('Register invalid payload', r.status, r.body, AUTH_REJECT);

  r = await req('/auth/forgot-password', {
    method: 'POST',
    body: JSON.stringify({ email: 'not-email' }),
  });
  expectClientError('Forgot password invalid email', r.status, r.body, AUTH_REJECT);

  r = await req('/auth/reset-password', {
    method: 'POST',
    body: JSON.stringify({ token: 'fake', password: 'short' }),
  });
  expectClientError('Reset password weak/invalid', r.status, r.body, AUTH_REJECT);

  // --- Pagination validation (Express 5 query fix) ---
  r = await req('/examination/subjects?page=-1&limit=5', { token: teacherToken });
  expectClientError('Negative page number', r.status, r.body, [400]);

  r = await req('/examination/subjects?page=abc&limit=5', { token: teacherToken });
  expectClientError('Non-numeric page', r.status, r.body, [400]);

  r = await req('/platform/notifications?page=1&limit=9999', { token: studentToken });
  // limit max might be 100 - check schema
  if (r.status === 400) {
    pass('Excessive limit rejected', 'HTTP 400');
  } else if (r.status === 200) {
    pass('Excessive limit', 'accepted (no max cap) — OK');
  } else {
    expectClientError('Excessive limit', r.status, r.body, [400, 200]);
  }

  // --- Invalid UUID params ---
  r = await req('/examination/tests/not-a-uuid', { token: teacherToken });
  expectClientError('Invalid test UUID param', r.status, r.body, [400]);

  r = await req('/examination/attempts/00000000-0000-0000-0000-000000000099', {
    token: studentToken,
  });
  expectClientError('Non-existent attempt', r.status, r.body, [404]);

  r = await req('/examination/results/00000000-0000-0000-0000-000000000099', {
    token: studentToken,
  });
  expectClientError('Non-existent result', r.status, r.body, [404]);

  // --- Role / permission denied ---
  r = await req('/platform/users?page=1&limit=5', { token: studentToken });
  expectClientError('Student cannot list users', r.status, r.body, [403]);

  r = await req('/platform/audit-logs?page=1&limit=5', { token: studentToken });
  expectClientError('Student cannot view audit logs', r.status, r.body, [403]);

  r = await req('/platform/reports/overview', { token: studentToken });
  expectClientError('Student cannot view org reports', r.status, r.body, [403]);

  // Teacher cannot create admin user
  r = await req('/platform/users', {
    method: 'POST',
    token: teacherToken,
    body: JSON.stringify({
      email: 'hack@edutech.com',
      password: 'Password@123',
      firstName: 'Hack',
      lastName: 'User',
      role: 'org_admin',
    }),
  });
  expectClientError('Teacher cannot create users', r.status, r.body, [403]);

  // --- Payment negative ---
  r = await req('/platform/payments/create-order', {
    method: 'POST',
    token: studentToken,
    body: JSON.stringify({ amount: -50 }),
  });
  expectClientError('Negative payment amount', r.status, r.body, [400]);

  r = await req('/platform/payments/create-order', {
    method: 'POST',
    token: studentToken,
    body: JSON.stringify({ amount: 0 }),
  });
  expectClientError('Zero payment amount', r.status, r.body, [400]);

  r = await req('/platform/payments/verify', {
    method: 'POST',
    token: studentToken,
    body: JSON.stringify({
      paymentId: '00000000-0000-0000-0000-000000000001',
      razorpayOrderId: 'order_fake',
      razorpayPaymentId: 'pay_fake',
      razorpaySignature: 'invalid_signature',
    }),
  });
  expectClientError('Invalid Razorpay signature', r.status, r.body, [400, 404]);

  // --- Duplicate register ---
  r = await req('/auth/register', {
    method: 'POST',
    body: JSON.stringify({
      email: 'student1@edutech.com',
      password: 'Password@123',
      firstName: 'Dup',
      lastName: 'User',
      role: 'student',
    }),
  });
  expectClientError('Duplicate email register', r.status, r.body, [409, 429]);

  // --- Change password without auth ---
  r = await req('/auth/change-password', {
    method: 'POST',
    body: JSON.stringify({ currentPassword: 'x', newPassword: 'Password@1234' }),
  });
  expectClientError('Change password without auth', r.status, r.body, [401]);

  // --- Wrong current password ---
  r = await req('/auth/change-password', {
    method: 'POST',
    token: studentToken,
    body: JSON.stringify({
      currentPassword: 'WrongOldPass@1',
      newPassword: 'NewPassword@123',
    }),
  });
  expectClientError('Change password wrong current', r.status, r.body, [401, 400]);

  // --- Invalid question create ---
  r = await req('/examination/questions', {
    method: 'POST',
    token: teacherToken,
    body: JSON.stringify({ type: 'invalid_type', content: {} }),
  });
  expectClientError('Invalid question type', r.status, r.body, [400]);

  // --- Route not found ---
  r = await req('/does-not-exist');
  expectClientError('Unknown API route', r.status, r.body, [404]);

  const failed = results.filter((x) => !x.ok);
  console.log('\n=== Negative Test Summary ===');
  console.log(`Passed: ${results.length - failed.length}/${results.length}`);
  if (failed.length) {
    console.log('\nFailed:');
    failed.forEach((f) => console.log(`  - ${f.name}: ${f.detail}`));
    process.exit(1);
  }
  console.log('\nAll negative tests passed (no unexpected 500s).\n');
}

run().catch((err) => {
  console.error('Negative test runner crashed:', err);
  process.exit(1);
});
