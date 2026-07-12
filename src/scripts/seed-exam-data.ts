import { pool } from '../config/database.js';

export async function seedExamData(): Promise<void> {
  const org = await pool.query<{ id: string }>(
    `SELECT id FROM organizations WHERE slug = 'edutech-academy' LIMIT 1`,
  );
  if (!org.rows[0]) {
    console.log('  skip exam seed (organization not found)');
    return;
  }
  const orgId = org.rows[0].id;

  const teacher = await pool.query<{ id: string }>(
    `SELECT u.id FROM users u WHERE u.email = 'teacher1@edutech.com' LIMIT 1`,
  );
  const student = await pool.query<{ id: string }>(
    `SELECT s.id FROM students s
     JOIN users u ON u.id = s.user_id
     WHERE u.email = 'student1@edutech.com' LIMIT 1`,
  );
  if (!teacher.rows[0] || !student.rows[0]) {
    console.log('  skip exam seed (teacher/student not found)');
    return;
  }

  const existingTest = await pool.query(
    `SELECT id FROM tests WHERE organization_id = $1 AND title = $2 LIMIT 1`,
    [orgId, 'SAT Math Practice Test 1'],
  );
  if (existingTest.rowCount) {
    console.log('  skip exam seed (demo test already exists)');
    return;
  }

  const subject = await pool.query<{ id: string }>(
    `INSERT INTO subjects (organization_id, name, code)
     VALUES ($1, 'Mathematics', 'MATH')
     ON CONFLICT (organization_id, code) DO UPDATE SET name = EXCLUDED.name
     RETURNING id`,
    [orgId],
  );

  const chapter = await pool.query<{ id: string }>(
    `INSERT INTO chapters (subject_id, name, sort_order) VALUES ($1, 'Algebra', 1) RETURNING id`,
    [subject.rows[0].id],
  );

  const topic = await pool.query<{ id: string }>(
    `INSERT INTO topics (chapter_id, name, difficulty, tags, sort_order)
     VALUES ($1, 'Linear Equations', 2, ARRAY['sat','algebra'], 1) RETURNING id`,
    [chapter.rows[0].id],
  );

  const questions = [
    {
      text: 'What is the value of x if 2x + 6 = 14?',
      options: [
        { text: '2', correct: false },
        { text: '4', correct: true },
        { text: '6', correct: false },
        { text: '8', correct: false },
      ],
    },
    {
      text: 'Solve for y: 3y - 9 = 0',
      options: [
        { text: '1', correct: false },
        { text: '2', correct: false },
        { text: '3', correct: true },
        { text: '9', correct: false },
      ],
    },
    {
      text: 'Which is equivalent to 5(x + 2)?',
      options: [
        { text: '5x + 2', correct: false },
        { text: '5x + 10', correct: true },
        { text: 'x + 10', correct: false },
        { text: '5x + 7', correct: false },
      ],
    },
  ];

  const questionIds: string[] = [];
  for (const q of questions) {
    const qRow = await pool.query<{ id: string }>(
      `INSERT INTO questions (
         organization_id, topic_id, created_by, type, status, content, marks, difficulty
       ) VALUES ($1, $2, $3, 'mcq', 'approved', $4, 1, 2)
       RETURNING id`,
      [orgId, topic.rows[0].id, teacher.rows[0].id, JSON.stringify({ text: q.text })],
    );
    const qid = qRow.rows[0].id;
    questionIds.push(qid);
    for (const [i, opt] of q.options.entries()) {
      await pool.query(
        `INSERT INTO question_options (question_id, content, is_correct, sort_order)
         VALUES ($1, $2, $3, $4)`,
        [qid, JSON.stringify({ text: opt.text }), opt.correct, i],
      );
    }
  }

  const test = await pool.query<{ id: string }>(
    `INSERT INTO tests (
       organization_id, created_by, title, description, status, duration_minutes,
       passing_marks, instructions, published_at, total_marks
     ) VALUES ($1, $2, $3, $4, 'live', 30, 2, $5, NOW(), 3)
     RETURNING id`,
    [
      orgId,
      teacher.rows[0].id,
      'SAT Math Practice Test 1',
      'Phase 1 demo test with algebra MCQs',
      'Answer all questions. Each question carries 1 mark.',
    ],
  );
  const testId = test.rows[0].id;

  const section = await pool.query<{ id: string }>(
    `INSERT INTO test_sections (test_id, name, sort_order) VALUES ($1, 'Section A', 1) RETURNING id`,
    [testId],
  );

  for (const [i, qid] of questionIds.entries()) {
    await pool.query(
      `INSERT INTO test_questions (test_id, section_id, question_id, sort_order)
       VALUES ($1, $2, $3, $4)`,
      [testId, section.rows[0].id, qid, i + 1],
    );
  }

  await pool.query(
    `INSERT INTO test_assignments (test_id, assignee_type, assignee_id)
     VALUES ($1, 'student', $2)`,
    [testId, student.rows[0].id],
  );

  console.log('  added demo exam: SAT Math Practice Test 1 (3 questions, assigned to student1)');
}
