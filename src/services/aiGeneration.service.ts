import { env, isOpenAiConfigured } from '../config/env.js';
import { query } from '../config/database.js';
import { NotFoundError, ValidationError } from '../utils/errors.js';
import * as testService from './test.service.js';
import { getTestQuestionAnalytics } from './analytics.service.js';

const QUESTION_TYPES = [
  'mcq',
  'msq',
  'true_false',
  'fill_blank',
  'integer',
  'numerical',
  'assertion_reason',
  'match_following',
  'matrix_match',
  'paragraph',
  'case_study',
  'subjective',
] as const;

type QuestionType = (typeof QUESTION_TYPES)[number];
type DifficultyLabel = 'easy' | 'medium' | 'hard' | 'mixed';

export interface AiTypeCount {
  type: QuestionType;
  count: number;
}

export interface AiGenerateRequest {
  examName: string;
  department: string;
  subject: string;
  chapter?: string;
  topic: string;
  difficulty: DifficultyLabel;
  language: string;
  questionTypes: AiTypeCount[];
  syllabusText?: string;
}

interface DraftOption {
  text: string;
  isCorrect?: boolean;
  whyWrong?: string;
}

interface DraftQuestion {
  type?: string;
  text?: string;
  options?: DraftOption[];
  answer?: string;
  explanation?: string;
  steps?: string[];
  marks?: number;
  negativeMarks?: number;
  difficulty?: string;
  topic?: string;
}

interface JobError {
  question?: string;
  reason: string;
}

interface Usage {
  prompt: number;
  completion: number;
}

const CHOICE_TYPES = new Set<string>([
  'mcq',
  'msq',
  'true_false',
  'assertion_reason',
  'match_following',
  'matrix_match',
]);

function asObject(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return null;
    }
  }
  return null;
}

function textOf(content: unknown): string {
  const obj = asObject(content);
  if (obj && typeof obj.text === 'string') return obj.text;
  return typeof content === 'string' ? content : '';
}

function normText(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
}

function tokens(value: string): Set<string> {
  return new Set(normText(value).split(' ').filter((w) => w.length > 2));
}

function isSimilar(a: string, b: string): boolean {
  const left = normText(a);
  const right = normText(b);
  if (!left || !right) return false;
  if (left === right) return true;
  if (left.length > 40 && (left.includes(right) || right.includes(left))) return true;
  const A = tokens(left);
  const B = tokens(right);
  if (A.size < 4 || B.size < 4) return false;
  let shared = 0;
  for (const word of A) if (B.has(word)) shared += 1;
  return shared / (A.size + B.size - shared) >= 0.82;
}

function difficultyNumber(label: string): number {
  if (label === 'easy') return 1;
  if (label === 'hard') return 5;
  return 3;
}

function difficultyLabel(value: unknown, fallback: DifficultyLabel): 'easy' | 'medium' | 'hard' {
  const raw = String(value ?? '').toLowerCase();
  if (raw === 'easy' || raw === 'medium' || raw === 'hard') return raw;
  if (fallback === 'easy' || fallback === 'medium' || fallback === 'hard') return fallback;
  return 'medium';
}

function pricePerMillion(model: string): { input: number; output: number } {
  if (model.includes('gpt-4o-mini')) return { input: 0.15, output: 0.6 };
  if (model.includes('gpt-4o')) return { input: 2.5, output: 10 };
  return { input: 0.15, output: 0.6 };
}

function estimateCost(model: string, usage: Usage): number {
  const price = pricePerMillion(model);
  return (usage.prompt * price.input + usage.completion * price.output) / 1_000_000;
}

function requireOpenAi(): void {
  if (!isOpenAiConfigured) {
    throw new ValidationError('Set OPENAI_API_KEY in the API environment before using AI generation.');
  }
}

async function chatJson(system: string, user: string, usage: Usage): Promise<Record<string, unknown>> {
  requireOpenAi();
  const model = env.OPENAI_MODEL || 'gpt-4o-mini';
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      temperature: 0.4,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    }),
    signal: AbortSignal.timeout(90_000),
  });
  const body = (await response.json()) as {
    error?: { message?: string };
    choices?: { message?: { content?: string } }[];
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };
  if (!response.ok) {
    throw new ValidationError(body.error?.message || `OpenAI request failed (${response.status})`);
  }
  usage.prompt += body.usage?.prompt_tokens ?? 0;
  usage.completion += body.usage?.completion_tokens ?? 0;
  const content = body.choices?.[0]?.message?.content ?? '{}';
  try {
    const parsed = JSON.parse(content) as unknown;
    const obj = asObject(parsed);
    if (!obj) throw new Error('empty');
    return obj;
  } catch {
    throw new ValidationError('OpenAI returned invalid JSON');
  }
}

function parseJob(row: Record<string, unknown>) {
  return {
    ...row,
    status: String(row.status ?? ''),
    request_json: asObject(row.request_json) ?? {},
    errors_json: row.errors_json ?? [],
    result_json: asObject(row.result_json),
    estimated_cost_usd: Number(row.estimated_cost_usd ?? 0),
    openai_configured: isOpenAiConfigured,
  };
}

async function loadJob(id: string, organizationId: string) {
  const result = await query(
    `SELECT * FROM ai_generation_jobs WHERE id = $1 AND organization_id = $2`,
    [id, organizationId],
  );
  if (!result.rows[0]) throw new NotFoundError('AI job');
  return parseJob(result.rows[0] as Record<string, unknown>);
}

