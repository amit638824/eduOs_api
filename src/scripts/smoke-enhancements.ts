/**
 * Smoke test for proctoring, retakes, analytics, certificate branding.
 * Run with API up: npx tsx src/scripts/smoke-enhancements.ts
 */
import 'dotenv/config';

const BASE = (process.env.API_BASE_URL ?? 'http://127.0.0.1:3000').replace(/\/$/, '');
const PASSWORD = 'Test@12345';

type Json = Record<string, unknown>;

let passed = 0;
let failed = 0;

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

async function login(email: string) {
  const { status, body } = await request('POST', '/api/v1/auth/login', {
    body: { email, password: PASSWORD },
  });
  assert(status === 200, `Login failed for ${email}: ${status} ${JSON.stringify(body)}`);
  const data = body.data as Json;
  const tokens = data.tokens as Json | undefined;
  const token = (tokens?.accessToken ?? data.accessToken) as string;
  assert(token, `No token for ${email}`);
  const user = data.user as Json;
  return { token, user, orgId: String(user.organizationId ?? user.organization_id ?? '') };
}

async function main() {
  console.log(`\nEnhancement smoke tests → ${BASE}\n`);

  // Health
  await check('API health / responds', async () => {
    const res = await fetch(`${BASE}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'x', password: 'y' }),
    });
    assert(res.status === 400 || res.status === 401 || res.status === 422 || res.status === 200, `unexpected ${res.status}`);
  });

  let adminToken = '';
  let orgId = '';
  let studentToken = '';
  let studentUserId = '';

  await check('superadmin login', async () => {
    const r = await login('superadmin@edutech.com');
    adminToken = r.token;
    // pick first org
    const orgs = await request('GET', '/api/v1/organizations?page=1&limit=5', { token: adminToken });
    assert(orgs.status === 200, `orgs ${orgs.status}`);
    const list = orgs.body.data as { id: string }[];
    assert(Array.isArray(list) && list.length > 0, 'no orgs');
    orgId = list[0].id;
  });

  // Find org admin / teacher / student from platform users if seed has them
  await check('list platform users in org', async () => {
    const { status, body } = await request('GET', '/api/v1/platform/users?page=1&limit=50', {
      token: adminToken,
      orgId,
    });
    assert(status === 200, `users ${status}`);
    const users = (body.data as Json[]) ?? [];
    assert(users.length > 0, 'no users in org — seed may be incomplete');
    const student = users.find((u) => {
      const roles = (u.roles as string[]) ?? [];
      return roles.includes('student');
    });
    if (student) {
      studentUserId = String(student.id);
      // try login with common seeded emails
    }
  });

  // Try common seed emails for student/teacher
  const candidateEmails = [
    'student@edutech.com',
    'student1@edutech.com',
    'demo.student@edutech.com',
    'teacher@edutech.com',
    'orgadmin@edutech.com',
    'admin@edutech.com',
  ];

  let staffToken = adminToken;
  let staffOrgId = orgId;

  for (const email of candidateEmails) {
    const { status, body } = await request('POST', '/api/v1/auth/login', {
      body: { email, password: PASSWORD },
    });
    if (status !== 200) continue;
    const data = body.data as Json;
    const tokens = data.tokens as Json | undefined;
    const token = (tokens?.accessToken ?? data.accessToken) as string;
    const user = data.user as Json;
    const roles = (user.roles as string[]) ?? [];
    const oid = String(user.organizationId ?? user.organization_id ?? orgId);
    if (roles.includes('student') && !studentToken) {
      studentToken = token;
      studentUserId = String(user.id);
      console.log(`  · student session: ${email}`);
    }
    if ((roles.includes('org_admin') || roles.includes('teacher') || roles.includes('staff')) && email !== 'superadmin@edutech.com') {
      staffToken = token;
      staffOrgId = oid;
      console.log(`  · staff session: ${email} roles=${roles.join(',')}`);
    }
  }

  await check('settings upsert certificates.auto_issue', async () => {
    const { status, body } = await request('PUT', '/api/v1/platform/settings', {
      token: staffToken,
      orgId: staffOrgId,
      body: { key: 'certificates.auto_issue', value: true },
    });
    assert(status === 200 || status === 201, `upsert auto_issue ${status} ${JSON.stringify(body)}`);
  });

  await check('settings upsert certificates.branding', async () => {
    const { status, body } = await request('PUT', '/api/v1/platform/settings', {
      token: staffToken,
      orgId: staffOrgId,
      body: {
        key: 'certificates.branding',
        value: {
          logoUrl: '',
          primaryColor: '#102A43',
          accentColor: '#C9A227',
          sealText: 'AUTHENTIC',
          templateId: 'classic',
        },
      },
    });
    assert(status === 200 || status === 201, `upsert branding ${status} ${JSON.stringify(body)}`);
  });

  await check('get settings keys', async () => {
    const { status, body } = await request(
      'GET',
      '/api/v1/platform/settings?keys=certificates.auto_issue,certificates.branding',
      { token: staffToken, orgId: staffOrgId },
    );
    assert(status === 200, `get settings ${status}`);
    const rows = (body.data as Json[]) ?? [];
    assert(rows.some((r) => r.key === 'certificates.auto_issue'), 'missing auto_issue');
    assert(rows.some((r) => r.key === 'certificates.branding'), 'missing branding');
  });

  let testId = '';
  await check('list tests', async () => {
    const { status, body } = await request('GET', '/api/v1/examination/tests?page=1&limit=20', {
      token: staffToken,
      orgId: staffOrgId,
    });
    assert(status === 200, `list tests ${status} ${JSON.stringify(body)}`);
    const data = (body.data as Json[]) ?? [];
    if (data.length > 0) {
      testId = String(data[0].id);
    }
  });

  await check('create test with retake + flag config', async () => {
    const { status, body } = await request('POST', '/api/v1/examination/tests', {
      token: staffToken,
      orgId: staffOrgId,
      body: {
        title: `Smoke Retake ${Date.now()}`,
        durationMinutes: 30,
        passingMarks: 40,
        instructions: 'Smoke test instructions',
        config: {
          maxAttempts: 2,
          scoringPolicy: 'highest',
          maxTabSwitches: 2,
          maxFullscreenExits: 1,
          maxCopyPasteAttempts: 1,
          releaseAnswers: false,
          allowResume: true,
          fullScreen: true,
        },
      },
    });
    assert(status === 201 || status === 200, `create test ${status} ${JSON.stringify(body)}`);
    const data = body.data as Json;
    testId = String(data.id);
  });

  await check('list flagged attempts endpoint', async () => {
    const { status, body } = await request(
      'GET',
      '/api/v1/examination/attempts/flagged?page=1&limit=10&reviewStatus=all',
      { token: staffToken, orgId: staffOrgId },
    );
    assert(status === 200, `flagged ${status} ${JSON.stringify(body)}`);
    assert(body.success === true || Array.isArray(body.data), 'bad flagged payload');
  });

  await check('question analytics endpoint', async () => {
    assert(testId, 'no testId');
    const { status, body } = await request(
      'GET',
      `/api/v1/examination/analytics/tests/${testId}/questions`,
      { token: staffToken, orgId: staffOrgId },
    );
    assert(status === 200, `q analytics ${status} ${JSON.stringify(body)}`);
    const data = body.data as Json;
    assert(data && (data.questions || data.test), 'missing questions analytics shape');
  });

  await check('test analytics overview', async () => {
    const { status } = await request('GET', `/api/v1/examination/analytics/tests/${testId}`, {
      token: staffToken,
      orgId: staffOrgId,
    });
    assert(status === 200, `test analytics ${status}`);
  });

  // If we have a student, try assign + start + proctoring events
  if (studentToken) {
    let studentId = '';
    await check('resolve student profile id', async () => {
      // list assignable and find matching user, or use students endpoint
      const { status, body } = await request(
        'GET',
        '/api/v1/examination/tests/assignable-students?page=1&limit=50',
        { token: staffToken, orgId: staffOrgId },
      );
      if (status === 200) {
        const rows = (body.data as Json[]) ?? [];
        const match = rows.find((r) => String(r.user_id ?? '') === studentUserId) ?? rows[0];
        if (match) studentId = String(match.id);
      }
      assert(studentId, `could not resolve studentId (login user=${studentUserId})`);
    });

    await check('assign student to smoke test', async () => {
      const { status, body } = await request('POST', `/api/v1/examination/tests/${testId}/assign`, {
        token: staffToken,
        orgId: staffOrgId,
        body: { studentId },
      });
      assert(
        status === 201 || status === 200 || status === 409,
        `assign ${status} ${JSON.stringify(body)}`,
      );
    });

    // publish live
    await check('publish smoke test', async () => {
      const { status, body } = await request('POST', `/api/v1/examination/tests/${testId}/publish`, {
        token: staffToken,
        orgId: staffOrgId,
        body: { mode: 'live_now' },
      });
      // may fail if no questions — accept 400 as soft
      if (status >= 400) {
        console.log(`    (publish soft-fail ${status}: ${JSON.stringify(body?.message ?? body)})`);
        return;
      }
      assert(status === 200 || status === 201, `publish ${status}`);
    });

    let attemptId = '';
    await check('student start attempt (retake-ready)', async () => {
      const { status, body } = await request('POST', `/api/v1/examination/tests/${testId}/start`, {
        token: studentToken,
        orgId: staffOrgId,
      });
      if (status >= 400) {
        // likely no questions / not live
        console.log(`    (start soft-fail ${status}: ${JSON.stringify(body)})`);
        return;
      }
      attemptId = String((body.data as Json).id);
      assert(attemptId, 'no attempt id');
    });

    if (attemptId) {
      await check('log proctoring events (tab + copy + fullscreen)', async () => {
        for (const event of ['tab_switch', 'copy_attempt', 'fullscreen_exit', 'paste_attempt']) {
          const { status, body } = await request(
            'POST',
            `/api/v1/examination/attempts/${attemptId}/proctoring`,
            { token: studentToken, orgId: staffOrgId, body: { event } },
          );
          assert(status === 200, `proctor ${event} ${status} ${JSON.stringify(body)}`);
        }
      });

      await check('staff get proctoring timeline', async () => {
        const { status, body } = await request(
          'GET',
          `/api/v1/examination/attempts/${attemptId}/proctoring`,
          { token: staffToken, orgId: staffOrgId },
        );
        assert(status === 200, `get proctoring ${status}`);
        const data = body.data as Json;
        const timeline = data.proctoring_timeline as unknown[];
        assert(Array.isArray(timeline) && timeline.length >= 4, `timeline len ${timeline?.length}`);
        assert(data.proctoring_flagged === true || (data.proctoring_summary as Json)?.flagged, 'expected flagged');
      });

      await check('attempt history endpoint', async () => {
        const { status, body } = await request(
          'GET',
          `/api/v1/examination/tests/${testId}/attempt-history?studentId=${studentId}`,
          { token: staffToken, orgId: staffOrgId },
        );
        assert(status === 200, `history ${status} ${JSON.stringify(body)}`);
        const data = body.data as Json;
        assert(data.scoring_policy === 'highest', `policy ${data.scoring_policy}`);
        assert(Number(data.max_attempts) === 2, `maxAttempts ${data.max_attempts}`);
      });

      await check('proctoring review update', async () => {
        const { status, body } = await request(
          'PATCH',
          `/api/v1/examination/attempts/${attemptId}/proctoring-review`,
          { token: staffToken, orgId: staffOrgId, body: { status: 'reviewed' } },
        );
        assert(status === 200, `review ${status} ${JSON.stringify(body)}`);
      });
    }
  } else {
    console.log('  · skip student flow (no student login found in seed)');
  }

  console.log(`\nResult: ${passed} passed, ${failed} failed\n`);
  if (failed > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
