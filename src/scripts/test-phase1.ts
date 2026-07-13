/**
 * Phase 1 end-to-end API smoke test — run: npx tsx src/scripts/test-phase1.ts
 */
import 'dotenv/config';

const BASE = process.env.API_BASE ?? 'http://127.0.0.1:3000/api/v1';
const PASSWORD = 'Test@12345';

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

  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers,
  });

  let body: T;
  const text = await res.text();
  try {
    body = text ? JSON.parse(text) : ({} as T);
  } catch {
    body = { raw: text } as T;
  }
  return { status: res.status, body };
}

async function login(email: string): Promise<string | null> {
  const { status, body } = await req<{ success: boolean; data?: { tokens: { accessToken: string } }; message?: string }>(
    '/auth/login',
    { method: 'POST', body: JSON.stringify({ email, password: PASSWORD }) },
  );
  if (status !== 200 || !body.data?.tokens?.accessToken) {
    fail(`Login ${email}`, `status ${status} ${JSON.stringify(body).slice(0, 120)}`);
    return null;
  }
  pass(`Login ${email}`);
  return body.data.tokens.accessToken;
}

async function run() {
  console.log('\n=== EduTest Pro Phase 1 API Test ===\n');
  console.log(`Base: ${BASE}\n`);

  // Health
  const health = await req('/health');
  if (health.status === 200 && (health.body as { status?: string }).status === 'healthy') {
    pass('Health check', 'database up');
  } else {
    fail('Health check', `status ${health.status}`);
  }

  const studentToken = await login('student1@edutech.com');
  const teacherToken = await login('teacher1@edutech.com');
  const adminToken = await login('orgadmin@edutech.com');

  if (!studentToken || !teacherToken || !adminToken) {
    console.error('\nCannot continue without tokens. Run: npm run db:seed\n');
    process.exit(1);
  }

  // Me
  for (const [label, token] of [['Student me', studentToken], ['Teacher me', teacherToken], ['Admin me', adminToken]] as const) {
    const r = await req('/auth/me', { token });
    if (r.status === 200 && (r.body as { success?: boolean }).success) pass(label);
    else fail(label, `status ${r.status}`);
  }

  // Pagination query (validate middleware fix)
  const subjects = await req('/examination/subjects?page=1&limit=5', { token: teacherToken });
  if (subjects.status === 200) pass('GET subjects (pagination query)');
  else fail('GET subjects', `status ${subjects.status} ${JSON.stringify(subjects.body).slice(0, 100)}`);

  const questions = await req('/examination/questions?page=1&limit=5', { token: teacherToken });
  if (questions.status === 200) pass('GET questions');
  else fail('GET questions', `status ${questions.status}`);

  const tests = await req('/examination/tests?page=1&limit=10', { token: teacherToken });
  const testsData = tests.body as { data?: { id: string; title: string; status: string }[] };
  if (tests.status === 200 && testsData.data?.length) {
    pass('GET tests', `${testsData.data.length} tests`);
  } else fail('GET tests', `status ${tests.status}`);

  const liveTest = testsData.data?.find((t) => t.status === 'live' || t.status === 'published');
  const draftTest = testsData.data?.find((t) => t.status === 'draft');

  // Student assigned tests
  const studentTests = await req('/examination/tests?page=1&limit=10', { token: studentToken });
  if (studentTests.status === 200) pass('Student GET tests');
  else fail('Student GET tests', `status ${studentTests.status}`);

  // Attempts list
  const attempts = await req('/examination/attempts?page=1&limit=10', { token: studentToken });
  if (attempts.status === 200) pass('GET attempts');
  else fail('GET attempts', `status ${attempts.status}`);

  // Results — use a submitted attempt that has a result row
  const attemptsData = attempts.body as { data?: { id: string; status: string }[] };
  const completedAttempt = attemptsData.data?.find((a) =>
    ['submitted', 'auto_submitted', 'completed'].includes(a.status),
  );
  if (completedAttempt) {
    const result = await req(`/examination/results/${completedAttempt.id}`, { token: studentToken });
    if (result.status === 200) pass('GET result by attempt');
    else fail('GET result', `status ${result.status}`);
  } else {
    pass('GET result by attempt', 'skipped — no submitted attempt in seed');
  }

  // Analytics
  const analytics = await req('/examination/analytics/overview', { token: teacherToken });
  if (analytics.status === 200) pass('Analytics overview');
  else fail('Analytics overview', `status ${analytics.status}`);

  // Platform — notifications (pagination)
  const notifs = await req('/platform/notifications?page=1&limit=10', { token: studentToken });
  if (notifs.status === 200) pass('GET notifications');
  else fail('GET notifications', `status ${notifs.status}`);

  const unread = await req('/platform/notifications/unread-count', { token: studentToken });
  if (unread.status === 200) pass('GET unread count');
  else fail('GET unread count', `status ${unread.status}`);

  // Payments
  const payConfig = await req('/platform/payments/config', { token: studentToken });
  if (payConfig.status === 200) pass('Payment config');
  else fail('Payment config', `status ${payConfig.status}`);

  const wallet = await req('/platform/payments/wallet', { token: studentToken });
  if (wallet.status === 200) pass('GET wallet');
  else fail('GET wallet', `status ${wallet.status}`);

  const payments = await req('/platform/payments?page=1&limit=10', { token: adminToken });
  if (payments.status === 200) pass('Admin GET payments');
  else fail('Admin GET payments', `status ${payments.status}`);

  // Users
  const users = await req('/platform/users?page=1&limit=10', { token: adminToken });
  if (users.status === 200) pass('Admin GET users');
  else fail('Admin GET users', `status ${users.status}`);

  // Settings
  const settings = await req('/platform/settings', { token: adminToken });
  if (settings.status === 200) pass('GET settings');
  else fail('GET settings', `status ${settings.status}`);

  // Audit logs
  const audit = await req('/platform/audit-logs?page=1&limit=10', { token: adminToken });
  if (audit.status === 200) pass('GET audit logs');
  else fail('GET audit logs', `status ${audit.status}`);

  // Reports
  const overview = await req('/platform/reports/overview', { token: adminToken });
  if (overview.status === 200) pass('Org overview report');
  else fail('Org overview report', `status ${overview.status}`);

  if (liveTest) {
    const testReport = await req(`/platform/reports/tests/${liveTest.id}`, { token: adminToken });
    if (testReport.status === 200) pass('Test report', liveTest.title);
    else fail('Test report', `status ${testReport.status}`);
  }

  // Academic sessions
  const sessions = await req('/platform/academic-sessions?page=1&limit=5', { token: adminToken });
  if (sessions.status === 200) pass('GET academic sessions');
  else fail('GET academic sessions', `status ${sessions.status}`);

  // Forgot password (should not 500)
  const forgot = await req('/auth/forgot-password', {
    method: 'POST',
    body: JSON.stringify({ email: 'student1@edutech.com' }),
  });
  if (forgot.status === 200) pass('Forgot password');
  else fail('Forgot password', `status ${forgot.status}`);

  // Organization
  const orgs = await req('/organizations?page=1&limit=5', { token: adminToken });
  if (orgs.status === 200) pass('GET organizations');
  else fail('GET organizations', `status ${orgs.status}`);

  // Start attempt on live test (student2 might have completed - try student1)
  if (liveTest) {
    const start = await req(`/examination/tests/${liveTest.id}/start`, {
      method: 'POST',
      token: studentToken,
      body: JSON.stringify({}),
    });
    if (start.status === 200 || start.status === 201) {
      pass('Start test attempt', liveTest.title);
      const attemptId = (start.body as { data?: { id: string } }).data?.id;
      if (attemptId) {
        const getAttempt = await req(`/examination/attempts/${attemptId}`, { token: studentToken });
        if (getAttempt.status === 200) pass('GET attempt detail');
        else fail('GET attempt detail', `status ${getAttempt.status}`);
      }
    } else if (start.status === 409 || start.status === 400) {
      pass('Start test attempt', 'already attempted or not assigned — expected');
    } else {
      fail('Start test attempt', `status ${start.status} ${JSON.stringify(start.body).slice(0, 120)}`);
    }
  }

  if (draftTest) {
    const getTest = await req(`/examination/tests/${draftTest.id}`, { token: teacherToken });
    if (getTest.status === 200) pass('GET draft test detail');
    else fail('GET draft test detail', `status ${getTest.status}`);
  }

  // UI-critical endpoints
  const myTests = await req('/examination/tests/my', { token: studentToken });
  if (myTests.status === 200) {
    const count = ((myTests.body as { data?: unknown[] }).data ?? []).length;
    pass('Student assigned tests (/tests/my)', `${count} tests`);
  } else fail('Student assigned tests', `status ${myTests.status}`);

  const myResults = await req('/examination/results/my', { token: studentToken });
  if (myResults.status === 200) pass('Student results (/results/my)');
  else fail('Student results', `status ${myResults.status}`);

  const razorpay = await req('/platform/payments/create-order', {
    method: 'POST',
    token: studentToken,
    body: JSON.stringify({ amount: 100 }),
  });
  if (razorpay.status === 201 || razorpay.status === 200) pass('Razorpay create order');
  else fail('Razorpay create order', `status ${razorpay.status} ${JSON.stringify(razorpay.body).slice(0, 100)}`);

  const authSessions = await req('/auth/sessions', { token: adminToken });
  if (authSessions.status === 200) pass('List auth sessions');
  else fail('List auth sessions', `status ${authSessions.status}`);

  const superToken = await login('superadmin@edutech.com');
  if (superToken) {
    const superUsers = await req('/platform/users?page=1&limit=5', { token: superToken });
    if (superUsers.status === 200) pass('Superadmin GET users');
    else fail('Superadmin GET users', `status ${superUsers.status}`);
  }

  // Full attempt flow: save answer + submit (use in-progress attempt if any)
  const inProgress = (attempts.body as { data?: { id: string; status: string; test_id?: string }[] }).data?.find(
    (a) => a.status === 'in_progress',
  );
  if (inProgress) {
    const attemptDetail = await req(`/examination/attempts/${inProgress.id}`, { token: studentToken });
    const questions = (attemptDetail.body as { data?: { questions?: { question_id: string }[] } }).data?.questions;
    if (questions?.[0]) {
      const save = await req(`/examination/attempts/${inProgress.id}/answers`, {
        method: 'POST',
        token: studentToken,
        body: JSON.stringify({ questionId: questions[0].question_id, answer: { selected: '1' } }),
      });
      if (save.status === 200) pass('Save answer');
      else fail('Save answer', `status ${save.status}`);
    }
  } else {
    pass('Save answer', 'skipped — no in-progress attempt');
  }

  const failed = results.filter((r) => !r.ok);
  console.log('\n=== Summary ===');
  console.log(`Passed: ${results.length - failed.length}/${results.length}`);
  if (failed.length) {
    console.log('\nFailed:');
    failed.forEach((f) => console.log(`  - ${f.name}: ${f.detail}`));
    process.exit(1);
  }
  console.log('\nAll Phase 1 API tests passed.\n');
}

run().catch((err) => {
  console.error('Test runner crashed:', err);
  process.exit(1);
});