async function ensureBranch(organizationId: string): Promise<string> {
  const found = await query<{ id: string }>(
    `SELECT id FROM branches WHERE organization_id = $1 AND deleted_at IS NULL ORDER BY created_at ASC LIMIT 1`,
    [organizationId],
  );
  if (found.rows[0]) return found.rows[0].id;
  const created = await query<{ id: string }>(
    `INSERT INTO branches (organization_id, name, code) VALUES ($1, 'Main', 'MAIN') RETURNING id`,
    [organizationId],
  );
  return created.rows[0].id;
}

async function ensureDepartment(branchId: string, name: string): Promise<string> {
  const found = await query<{ id: string }>(
    `SELECT id FROM departments
     WHERE branch_id = $1 AND LOWER(TRIM(name)) = $2 AND deleted_at IS NULL LIMIT 1`,
    [branchId, name.trim().toLowerCase()],
  );
  if (found.rows[0]) return found.rows[0].id;
  const created = await query<{ id: string }>(
    `INSERT INTO departments (branch_id, name) VALUES ($1, $2) RETURNING id`,
    [branchId, name.trim()],
  );
  return created.rows[0].id;
}

async function ensureSubject(organizationId: string, departmentId: string, name: string): Promise<string> {
  const found = await query<{ id: string }>(
    `SELECT id FROM subjects
     WHERE organization_id = $1 AND department_id = $2 AND LOWER(TRIM(name)) = $3 LIMIT 1`,
    [organizationId, departmentId, name.trim().toLowerCase()],
  );
  if (found.rows[0]) return found.rows[0].id;
  const created = await query<{ id: string }>(
    `INSERT INTO subjects (organization_id, department_id, name) VALUES ($1, $2, $3) RETURNING id`,
    [organizationId, departmentId, name.trim()],
  );
  return created.rows[0].id;
}

async function ensureChapter(subjectId: string, name: string): Promise<string> {
  const found = await query<{ id: string }>(
    `SELECT id FROM chapters WHERE subject_id = $1 AND LOWER(TRIM(name)) = $2 LIMIT 1`,
    [subjectId, name.trim().toLowerCase()],
  );
  if (found.rows[0]) return found.rows[0].id;
  const created = await query<{ id: string }>(
    `INSERT INTO chapters (subject_id, name, sort_order) VALUES ($1, $2, 0) RETURNING id`,
    [subjectId, name.trim()],
  );
  return created.rows[0].id;
}

async function ensureTopic(chapterId: string, name: string): Promise<string> {
  const found = await query<{ id: string }>(
    `SELECT id FROM topics WHERE chapter_id = $1 AND LOWER(TRIM(name)) = $2 LIMIT 1`,
    [chapterId, name.trim().toLowerCase()],
  );
  if (found.rows[0]) return found.rows[0].id;
  const created = await query<{ id: string }>(
    `INSERT INTO topics (chapter_id, name, tags) VALUES ($1, $2, $3) RETURNING id`,
    [chapterId, name.trim(), JSON.stringify(['ai-generated'])],
  );
  return created.rows[0].id;
}

function localBlueprint(input: {
  examName: string;
  subject: string;
  topic: string;
  difficulty: DifficultyLabel;
  questionTypes: AiTypeCount[];
}) {
  const sections = input.questionTypes.map((item) => ({
    type: item.type,
    count: item.count,
    marksEach: item.type === 'subjective' || item.type === 'case_study' ? 5 : 1,
    difficulty: input.difficulty === 'mixed' ? 'mixed' : input.difficulty,
  }));
  const totalQuestions = sections.reduce((sum, s) => sum + s.count, 0);
  const totalMarks = sections.reduce((sum, s) => sum + s.count * s.marksEach, 0);
  const split =
    input.difficulty === 'easy'
      ? { easy: 100, medium: 0, hard: 0 }
      : input.difficulty === 'hard'
        ? { easy: 0, medium: 0, hard: 100 }
        : input.difficulty === 'medium'
          ? { easy: 0, medium: 100, hard: 0 }
          : { easy: 40, medium: 40, hard: 20 };
  return {
    examName: input.examName,
    subject: input.subject,
    topic: input.topic,
    totalQuestions,
    totalMarks,
    difficultySplit: split,
    sections,
    source: 'local' as const,
    notes: 'Balanced by the selected types, marks, and difficulty. Review before publishing.',
  };
}

function localSyllabusTopics(text: string): { chapter: string; topic: string }[] {
  const lines = text
    .split(/\n+/)
    .map((line) => line.replace(/^[-*\d.)\s]+/, '').trim())
    .filter((line) => line.length > 2);
  return lines.slice(0, 40).map((topic) => {
    const parts = topic.split(/[:\-–]/).map((p) => p.trim()).filter(Boolean);
    if (parts.length >= 2) return { chapter: parts[0].slice(0, 200), topic: parts.slice(1).join(' - ').slice(0, 200) };
    return { chapter: 'General', topic: topic.slice(0, 200) };
  });
}

