/**
 * Super Admin tenant isolation & read-only policy checks.
 * Run: npm run test:superadmin
 *
 * Requires API running (default http://localhost:4000) and seeded DB.
 */
import 'dotenv/config';

const BASE = (process.env.API_BASE_URL ?? 'http://127.0.0.1:3000').replace(/\/$/, '');
const PASSWORD = 'Test@12345';

type Json = Record<string, unknown>;

async function request(
  method: string,
  path: string,
  opts: { token?: string; orgId?: string; body?: unknown } = {},
): Promise<{ status: number; body: Json }> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
  if (opts.orgId) headers['X-Organization-Id'] = opts.orgId;
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  let body: Json = {};
  try {
    body = (await res.json()) as Json;
  } catch {
    body = {};
  }
  return { status: res.status, body };
}

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

async function login(email: string) {
  const { status, body } = await request('POST', '/api/v1/auth/login', {
    body: { email, password: PASSWORD },
  });
  assert(status === 200, `Login failed for ${email}: ${status}`);
  const data = body.data as Json;
  const tokens = data.tokens as Json | undefined;
  const token = (tokens?.accessToken ?? data.accessToken ?? data.access_token) as string;
  assert(token, `No access token for ${email}`);
  return { token, user: data.user as Json };
}

async function listOrgs(token: string) {
  const { status, body } = await request('GET', '/api/v1/organizations?page=1&limit=20', { token });
  assert(status === 200, `list orgs failed: ${status}`);
  const data = body.data as Json[] | undefined;
  assert(Array.isArray(data) && data.length >= 2, 'Need at least 2 organizations for isolation tests');
  return data as { id: string; name: string }[];
}

let passed = 0;
let failed = 0;

async function check(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    passed += 1;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failed += 1;
    console.error(`  ✗ ${name}`);
    console.error(`    ${(err as Error).message}`);
  }
}

async function main() {
  console.log(`\nSuper Admin CRUD / isolation tests → ${BASE}\n`);

  const { token } = await login('superadmin@edutech.com');
  const orgs = await listOrgs(token);
  const orgA = orgs[0].id;
  const orgB = orgs[1].id;

  await check('rejects tenant write without X-Organization-Id', async () => {
    const { status } = await request('GET', '/api/v1/platform/users?page=1&limit=5', { token });
    assert(status === 403, `expected 403 without org header, got ${status}`);
  });

  await check('allows tenant read with selected org header', async () => {
    const { status, body } = await request('GET', '/api/v1/platform/users?page=1&limit=5', {
      token,
      orgId: orgA,
    });
    assert(status === 200, `expected 200, got ${status}`);
    assert(body.success === true, 'expected success payload');
  });

  await check('rejects cross-org department mutation by id', async () => {
    // Create dept in org A via org A's branch, then try update with org B header
    const branches = await request('GET', `/api/v1/organizations/${orgA}/branches?page=1&limit=5`, {
      token,
      orgId: orgA,
    });
    assert(branches.status === 200, `list branches failed: ${branches.status}`);
    const branchList = (branches.body.data as { id: string }[]) ?? [];
    assert(branchList.length > 0, 'org A needs a branch');
    const branchId = branchList[0].id;

    const created = await request('POST', `/api/v1/platform/branches/${branchId}/departments`, {
      token,
      orgId: orgA,
      body: { name: `Isolation Dept ${Date.now()}`, code: `ISO${Date.now().toString().slice(-5)}` },
    });
    assert(created.status === 201 || created.status === 200, `create dept failed: ${created.status}`);
    const deptId = (created.body.data as { id: string }).id;

    const cross = await request('PATCH', `/api/v1/platform/departments/${deptId}`, {
      token,
      orgId: orgB,
      body: { name: 'Hacked Name' },
    });
    assert(cross.status === 403 || cross.status === 404, `expected cross-org reject, got ${cross.status}`);
  });

  await check('blocks Super Admin payment create', async () => {
    const { status } = await request('POST', '/api/v1/platform/payments', {
      token,
      orgId: orgA,
      body: { userId: '00000000-0000-0000-0000-000000000001', amount: 10, currency: 'INR' },
    });
    assert(status === 403, `expected 403, got ${status}`);
  });

  await check('blocks Super Admin rank recompute', async () => {
    const tests = await request('GET', '/api/v1/examination/tests?page=1&limit=1', {
      token,
      orgId: orgA,
    });
    assert(tests.status === 200, `list tests failed: ${tests.status}`);
    const testId = ((tests.body.data as { id: string }[]) ?? [])[0]?.id;
    assert(testId, 'need at least one test');
    const { status } = await request('POST', `/api/v1/platform/reports/tests/${testId}/compute-ranks`, {
      token,
      orgId: orgA,
    });
    assert(status === 403, `expected 403, got ${status}`);
  });

  await check('blocks Super Admin attempt start', async () => {
    const tests = await request('GET', '/api/v1/examination/tests?page=1&limit=1&status=live', {
      token,
      orgId: orgA,
    });
    const testId = ((tests.body.data as { id: string }[]) ?? [])[0]?.id;
    if (!testId) {
      console.log('    (skip — no live test)');
      return;
    }
    const { status } = await request('POST', `/api/v1/examination/tests/${testId}/start`, {
      token,
      orgId: orgA,
    });
    assert(status === 403, `expected 403, got ${status}`);
  });

  await check('rejects status=live on test update (must publish)', async () => {
    const tests = await request('GET', '/api/v1/examination/tests?page=1&limit=1&status=draft', {
      token,
      orgId: orgA,
    });
    const testId = ((tests.body.data as { id: string }[]) ?? [])[0]?.id;
    if (!testId) {
      console.log('    (skip — no draft test)');
      return;
    }
    const { status } = await request('PATCH', `/api/v1/examination/tests/${testId}`, {
      token,
      orgId: orgA,
      body: { status: 'live' },
    });
    assert(status === 400 || status === 403, `expected validation/forbidden, got ${status}`);
  });

  await check('settings are tenant-scoped for selected org', async () => {
    const key = 'social_links';
    const valueA = { facebook: `https://fb.a/${Date.now()}`, twitter: '', linkedin: '', instagram: '' };
    const putA = await request('PUT', '/api/v1/platform/settings', {
      token,
      orgId: orgA,
      body: { key, value: valueA },
    });
    assert(putA.status === 200, `upsert A failed: ${putA.status}`);

    const getB = await request('GET', `/api/v1/platform/settings?keys=${key}`, {
      token,
      orgId: orgB,
    });
    assert(getB.status === 200, `get B failed: ${getB.status}`);
    const rowsB = (getB.body.data as { key: string; value: { facebook?: string } }[]) ?? [];
    const socialB = rowsB.find((r) => r.key === key)?.value?.facebook;
    assert(socialB !== valueA.facebook, 'org B should not see org A social_links value');
  });

  console.log(`\nDone: ${passed} passed, ${failed} failed\n`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
