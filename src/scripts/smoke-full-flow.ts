/**
 * End-to-end smoke: staff+student, retakes, proctoring flags, analytics.
 */
import 'dotenv/config';

const BASE = (process.env.API_BASE_URL ?? 'http://127.0.0.1:3000').replace(/\/$/, '');
const PASSWORD = 'Test@12345';
const TS = Date.now();

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
  assert(status === 200, `login ${email}: ${status} ${JSON.stringify(body)}`);
  const data = body.data as Json;
  const tokens = data.tokens as Json;
  const token = String(tokens?.accessToken ?? data.accessToken);
  const user = data.user as Json;
  return {
    token,
    user,
    orgId: String(user.organizationId ?? user.organization_id ?? ''),
  };
}

async function main() {
  console.log(`\nFull-flow smoke → ${BASE}\n`);

  const sa = await login('superadmin@edutech.com');
  const orgs = await request('GET', '/api/v1/organizations?page=1&limit=5', { token: sa.token });
  assert(orgs.status === 200, 'orgs');
  const orgId = String((orgs.body.data as Json[])[0].id);

  const branchesRes = await request('GET', `/api/v1/organizations/${orgId}/branches?page=1&limit=5`, {
    token: sa.token,
    orgId,
  });
  let branchId = ((branchesRes.body.data as Json[]) ?? [])[0]?.id as string | undefined;
  if (!branchId) {
    const created = await request('POST', `/api/v1/organizations/${orgId}/branches`, {
      token: sa.token,
      orgId,
      body: { name: `Smoke Branch ${TS}`, code: `SM${String(TS).slice(-4)}` },
    });
    assert(created.status === 201 || created.status === 200, `branch ${created.status} ${JSON.stringify(created.body)}`);
    branchId = String((created.body.data as Json).id);
  }

  let departmentId = '';
  await check('ensure department', async () => {
    const list = await request('GET', `/api/v1/platform/branches/${branchId}/departments?page=1&limit=20`, {
      token: sa.token,
      orgId,
    });
    const rows = (list.body.data as Json[]) ?? [];
    if (rows[0]) {
      departmentId = String(rows[0].id);
      return;
    }
    const created = await request('POST', `/api/v1/platform/branches/${branchId}/departments`, {
      token: sa.token,
      orgId,
      body: { name: `Smoke Dept ${TS}`, code: `D${String(TS).slice(-4)}` },
    });
    assert(created.status === 201 || created.status === 200, `dept ${created.status} ${JSON.stringify(created.body)}`);
    departmentId = String((created.body.data as Json).id);
  });

  const teacherEmail = `smoke.teacher.${TS}@edutech.test`;
  const studentEmail = `smoke.student.${TS}@edutech.test`;
  let teacherToken = '';
  let studentToken = '';
  let studentRecordId = '';
  let topicId = '';
  let testId = '';
  let questionId = '';
  let attemptId = '';

  await check('create teacher + student', async () => {
    for (const [email, role] of [
      [teacherEmail, 'teacher'],
      [studentEmail, 'student'],
    ] as const) {
      const { status, body } = await request('POST', '/api/v1/platform/users', {
        token: sa.token,
        orgId,
        body: {
          email,
          password: PASSWORD,
          firstName: 'Smoke',
          lastName: role,
          role,
          branchId,
        },
      });
      assert(status === 201 || status === 200, `${role} ${status} ${JSON.stringify(body)}`);
    }
    teacherToken = (await login(teacherEmail)).token;
    studentToken = (await login(studentEmail)).token;
  });

  await check('create subject + topic', async () => {
    const sub = await request('POST', '/api/v1/examination/subjects', {
      token: teacherToken,
      orgId,
      body: { name: `Smoke Subject ${TS}`, departmentId, code: `S${String(TS).slice(-5)}` },
    });
    assert(sub.status === 201 || sub.status === 200, `subject ${sub.status} ${JSON.stringify(sub.body)}`);
    const subjectId = String((sub.body.data as Json).id);
    const topic = await request('POST', `/api/v1/examination/subjects/${subjectId}/topics`, {
      token: teacherToken,
      orgId,
      body: { name: `Smoke Topic ${TS}`, difficulty: 2 },
    });
    assert(topic.status === 201 || topic.status === 200, `topic ${topic.status} ${JSON.stringify(topic.body)}`);
    topicId = String((topic.body.data as Json).id);
  });

  await check('resolve assignable student', async () => {
    const { status, body } = await request('GET', '/api/v1/examination/students?page=1&limit=100', {
      token: teacherToken,
      orgId,
    });
    assert(status === 200, `students ${status} ${JSON.stringify(body)}`);
    const rows = (body.data as Json[]) ?? [];
    const hit = rows.find((r) => String(r.email).toLowerCase() === studentEmail);
    assert(hit, `student missing in assignable (${rows.length})`);
    studentRecordId = String(hit.student_id ?? hit.id);
    assert(/^[0-9a-f-]{36}$/i.test(studentRecordId), `bad student id ${studentRecordId}`);
  });

  await check('create test with retake config', async () => {
    const { status, body } = await request('POST', '/api/v1/examination/tests', {
      token: teacherToken,
      orgId,
      body: {
        title: `Full Smoke ${TS}`,
        durationMinutes: 45,
        passingMarks: 1,
        instructions: 'Full smoke instructions',
        config: {
          maxAttempts: 2,
          scoringPolicy: 'highest',
          maxTabSwitches: 1,
          maxFullscreenExits: 0,
          maxCopyPasteAttempts: 0,
          releaseAnswers: true,
          allowResume: true,
          fullScreen: true,
          browserLock: true,
          blockCopyPaste: true,
        },
      },
    });
    assert(status === 201 || status === 200, `test ${status} ${JSON.stringify(body)}`);
    testId = String((body.data as Json).id);
  });

  await check('create + approve MCQ', async () => {
    const { status, body } = await request('POST', '/api/v1/examination/questions', {
      token: teacherToken,
      orgId,
      body: {
        type: 'mcq',
        topicId,
        content: { text: `Smoke Q ${TS}` },
        marks: 2,
        difficulty: 2,
        options: [
          { content: { text: 'A' }, isCorrect: true },
          { content: { text: 'B' }, isCorrect: false },
          { content: { text: 'C' }, isCorrect: false },
          { content: { text: 'D' }, isCorrect: false },
        ],
      },
    });
    assert(status === 201 || status === 200, `question ${status} ${JSON.stringify(body)}`);
    questionId = String((body.data as Json).id);
    const ap = await request('POST', `/api/v1/examination/questions/${questionId}/approve`, {
      token: teacherToken,
      orgId,
    });
    assert(ap.status === 200 || ap.status === 201 || ap.status === 409, `approve ${ap.status} ${JSON.stringify(ap.body)}`);
  });

  await check('attach question + publish + assign', async () => {
    const add = await request('POST', `/api/v1/examination/tests/${testId}/questions`, {
      token: teacherToken,
      orgId,
      body: { questionId },
    });
    assert(add.status === 201 || add.status === 200, `addQ ${add.status} ${JSON.stringify(add.body)}`);

    const pub = await request('POST', `/api/v1/examination/tests/${testId}/publish`, {
      token: teacherToken,
      orgId,
      body: { mode: 'live_now' },
    });
    assert(pub.status === 200 || pub.status === 201, `publish ${pub.status} ${JSON.stringify(pub.body)}`);

    const asg = await request('POST', `/api/v1/examination/tests/${testId}/assign`, {
      token: teacherToken,
      orgId,
      body: { studentId: studentRecordId },
    });
    assert(asg.status === 201 || asg.status === 200 || asg.status === 409, `assign ${asg.status} ${JSON.stringify(asg.body)}`);
  });

  await check('student start + proctor flag + answer + submit', async () => {
    const start = await request('POST', `/api/v1/examination/tests/${testId}/start`, {
      token: studentToken,
      orgId,
    });
    assert(start.status === 201 || start.status === 200, `start ${start.status} ${JSON.stringify(start.body)}`);
    attemptId = String((start.body.data as Json).id);

    for (const event of ['fullscreen_exit', 'copy_attempt', 'tab_switch', 'tab_switch']) {
      const p = await request('POST', `/api/v1/examination/attempts/${attemptId}/proctoring`, {
        token: studentToken,
        orgId,
        body: { event },
      });
      assert(p.status === 200, `${event} ${p.status} ${JSON.stringify(p.body)}`);
    }

    const timeline = await request('GET', `/api/v1/examination/attempts/${attemptId}/proctoring`, {
      token: teacherToken,
      orgId,
    });
    assert(timeline.status === 200, `timeline ${timeline.status} ${JSON.stringify(timeline.body)}`);
    const td = timeline.body.data as Json;
    assert(td.proctoring_flagged === true || (td.proctoring_summary as Json)?.flagged === true, 'expected flagged');

    const att = await request('GET', `/api/v1/examination/attempts/${attemptId}`, {
      token: studentToken,
      orgId,
    });
    assert(att.status === 200, `getAttempt ${att.status}`);
    const questions = ((att.body.data as Json).questions as Json[]) ?? [];
    assert(questions.length > 0, 'no questions');
    const q = questions[0];
    const opts = (q.options as Json[]) ?? [];
    const correct = opts.find((o) => o.is_correct === true || o.is_correct === 1) ?? opts[0];
    const save = await request('POST', `/api/v1/examination/attempts/${attemptId}/answers`, {
      token: studentToken,
      orgId,
      body: {
        questionId: q.question_id,
        answer: { selectedOptionIds: [correct.id] },
        timeSpentSec: 15,
      },
    });
    assert(save.status === 200, `save ${save.status} ${JSON.stringify(save.body)}`);

    const sub = await request('POST', `/api/v1/examination/attempts/${attemptId}/submit`, {
      token: studentToken,
      orgId,
      body: {},
    });
    assert(sub.status === 200, `submit ${sub.status} ${JSON.stringify(sub.body)}`);
  });

  await check('staff result shows flag + timeline', async () => {
    const { status, body } = await request('GET', `/api/v1/examination/results/${attemptId}`, {
      token: teacherToken,
      orgId,
    });
    assert(status === 200, `result ${status} ${JSON.stringify(body)}`);
    const data = body.data as Json;
    assert(data.proctoring_flagged === true || (data.proctoring_summary as Json)?.flagged, 'not flagged on result');
    assert(Array.isArray(data.proctoring_timeline), 'no timeline');
  });

  await check('attempt history + retake start', async () => {
    const hist = await request(
      'GET',
      `/api/v1/examination/tests/${testId}/attempt-history?studentId=${studentRecordId}`,
      { token: teacherToken, orgId },
    );
    assert(hist.status === 200, `history ${hist.status} ${JSON.stringify(hist.body)}`);
    const data = hist.body.data as Json;
    assert(data.scoring_policy === 'highest', String(data.scoring_policy));
    assert(Number(data.max_attempts) === 2, String(data.max_attempts));

    const retake = await request('POST', `/api/v1/examination/tests/${testId}/start`, {
      token: studentToken,
      orgId,
    });
    assert(retake.status === 201 || retake.status === 200, `retake ${retake.status} ${JSON.stringify(retake.body)}`);
  });

  await check('flagged queue + review (teacher/superadmin)', async () => {
    let list = await request(
      'GET',
      '/api/v1/examination/attempts/flagged?page=1&limit=50&reviewStatus=all',
      { token: teacherToken, orgId },
    );
    if (list.status === 403) {
      list = await request(
        'GET',
        '/api/v1/examination/attempts/flagged?page=1&limit=50&reviewStatus=all',
        { token: sa.token, orgId },
      );
    }
    assert(list.status === 200, `flagged ${list.status} ${JSON.stringify(list.body)}`);
    const rows = (list.body.data as Json[]) ?? [];
    assert(rows.some((r) => String(r.id) === attemptId), 'attempt missing from flagged queue');

    const rev = await request('PATCH', `/api/v1/examination/attempts/${attemptId}/proctoring-review`, {
      token: list.status === 200 && teacherToken ? teacherToken : sa.token,
      orgId,
      body: { status: 'reviewed' },
    });
    // if teacher 403 on review, use SA
    if (rev.status === 403) {
      const rev2 = await request('PATCH', `/api/v1/examination/attempts/${attemptId}/proctoring-review`, {
        token: sa.token,
        orgId,
        body: { status: 'reviewed' },
      });
      assert(rev2.status === 200, `review sa ${rev2.status}`);
    } else {
      assert(rev.status === 200, `review ${rev.status} ${JSON.stringify(rev.body)}`);
    }
  });

  await check('question analytics has answered data', async () => {
    const { status, body } = await request(
      'GET',
      `/api/v1/examination/analytics/tests/${testId}/questions`,
      { token: teacherToken, orgId },
    );
    assert(status === 200, `qa ${status} ${JSON.stringify(body)}`);
    const questions = ((body.data as Json).questions as Json[]) ?? [];
    assert(questions.length >= 1, 'no questions');
    assert(Number(questions[0].answered_count) >= 1, `answered_count=${questions[0].answered_count}`);
    assert(Number(questions[0].avg_time_sec) > 0 || Number(questions[0].avg_time_sec) === 0, 'avg time missing');
  });

  console.log(`\nResult: ${passed} passed, ${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