function validateDraft(
  raw: DraftQuestion,
  expectedType: string,
  bank: string[],
): { ok: true; question: DraftQuestion } | { ok: false; reason: string } {
  const type = expectedType;
  const text = String(raw.text ?? '').trim();
  if (text.length < 8) return { ok: false, reason: 'Question text is too short' };
  if (bank.some((existing) => isSimilar(existing, text))) {
    return { ok: false, reason: 'Duplicate or highly similar question' };
  }
  const marks = Number(raw.marks ?? 1);
  if (!Number.isFinite(marks) || marks <= 0 || marks > 100) {
    return { ok: false, reason: 'Invalid marks' };
  }
  const steps = Array.isArray(raw.steps) ? raw.steps.map((s) => String(s).trim()).filter(Boolean) : [];
  let explanation = String(raw.explanation ?? '').trim();
  if (steps.length) {
    explanation = `${explanation}\n${steps.map((s, i) => `${i + 1}. ${s}`).join('\n')}`.trim();
  }
  if (explanation.length < 12) return { ok: false, reason: 'Incomplete explanation' };
  if ((type === 'numerical' || type === 'integer') && steps.length === 0 && !/step|because|therefore/i.test(explanation)) {
    return { ok: false, reason: 'Numerical question needs a step-by-step solution' };
  }

  const options = (raw.options ?? [])
    .map((o) => ({
      text: String(o.text ?? '').trim(),
      isCorrect: Boolean(o.isCorrect),
      whyWrong: String(o.whyWrong ?? '').trim(),
    }))
    .filter((o) => o.text.length > 0);

  if (type === 'true_false' && options.length < 2) {
    const answer = String(raw.answer ?? '').toLowerCase();
    options.splice(
      0,
      options.length,
      { text: 'True', isCorrect: answer.startsWith('t'), whyWrong: '' },
      { text: 'False', isCorrect: answer.startsWith('f'), whyWrong: '' },
    );
  }

  if (CHOICE_TYPES.has(type) || (type === 'paragraph' || type === 'case_study') && options.length >= 2) {
    if (options.length < 2) return { ok: false, reason: 'Missing options' };
    const correct = options.filter((o) => o.isCorrect);
    if (type === 'mcq' || type === 'true_false' || type === 'assertion_reason') {
      if (correct.length !== 1) return { ok: false, reason: 'Choice question must have exactly one correct option' };
    } else if (type === 'msq' && correct.length < 2) {
      return { ok: false, reason: 'MSQ needs at least two correct options' };
    } else if (correct.length < 1) {
      return { ok: false, reason: 'Missing correct option' };
    }
    const wrong = options.filter((o) => !o.isCorrect);
    if (type !== 'true_false' && wrong.length > 0 && wrong.every((o) => !o.whyWrong)) {
      return { ok: false, reason: 'Distractors need a reason they are incorrect' };
    }
  } else {
    const answer = String(raw.answer ?? '').trim();
    if (!answer) return { ok: false, reason: 'Missing correct answer' };
    if (type === 'integer' && !/^-?\d+$/.test(answer)) {
      return { ok: false, reason: 'Incorrect integer answer' };
    }
    if (type === 'numerical' && !Number.isFinite(Number(answer))) {
      return { ok: false, reason: 'Incorrect numerical answer' };
    }
    options.splice(0, options.length, { text: answer, isCorrect: true, whyWrong: '' });
  }

  return {
    ok: true,
    question: { ...raw, type, text, options, explanation, marks, steps },
  };
}

async function saveQuestion(
  organizationId: string,
  userId: string,
  topicId: string,
  language: string,
  requested: DifficultyLabel,
  draft: DraftQuestion,
): Promise<string> {
  const label = difficultyLabel(requested === 'mixed' ? draft.difficulty : requested, 'medium');
  const content = {
    text: draft.text,
    tags: ['ai-generated'],
    aiGenerated: true,
    difficultyLabel: label,
    modelDifficulty: difficultyLabel(draft.difficulty, 'mixed'),
    distractorNotes: (draft.options ?? [])
      .filter((o) => !o.isCorrect && o.whyWrong)
      .map((o) => ({ text: o.text, whyWrong: o.whyWrong })),
    steps: draft.steps ?? [],
  };
  const created = await query<{ id: string }>(
    `INSERT INTO questions (
       organization_id, topic_id, created_by, type, content, explanation,
       marks, negative_marks, difficulty, language, status, approved_by, approved_at
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'approved',$3,NOW(3))
     RETURNING id`,
    [
      organizationId,
      topicId,
      userId,
      draft.type,
      JSON.stringify(content),
      draft.explanation ?? null,
      Number(draft.marks ?? 1),
      Math.max(0, Number(draft.negativeMarks ?? 0)),
      difficultyNumber(label),
      language || 'en',
    ],
  );
  const id = created.rows[0].id;
  let order = 0;
  for (const opt of draft.options ?? []) {
    const numeric = draft.type === 'integer' || draft.type === 'numerical';
    const payload = numeric
      ? { text: opt.text, value: Number(opt.text) }
      : { text: opt.text };
    await query(
      `INSERT INTO question_options (question_id, content, is_correct, sort_order) VALUES ($1,$2,$3,$4)`,
      [id, JSON.stringify(payload), opt.isCorrect ? 1 : 0, order],
    );
    order += 1;
  }
  return id;
}

async function loadBankTexts(organizationId: string): Promise<string[]> {
  const rows = await query(
    `SELECT content FROM questions
     WHERE organization_id = $1 AND archived_at IS NULL
     ORDER BY created_at DESC LIMIT 1500`,
    [organizationId],
  );
  return rows.rows.map((row) => textOf((row as { content: unknown }).content)).filter(Boolean);
}

const SYSTEM = `You write original exam-practice questions. Never copy official past papers verbatim.
Return JSON only. Every question needs a clear explanation.
For numerical and integer questions include a steps array with the working.
For MCQ, MSQ, assertion-reason, match, and matrix questions include options.
Exactly one option is correct for MCQ, true/false, and assertion-reason.
MSQ has at least two correct options.
Each incorrect option needs whyWrong.
Classify difficulty as easy, medium, or hard.
Marks must be a positive number.`;

async function generateBatch(
  input: AiGenerateRequest,
  type: string,
  count: number,
  topic: string,
  usage: Usage,
): Promise<DraftQuestion[]> {
  const payload = await chatJson(
    SYSTEM,
    `Exam: ${input.examName}
Subject: ${input.subject}
Chapter: ${input.chapter || 'General'}
Topic: ${topic}
Language: ${input.language}
Target difficulty: ${input.difficulty}
Write ${count} original ${type} questions.
JSON shape: {"questions":[{"type":"${type}","text":"","options":[{"text":"","isCorrect":false,"whyWrong":""}],"answer":"","explanation":"","steps":[],"marks":1,"difficulty":"medium"}]}`,
    usage,
  );
  const list = payload.questions;
  return Array.isArray(list) ? (list as DraftQuestion[]) : [];
}

async function updateJob(id: string, fields: Record<string, unknown>) {
  const sets: string[] = [];
  const params: unknown[] = [];
  for (const [key, value] of Object.entries(fields)) {
    params.push(value);
    sets.push(`${key} = $${params.length}`);
  }
  params.push(id);
  await query(`UPDATE ai_generation_jobs SET ${sets.join(', ')} WHERE id = $${params.length}`, params);
}

async function attachDraftTest(
  organizationId: string,
  userId: string,
  title: string,
  description: string,
  questionIds: { id: string; type: string; marks: number }[],
  blueprint: ReturnType<typeof localBlueprint>,
) {
  const totalMarks = questionIds.reduce((sum, q) => sum + q.marks, 0);
  const createdTest = (await testService.createTest(organizationId, userId, {
    title,
    description,
    durationMinutes: Math.min(180, Math.max(15, Math.ceil(questionIds.length * 1.5))),
    passingMarks: Math.max(1, Math.round(totalMarks * 0.4)),
    instructions: 'This is an AI draft. Review every question before publishing. It is not live.',
    config: {
      examType: 'practice',
      certificationEnabled: false,
      maxAttempts: 3,
      aiGenerated: true,
      blueprint,
    },
  })) as unknown as { id: string };
  const test = createdTest;
  const byType = new Map<string, { id: string; marks: number }[]>();
  for (const q of questionIds) {
    const list = byType.get(q.type) ?? [];
    list.push(q);
    byType.set(q.type, list);
  }
  let sort = 0;
  let sectionOrder = 0;
  for (const [type, items] of byType) {
    const section = await testService.addTestSection(String(test.id), organizationId, {
      name: type.replace(/_/g, ' '),
      sortOrder: sectionOrder,
    });
    sectionOrder += 1;
    for (const item of items) {
      await testService.addQuestionToTest(String(test.id), organizationId, {
        questionId: item.id,
        sectionId: String(section.id),
        sortOrder: sort,
        marksOverride: item.marks,
      });
      sort += 1;
    }
  }
  return String(test.id);
}

async function runGeneration(jobId: string) {
  const started = Date.now();
  const locked = await query(
    `UPDATE ai_generation_jobs SET status = 'running' WHERE id = $1 AND status = 'queued'`,
    [jobId],
  );
  if (!locked.rowCount) return;
  const row = await query(
    `SELECT * FROM ai_generation_jobs WHERE id = $1`,
    [jobId],
  );
  const job = row.rows[0] as Record<string, unknown> | undefined;
  if (!job) return;
  const organizationId = String(job.organization_id);
  const userId = String(job.created_by);
  const request = asObject(job.request_json) as unknown as AiGenerateRequest;
  const usage: Usage = { prompt: 0, completion: 0 };
  if (!request?.examName || !request.questionTypes?.length) {
    await updateJob(jobId, {
      status: 'failed',
      error_message: 'Saved request is incomplete',
      finished_at: new Date(),
    });
    return;
  }
  const errors: JobError[] = [];
  try {
    const total = request.questionTypes.reduce((sum, item) => sum + item.count, 0);
    await updateJob(jobId, { progress_total: total });
    const branchId = await ensureBranch(organizationId);
    const departmentId = await ensureDepartment(branchId, request.department);
    const subjectId = await ensureSubject(organizationId, departmentId, request.subject);
    const mapped = request.syllabusText?.trim()
      ? await mapTopics(request, usage)
      : [{ chapter: request.chapter || 'General', topic: request.topic }];
    const topicIds: { chapter: string; topic: string; id: string }[] = [];
    for (const item of mapped) {
      const chapterId = await ensureChapter(subjectId, item.chapter || 'General');
      const id = await ensureTopic(chapterId, item.topic);
      topicIds.push({ ...item, id });
    }
    if (!topicIds.length) {
      const chapterId = await ensureChapter(subjectId, request.chapter || 'General');
      topicIds.push({
        chapter: request.chapter || 'General',
        topic: request.topic,
        id: await ensureTopic(chapterId, request.topic),
      });
    }
    const bank = await loadBankTexts(organizationId);
    const saved: { id: string; type: string; marks: number }[] = [];
    let skipped = 0;
    let apiFails = 0;
    for (const spec of request.questionTypes) {
      let remaining = spec.count;
      while (remaining > 0) {
        const batchSize = Math.min(6, remaining);
        const topic = topicIds[saved.length % topicIds.length];
        try {
          const drafts = await generateBatch(request, spec.type, batchSize, topic.topic, usage);
          apiFails = 0;
          let accepted = 0;
          for (const draft of drafts) {
            if (accepted >= remaining) break;
            const checked = validateDraft(draft, spec.type, bank);
            if (!checked.ok) {
              skipped += 1;
              errors.push({ question: String(draft.text ?? '').slice(0, 140), reason: checked.reason });
              continue;
            }
            const id = await saveQuestion(
              organizationId,
              userId,
              topic.id,
              request.language,
              request.difficulty,
              checked.question,
            );
            bank.push(String(checked.question.text));
            saved.push({
              id,
              type: spec.type,
              marks: Number(checked.question.marks ?? 1),
            });
            accepted += 1;
          }
          if (drafts.length === 0) {
            skipped += batchSize;
            errors.push({ reason: `No ${spec.type} questions returned` });
            remaining = 0;
          } else if (accepted === 0) {
            remaining = 0;
          } else {
            remaining -= accepted;
          }
        } catch (err) {
          apiFails += 1;
          errors.push({
            reason: err instanceof Error ? err.message : 'Generation batch failed',
          });
          if (apiFails >= 3) throw err;
          remaining = 0;
        }
        await updateJob(jobId, {
          progress_current: saved.length,
          created_count: saved.length,
          skipped_count: skipped,
          errors_json: JSON.stringify(errors.slice(0, 100)),
          prompt_tokens: usage.prompt,
          completion_tokens: usage.completion,
          estimated_cost_usd: estimateCost(env.OPENAI_MODEL || 'gpt-4o-mini', usage),
        });
      }
    }
    if (!saved.length) {
      throw new ValidationError(errors[0]?.reason || 'No questions passed validation');
    }
    const blueprint = localBlueprint({
      examName: request.examName,
      subject: request.subject,
      topic: request.topic,
      difficulty: request.difficulty,
      questionTypes: request.questionTypes,
    });
    const topicTestId = await attachDraftTest(
      organizationId,
      userId,
      `${request.examName} — ${request.topic} Topic Test`,
      'AI topic draft. Review and edit questions, then publish manually.',
      saved,
      blueprint,
    );
    const mockTestId = await attachDraftTest(
      organizationId,
      userId,
      `${request.examName} — ${request.topic} Mock Test`,
      'AI exam-pattern mock draft. Not live until a teacher publishes it.',
      saved,
      blueprint,
    );
    await updateJob(jobId, {
      status: 'completed',
      progress_current: saved.length,
      created_count: saved.length,
      skipped_count: skipped,
      errors_json: JSON.stringify(errors.slice(0, 100)),
      result_json: JSON.stringify({ questionIds: saved.map((q) => q.id), blueprint }),
      topic_test_id: topicTestId,
      mock_test_id: mockTestId,
      prompt_tokens: usage.prompt,
      completion_tokens: usage.completion,
      estimated_cost_usd: estimateCost(env.OPENAI_MODEL || 'gpt-4o-mini', usage),
      duration_ms: Date.now() - started,
      finished_at: new Date(),
      error_message: null,
    });
  } catch (err) {
    await updateJob(jobId, {
      status: 'failed',
      error_message: err instanceof Error ? err.message : 'Generation failed',
      errors_json: JSON.stringify(errors.slice(0, 100)),
      prompt_tokens: usage.prompt,
      completion_tokens: usage.completion,
      estimated_cost_usd: estimateCost(env.OPENAI_MODEL || 'gpt-4o-mini', usage),
      duration_ms: Date.now() - started,
      finished_at: new Date(),
    });
  }
}

async function mapTopics(input: AiGenerateRequest, usage: Usage) {
  if (!input.syllabusText?.trim()) {
    return [{ chapter: input.chapter || 'General', topic: input.topic }];
  }
  if (!isOpenAiConfigured) return localSyllabusTopics(input.syllabusText);
  try {
    const payload = await chatJson(
      'Map syllabus lines to chapter and topic names. Return JSON {"topics":[{"chapter":"","topic":""}]}. Do not invent unrelated subjects.',
      `Department: ${input.department}\nSubject: ${input.subject}\nSyllabus:\n${input.syllabusText.slice(0, 8000)}`,
      usage,
    );
    const list = Array.isArray(payload.topics) ? payload.topics : [];
    const topics = list
      .map((item) => {
        const row = asObject(item);
        return {
          chapter: String(row?.chapter ?? 'General').slice(0, 200) || 'General',
          topic: String(row?.topic ?? '').slice(0, 200),
        };
      })
      .filter((item) => item.topic.length > 1);
    return topics.length ? topics.slice(0, 20) : localSyllabusTopics(input.syllabusText);
  } catch {
    return localSyllabusTopics(input.syllabusText);
  }
}

export async function startQuestionGeneration(
  organizationId: string,
  userId: string,
  input: AiGenerateRequest,
) {
  const total = input.questionTypes.reduce((sum, item) => sum + item.count, 0);
  if (total < 1 || total > 200) {
    throw new ValidationError('Generate between 1 and 200 questions per job');
  }
  const created = await query<{ id: string }>(
    `INSERT INTO ai_generation_jobs (
       organization_id, created_by, kind, status, request_json, progress_total
     ) VALUES ($1,$2,'questions','queued',$3,$4) RETURNING id`,
    [organizationId, userId, JSON.stringify(input), total],
  );
  const id = created.rows[0].id;
  setImmediate(() => {
    void runGeneration(id);
  });
  return loadJob(id, organizationId);
}

export async function getGenerationJob(id: string, organizationId: string) {
  return loadJob(id, organizationId);
}

export async function listGenerationJobs(organizationId: string) {
  const rows = await query(
    `SELECT id, kind, status, progress_current, progress_total, created_count, skipped_count,
            error_message, topic_test_id, mock_test_id, prompt_tokens, completion_tokens,
            estimated_cost_usd, duration_ms, created_at, finished_at, request_json
     FROM ai_generation_jobs
     WHERE organization_id = $1
     ORDER BY created_at DESC
     LIMIT 50`,
    [organizationId],
  );
  return rows.rows.map((row) => parseJob(row as Record<string, unknown>));
}

export async function retryGenerationJob(id: string, organizationId: string, userId: string) {
  const job = await loadJob(id, organizationId);
  if (job.status !== 'failed') throw new ValidationError('Only failed jobs can be retried');
  const request = job.request_json as unknown as AiGenerateRequest;
  return startQuestionGeneration(organizationId, userId, request);
}

export async function getAiUsage(organizationId: string) {
  const rows = await query(
    `SELECT
       COUNT(*)::int AS requests,
       SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END)::int AS completed,
       SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END)::int AS failed,
       SUM(CASE WHEN status IN ('queued','running') THEN 1 ELSE 0 END)::int AS running,
       COALESCE(SUM(prompt_tokens),0)::int AS prompt_tokens,
       COALESCE(SUM(completion_tokens),0)::int AS completion_tokens,
       COALESCE(SUM(estimated_cost_usd),0) AS estimated_cost_usd,
       COALESCE(AVG(NULLIF(duration_ms,0)),0) AS avg_duration_ms
     FROM ai_generation_jobs
     WHERE organization_id = $1`,
    [organizationId],
  );
  const row = rows.rows[0] as Record<string, unknown>;
  return {
    ...row,
    estimated_cost_usd: Number(row.estimated_cost_usd ?? 0),
    avg_duration_ms: Number(row.avg_duration_ms ?? 0),
    openai_configured: isOpenAiConfigured,
    model: env.OPENAI_MODEL || 'gpt-4o-mini',
  };
}

export async function buildBlueprint(input: AiGenerateRequest) {
  const local = localBlueprint(input);
  if (!isOpenAiConfigured) return local;
  const usage: Usage = { prompt: 0, completion: 0 };
  try {
    const payload = await chatJson(
      'Create a balanced test blueprint. Return JSON with sections[{type,count,marksEach,difficulty}] and notes. Keep the same total question count.',
      JSON.stringify(local),
      usage,
    );
    const sections = Array.isArray(payload.sections) ? payload.sections : local.sections;
    return {
      ...local,
      sections,
      notes: String(payload.notes ?? local.notes),
      source: 'openai' as const,
      usage,
      estimated_cost_usd: estimateCost(env.OPENAI_MODEL || 'gpt-4o-mini', usage),
    };
  } catch {
    return local;
  }
}

export async function mapSyllabus(
  organizationId: string,
  input: AiGenerateRequest,
) {
  const usage: Usage = { prompt: 0, completion: 0 };
  const topics = await mapTopics(input, usage);
  const branchId = await ensureBranch(organizationId);
  const departmentId = await ensureDepartment(branchId, input.department);
  const subjectId = await ensureSubject(organizationId, departmentId, input.subject);
  const saved = [];
  for (const item of topics) {
    const chapterId = await ensureChapter(subjectId, item.chapter);
    const topicId = await ensureTopic(chapterId, item.topic);
    saved.push({ ...item, chapterId, topicId });
  }
  return {
    departmentId,
    subjectId,
    topics: saved,
    estimated_cost_usd: estimateCost(env.OPENAI_MODEL || 'gpt-4o-mini', usage),
  };
}

export async function recommendQuestions(
  organizationId: string,
  topicId: string | undefined,
  difficulty: number,
  targetMarks: number,
) {
  const params: unknown[] = [organizationId, difficulty];
  let topicSql = '';
  if (topicId) {
    params.push(topicId);
    topicSql = ` AND q.topic_id = $${params.length}`;
  }
  const rows = await query(
    `SELECT q.id, q.type, q.content, q.marks, q.difficulty, q.explanation, t.name AS topic_name
     FROM questions q
     LEFT JOIN topics t ON t.id = q.topic_id
     WHERE q.organization_id = $1 AND q.archived_at IS NULL AND q.status = 'approved'${topicSql}
     ORDER BY ABS(q.difficulty - $2), q.created_at DESC
     LIMIT 40`,
    params,
  );
  const picked: Record<string, unknown>[] = [];
  let marks = 0;
  for (const row of rows.rows) {
    const qMarks = Number((row as { marks: unknown }).marks ?? 1);
    if (marks > 0 && marks + qMarks > targetMarks) continue;
    picked.push({
      ...(row as Record<string, unknown>),
      content: textOf((row as { content: unknown }).content),
      reason: 'Matches the selected topic, difficulty, and remaining marks.',
    });
    marks += qMarks;
    if (marks >= targetMarks || picked.length >= 20) break;
  }
  return { questions: picked, total_marks: marks, target_marks: targetMarks };
}

export async function findDuplicateQuestions(organizationId: string) {
  const rows = await query(
    `SELECT id, content, type FROM questions
     WHERE organization_id = $1 AND archived_at IS NULL
     ORDER BY created_at DESC LIMIT 800`,
    [organizationId],
  );
  const items = rows.rows.map((row) => ({
    id: String((row as { id: string }).id),
    type: String((row as { type: string }).type),
    text: textOf((row as { content: unknown }).content),
  }));
  const pairs: { left: string; right: string; text: string }[] = [];
  for (let i = 0; i < items.length; i += 1) {
    for (let j = i + 1; j < items.length && j < i + 25; j += 1) {
      if (items[i].type !== items[j].type) continue;
      if (!isSimilar(items[i].text, items[j].text)) continue;
      pairs.push({
        left: items[i].id,
        right: items[j].id,
        text: items[i].text.slice(0, 160),
      });
      if (pairs.length >= 50) return { pairs };
    }
  }
  return { pairs };
}

async function loadQuestion(organizationId: string, questionId: string) {
  const question = await query(
    `SELECT id, type, content, explanation, marks, negative_marks, difficulty, language, topic_id
     FROM questions WHERE id = $1 AND organization_id = $2 AND archived_at IS NULL`,
    [questionId, organizationId],
  );
  if (!question.rows[0]) throw new NotFoundError('Question');
  const options = await query(
    `SELECT id, content, is_correct, sort_order FROM question_options WHERE question_id = $1 ORDER BY sort_order`,
    [questionId],
  );
  return { question: question.rows[0] as Record<string, unknown>, options: options.rows };
}

export async function improveQuestion(organizationId: string, questionId: string) {
  const current = await loadQuestion(organizationId, questionId);
  const usage: Usage = { prompt: 0, completion: 0 };
  const original = {
    type: current.question.type,
    text: textOf(current.question.content),
    explanation: current.question.explanation,
    marks: current.question.marks,
    difficulty: current.question.difficulty,
    options: current.options.map((row) => ({
      text: textOf((row as { content: unknown }).content),
      isCorrect: Boolean((row as { is_correct: unknown }).is_correct),
    })),
  };
  const payload = await chatJson(
    'Improve this assessment question. Fix grammar, clarify wording, and improve incorrect options. Do not change the learning objective or the correct answer. Return JSON {text, explanation, difficulty, options:[{text,isCorrect,whyWrong}]}.',
    JSON.stringify(original),
    usage,
  );
  const text = String(payload.text ?? original.text).trim();
  const explanation = String(payload.explanation ?? original.explanation ?? '').trim();
  const label = difficultyLabel(payload.difficulty, 'medium');
  const existing = asObject(current.question.content) ?? {};
  await query(
    `UPDATE questions SET content = $1, explanation = $2, difficulty = $3 WHERE id = $4 AND organization_id = $5`,
    [
      JSON.stringify({ ...existing, text, aiImproved: true, difficultyLabel: label }),
      explanation,
      difficultyNumber(label),
      questionId,
      organizationId,
    ],
  );
  const options = Array.isArray(payload.options) ? payload.options : [];
  if (options.length === current.options.length && options.length > 0) {
    for (let i = 0; i < options.length; i += 1) {
      const opt = asObject(options[i]) ?? {};
      const row = current.options[i] as { id: string };
      await query(
        `UPDATE question_options SET content = $1 WHERE id = $2 AND question_id = $3`,
        [JSON.stringify({ text: String(opt.text ?? '') }), row.id, questionId],
      );
    }
  }
  return {
    id: questionId,
    text,
    explanation,
    difficulty: label,
    estimated_cost_usd: estimateCost(env.OPENAI_MODEL || 'gpt-4o-mini', usage),
  };
}

export async function generateDistractors(
  organizationId: string,
  questionId: string,
  save: boolean,
  provided?: { text: string; isCorrect: boolean; whyWrong?: string }[],
) {
  const current = await loadQuestion(organizationId, questionId);
  const type = String(current.question.type);
  if (type !== 'mcq' && type !== 'msq') {
    throw new ValidationError('Distractors can be generated for MCQ and MSQ questions');
  }
  if (save && provided && provided.length >= 2) {
    await query(`DELETE FROM question_options WHERE question_id = $1`, [questionId]);
    for (let i = 0; i < provided.length; i += 1) {
      await query(
        `INSERT INTO question_options (question_id, content, is_correct, sort_order) VALUES ($1,$2,$3,$4)`,
        [questionId, JSON.stringify({ text: provided[i].text }), provided[i].isCorrect ? 1 : 0, i],
      );
    }
    return { options: provided, saved: true, estimated_cost_usd: 0 };
  }
  const usage: Usage = { prompt: 0, completion: 0 };
  const payload = await chatJson(
    'Write plausible incorrect options for this question. Do not change the correct option. Return JSON {"options":[{"text":"","isCorrect":false,"whyWrong":""}]}. Include the original correct option unchanged.',
    JSON.stringify({
      text: textOf(current.question.content),
      options: current.options.map((row) => ({
        text: textOf((row as { content: unknown }).content),
        isCorrect: Boolean((row as { is_correct: unknown }).is_correct),
      })),
    }),
    usage,
  );
  const options = (Array.isArray(payload.options) ? payload.options : [])
    .map((item) => {
      const row = asObject(item) ?? {};
      return {
        text: String(row.text ?? '').trim(),
        isCorrect: Boolean(row.isCorrect),
        whyWrong: String(row.whyWrong ?? '').trim(),
      };
    })
    .filter((item) => item.text);
  if (save && options.length >= 2) {
    await query(`DELETE FROM question_options WHERE question_id = $1`, [questionId]);
    for (let i = 0; i < options.length; i += 1) {
      await query(
        `INSERT INTO question_options (question_id, content, is_correct, sort_order) VALUES ($1,$2,$3,$4)`,
        [questionId, JSON.stringify({ text: options[i].text }), options[i].isCorrect ? 1 : 0, i],
      );
    }
  }
  return {
    options,
    saved: save,
    estimated_cost_usd: estimateCost(env.OPENAI_MODEL || 'gpt-4o-mini', usage),
  };
}

export async function practiceInsights(organizationId: string, userId: string) {
  const weak = await query(
    `SELECT t.id AS topic_id, t.name AS topic_name, c.name AS chapter_name, s.name AS subject_name,
            COUNT(aa.id)::int AS answered,
            SUM(CASE WHEN aa.is_correct = 1 THEN 1 ELSE 0 END)::int AS correct
     FROM attempt_answers aa
     JOIN test_attempts ta ON ta.id = aa.attempt_id
     JOIN students st ON st.id = ta.student_id
     JOIN questions q ON q.id = aa.question_id
     JOIN topics t ON t.id = q.topic_id
     LEFT JOIN chapters c ON c.id = t.chapter_id
     LEFT JOIN subjects s ON s.id = c.subject_id
     WHERE st.user_id = $1 AND st.organization_id = $2
       AND ta.status IN ('submitted','auto_submitted')
     GROUP BY t.id, t.name, c.name, s.name
     HAVING COUNT(aa.id) >= 1
     ORDER BY (SUM(CASE WHEN aa.is_correct = 1 THEN 1 ELSE 0 END) / COUNT(aa.id)) ASC
     LIMIT 5`,
    [userId, organizationId],
  );
  const topics = weak.rows.map((row) => {
    const item = row as { topic_id: string; topic_name: string; answered: number; correct: number; chapter_name?: string; subject_name?: string };
    const pct = item.answered ? Math.round((Number(item.correct) / Number(item.answered)) * 100) : 0;
    return { ...item, correct_pct: pct };
  });
  const recommendations = [];
  for (const topic of topics) {
    const questions = await query(
      `SELECT id, type, content, marks, difficulty FROM questions
       WHERE organization_id = $1 AND topic_id = $2 AND archived_at IS NULL AND status = 'approved'
       ORDER BY difficulty ASC LIMIT 3`,
      [organizationId, topic.topic_id],
    );
    recommendations.push({
      topic,
      questions: questions.rows.map((q) => ({
        ...(q as Record<string, unknown>),
        text: textOf((q as { content: unknown }).content).slice(0, 180),
      })),
    });
  }
  let summary = topics.length
    ? `Weakest topics: ${topics.map((t) => `${t.topic_name} (${t.correct_pct}%)`).join(', ')}. Practice the recommended questions before the next test.`
    : 'No submitted attempts yet, so there is no weak-topic list.';
  let estimated = 0;
  if (isOpenAiConfigured && topics.length) {
    const usage: Usage = { prompt: 0, completion: 0 };
    try {
      const payload = await chatJson(
        'Write a short study plan for a student. Return JSON {"summary":""}. Do not invent scores.',
        JSON.stringify(topics),
        usage,
      );
      if (typeof payload.summary === 'string' && payload.summary.trim()) summary = payload.summary.trim();
      estimated = estimateCost(env.OPENAI_MODEL || 'gpt-4o-mini', usage);
    } catch {
      estimated = 0;
    }
  }
  return { topics, recommendations, summary, estimated_cost_usd: estimated };
}

export async function reportInsights(organizationId: string, testId: string) {
  const analytics = await getTestQuestionAnalytics(testId, organizationId);
  if (!analytics) throw new NotFoundError('Test');
  const hard = analytics.hard_questions.slice(0, 5).map((q) => ({
    text: q.text,
    correct_pct: q.correct_pct,
    answered_count: q.answered_count,
  }));
  const weak = analytics.questions
    .filter((q) => q.correct_pct != null && q.correct_pct < 50)
    .slice(0, 8);
  let summary = hard.length
    ? `${hard.length} questions were answered correctly by fewer than half of the attempts. Review those items in class.`
    : 'Not enough submitted attempts to highlight weak questions yet.';
  const commonWrong = analytics.questions
    .map((q) => {
      const wrong = [...q.distractors].filter((d) => !d.is_correct).sort((a, b) => b.selected_count - a.selected_count)[0];
      return wrong && wrong.selected_count > 0
        ? { question: q.text, option: textOf(wrong.content), selected_pct: wrong.selected_pct }
        : null;
    })
    .filter(Boolean)
    .slice(0, 5);
  let estimated = 0;
  if (isOpenAiConfigured && (hard.length || commonWrong.length)) {
    const usage: Usage = { prompt: 0, completion: 0 };
    try {
      const payload = await chatJson(
        'Summarize this exam report for a teacher. Mention difficult questions, common wrong answers, weak topics, and what to reteach. Return JSON {"summary":""}. Use only the numbers provided.',
        JSON.stringify({ test: analytics.test, hard, commonWrong, weak: weak.map((q) => q.text) }),
        usage,
      );
      if (typeof payload.summary === 'string' && payload.summary.trim()) summary = payload.summary.trim();
      estimated = estimateCost(env.OPENAI_MODEL || 'gpt-4o-mini', usage);
    } catch {
      estimated = 0;
    }
  }
  return {
    summary,
    hard_questions: hard,
    common_wrong: commonWrong,
    weak_questions: weak.map((q) => ({ text: q.text, correct_pct: q.correct_pct })),
    estimated_cost_usd: estimated,
  };
}

export const AI_QUESTION_TYPES = QUESTION_TYPES;
