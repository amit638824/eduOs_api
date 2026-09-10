import { query, withTransaction } from '../config/database.js';
import { ValidationError } from '../utils/errors.js';

const MAX_ROWS = 500;
const QUESTION_TYPES = new Set([
  'mcq',
  'msq',
  'true_false',
  'fill_blank',
  'integer',
  'numerical',
]);

export const QUESTION_IMPORT_CSV_TEMPLATE = `DEPARTMENT,SUBJECT,CHAPTER,TOPIC,TYPE,QUESTION,OPTION_A,OPTION_B,OPTION_C,OPTION_D,OPTION_E,CORRECT_ANSWER,MARKS,NEGATIVE_MARKS,DIFFICULTY,EXPLANATION,LANGUAGE,TAGS
Computer Science,Operating Systems,Process Management,CPU Scheduling,mcq,"Which scheduling algorithm may cause starvation?",FCFS,SJF,Round Robin,Priority,,B,1,0.25,2,"SJF can starve long processes",en,os;scheduling
Computer Science,Operating Systems,Process Management,CPU Scheduling,msq,"Which are preemptive scheduling algorithms?",Round Robin,FCFS,SRTF,Priority,,"A,C",1,0.25,3,"RR and SRTF can preempt a running process",en,os
Computer Science,Digital Logic,Boolean Algebra,Gates,true_false,"NAND is a universal gate.",,,,,,True,1,0,1,"NAND can implement any Boolean function",en,dl
Computer Science,DBMS,SQL,Joins,fill_blank,"The clause used to filter groups is _____.",,,,,,HAVING,1,0,2,"HAVING filters aggregated groups",en,sql
Computer Science,Computer Networks,OSI Model,Layers,integer,"How many layers are there in the OSI model?",,,,,,7,1,0,1,,en,cn
Computer Science,Algorithms,Complexity,Big-O,numerical,"log2(n) for n=16 equals?",,,,,,4,1,0,2,"2^4 = 16",en,algo
`;

type CsvRow = Record<string, string>;

export interface ImportRowResult {
  row: number;
  status: 'created' | 'skipped' | 'error';
  reason?: string;
  question?: string;
}

export interface ImportSummary {
  total: number;
  created: number;
  skipped: number;
  errors: number;
  createdDepartments: number;
  createdSubjects: number;
  createdChapters: number;
  createdTopics: number;
  rows: ImportRowResult[];
}

function parseCsv(text: string): CsvRow[] {
  const raw = text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const rows: string[][] = [];
  let field = '';
  let row: string[] = [];
  let inQuotes = false;

  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (inQuotes) {
      if (ch === '"') {
        if (raw[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      continue;
    }
    if (ch === ',') {
      row.push(field.trim());
      field = '';
      continue;
    }
    if (ch === '\n') {
      row.push(field.trim());
      field = '';
      if (row.some((c) => c.length > 0)) rows.push(row);
      row = [];
      continue;
    }
    field += ch;
  }
  row.push(field.trim());
  if (row.some((c) => c.length > 0)) rows.push(row);

  if (rows.length < 2) {
    throw new ValidationError('CSV must include a header row and at least one question');
  }

  const headers = rows[0].map((h) => normalizeHeader(h));
  return rows.slice(1).map((cols) => {
    const obj: CsvRow = {};
    headers.forEach((h, i) => {
      if (h) obj[h] = cols[i] ?? '';
    });
    return obj;
  });
}

function normalizeHeader(h: string): string {
  const key = h.trim().toLowerCase().replace(/[\s-]+/g, '_');
  const aliases: Record<string, string> = {
    dept: 'department',
    subject_name: 'subject',
    unit: 'chapter',
    subtopic: 'topic',
    question_type: 'type',
    qtype: 'type',
    question_text: 'question',
    question_stem: 'question',
    text: 'question',
    option1: 'option_a',
    option2: 'option_b',
    option3: 'option_c',
    option4: 'option_d',
    option5: 'option_e',
    a: 'option_a',
    b: 'option_b',
    c: 'option_c',
    d: 'option_d',
    e: 'option_e',
    answer: 'correct_answer',
    actual_answer: 'correct_answer',
    correct: 'correct_answer',
    correct_option: 'correct_answer',
    dept_name: 'department',
    option_1: 'option_a',
    option_2: 'option_b',
    option_3: 'option_c',
    option_4: 'option_d',
    option_5: 'option_e',
    mark: 'marks',
    negative: 'negative_marks',
    neg_marks: 'negative_marks',
    lang: 'language',
  };
  return aliases[key] ?? key;
}

function cell(row: CsvRow, ...keys: string[]): string {
  for (const k of keys) {
    const v = row[k]?.trim();
    if (v) return v;
  }
  return '';
}

function normName(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLowerCase();
}

function normQuestion(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLowerCase();
}

function mapType(raw: string): string {
  const t = raw.trim().toLowerCase().replace(/[\s/-]+/g, '_');
  const aliases: Record<string, string> = {
    mcq: 'mcq',
    single: 'mcq',
    single_choice: 'mcq',
    msq: 'msq',
    multiple: 'msq',
    multi: 'msq',
    multiple_choice: 'msq',
    true_false: 'true_false',
    truefalse: 'true_false',
    tf: 'true_false',
    boolean: 'true_false',
    fill_blank: 'fill_blank',
    fill: 'fill_blank',
    fib: 'fill_blank',
    fill_in_the_blank: 'fill_blank',
    integer: 'integer',
    numerical: 'numerical',
    numeric: 'numerical',
  };
  return aliases[t] ?? t;
}

function parseCorrectTokens(raw: string): string[] {
  return raw
    .split(/[,|;/]+/)
    .map((p) => p.trim())
    .filter(Boolean);
}

function optionLetterIndex(token: string): number | null {
  const t = token.trim().toUpperCase();
  if (/^[A-E]$/.test(t)) return t.charCodeAt(0) - 65;
  if (/^[1-5]$/.test(t)) return Number(t) - 1;
  return null;
}

function isTrueToken(token: string): boolean {
  return /^(true|t|yes|y|1)$/i.test(token.trim());
}

function isFalseToken(token: string): boolean {
  return /^(false|f|no|n|0)$/i.test(token.trim());
}

function questionTextFromContent(content: unknown): string {
  if (content == null) return '';
  try {
    const obj = typeof content === 'string' ? JSON.parse(content) : content;
    return typeof obj?.text === 'string' ? obj.text : '';
  } catch {
    return '';
  }
}

interface OptionIn {
  content: Record<string, unknown>;
  isCorrect: boolean;
  sortOrder: number;
}

function buildOptions(type: string, row: CsvRow): OptionIn[] {
  const correctRaw = cell(row, 'correct_answer');
  if (!correctRaw) throw new Error('correct_answer is required');

  if (type === 'true_false') {
    const tokens = parseCorrectTokens(correctRaw);
    const first = tokens[0] ?? '';
    if (!isTrueToken(first) && !isFalseToken(first)) {
      throw new Error('correct_answer for true_false must be True or False');
    }
    const isTrue = isTrueToken(first);
    return [
      { content: { text: 'True' }, isCorrect: isTrue, sortOrder: 0 },
      { content: { text: 'False' }, isCorrect: !isTrue, sortOrder: 1 },
    ];
  }

  if (type === 'fill_blank') {
    return [{ content: { text: correctRaw }, isCorrect: true, sortOrder: 0 }];
  }

  if (type === 'integer' || type === 'numerical') {
    const num = Number(correctRaw);
    if (!Number.isFinite(num)) throw new Error('correct_answer must be a number');
    return [{ content: { value: num, text: correctRaw }, isCorrect: true, sortOrder: 0 }];
  }

  const texts = [
    cell(row, 'option_a'),
    cell(row, 'option_b'),
    cell(row, 'option_c'),
    cell(row, 'option_d'),
    cell(row, 'option_e'),
  ];
  const present = texts
    .map((text, i) => ({ text, i }))
    .filter((o) => o.text.length > 0);
  if (present.length < 2) throw new Error('MCQ/MSQ needs at least two options');

  const tokens = parseCorrectTokens(correctRaw);
  const correctIdx = new Set<number>();
  for (const token of tokens) {
    const byLetter = optionLetterIndex(token);
    if (byLetter != null && texts[byLetter]) {
      correctIdx.add(byLetter);
      continue;
    }
    const byText = present.find((o) => normName(o.text) === normName(token));
    if (byText) {
      correctIdx.add(byText.i);
      continue;
    }
    throw new Error(`correct_answer "${token}" does not match an option`);
  }
  if (correctIdx.size === 0) throw new Error('No correct option resolved');
  if (type === 'mcq' && correctIdx.size !== 1) {
    throw new Error('MCQ must have exactly one correct_answer');
  }

  return present.map((o, sortOrder) => ({
    content: { text: o.text },
    isCorrect: correctIdx.has(o.i),
    sortOrder,
  }));
}

async function getDefaultBranchId(organizationId: string): Promise<string> {
  const result = await query<{ id: string }>(
    `SELECT id FROM branches
     WHERE organization_id = $1 AND deleted_at IS NULL
     ORDER BY created_at ASC LIMIT 1`,
    [organizationId],
  );
  if (!result.rows[0]) {
    throw new ValidationError('Create a branch before importing questions');
  }
  return result.rows[0].id;
}

export async function importQuestionsFromCsv(
  organizationId: string,
  userId: string,
  csvText: string,
): Promise<ImportSummary> {
  const parsed = parseCsv(csvText);
  if (parsed.length > MAX_ROWS) {
    throw new ValidationError(`CSV cannot have more than ${MAX_ROWS} questions`);
  }

  const branchId = await getDefaultBranchId(organizationId);
  const deptCache = new Map<string, string>();
  const subjectCache = new Map<string, string>();
  const chapterCache = new Map<string, string>();
  const topicCache = new Map<string, string>();
  const seenKeys = new Set<string>();

  const existing = await query<{ topic_id: string | null; type: string; content: unknown }>(
    `SELECT topic_id, type, content FROM questions
     WHERE organization_id = $1 AND archived_at IS NULL`,
    [organizationId],
  );
  for (const q of existing.rows) {
    const text = normQuestion(questionTextFromContent(q.content));
    if (q.topic_id && text) seenKeys.add(`${q.topic_id}|${q.type}|${text}`);
  }

  const summary: ImportSummary = {
    total: 0,
    created: 0,
    skipped: 0,
    errors: 0,
    createdDepartments: 0,
    createdSubjects: 0,
    createdChapters: 0,
    createdTopics: 0,
    rows: [],
  };

  const ensureDepartment = async (name: string): Promise<string> => {
    const key = normName(name);
    const cached = deptCache.get(key);
    if (cached) return cached;
    const found = await query<{ id: string }>(
      `SELECT d.id FROM departments d
       JOIN branches b ON b.id = d.branch_id
       WHERE b.organization_id = $1 AND LOWER(TRIM(d.name)) = $2 AND d.deleted_at IS NULL
       LIMIT 1`,
      [organizationId, key],
    );
    if (found.rows[0]) {
      deptCache.set(key, found.rows[0].id);
      return found.rows[0].id;
    }
    const created = await query<{ id: string }>(
      `INSERT INTO departments (branch_id, name) VALUES ($1, $2) RETURNING id`,
      [branchId, name.trim()],
    );
    summary.createdDepartments += 1;
    deptCache.set(key, created.rows[0].id);
    return created.rows[0].id;
  };

  const ensureSubject = async (departmentId: string, name: string): Promise<string> => {
    const key = `${departmentId}|${normName(name)}`;
    const cached = subjectCache.get(key);
    if (cached) return cached;
    const found = await query<{ id: string }>(
      `SELECT id FROM subjects
       WHERE organization_id = $1 AND department_id = $2 AND LOWER(TRIM(name)) = $3
       LIMIT 1`,
      [organizationId, departmentId, normName(name)],
    );
    if (found.rows[0]) {
      subjectCache.set(key, found.rows[0].id);
      return found.rows[0].id;
    }
    const created = await query<{ id: string }>(
      `INSERT INTO subjects (organization_id, department_id, name)
       VALUES ($1, $2, $3) RETURNING id`,
      [organizationId, departmentId, name.trim()],
    );
    summary.createdSubjects += 1;
    subjectCache.set(key, created.rows[0].id);
    return created.rows[0].id;
  };

  const ensureChapter = async (subjectId: string, name: string): Promise<string> => {
    const key = `${subjectId}|${normName(name)}`;
    const cached = chapterCache.get(key);
    if (cached) return cached;
    const found = await query<{ id: string }>(
      `SELECT id FROM chapters WHERE subject_id = $1 AND LOWER(TRIM(name)) = $2 LIMIT 1`,
      [subjectId, normName(name)],
    );
    if (found.rows[0]) {
      chapterCache.set(key, found.rows[0].id);
      return found.rows[0].id;
    }
    const created = await query<{ id: string }>(
      `INSERT INTO chapters (subject_id, name, sort_order) VALUES ($1, $2, 0) RETURNING id`,
      [subjectId, name.trim()],
    );
    summary.createdChapters += 1;
    chapterCache.set(key, created.rows[0].id);
    return created.rows[0].id;
  };

  const ensureTopic = async (chapterId: string, name: string): Promise<string> => {
    const key = `${chapterId}|${normName(name)}`;
    const cached = topicCache.get(key);
    if (cached) return cached;
    const found = await query<{ id: string }>(
      `SELECT id FROM topics WHERE chapter_id = $1 AND LOWER(TRIM(name)) = $2 LIMIT 1`,
      [chapterId, normName(name)],
    );
    if (found.rows[0]) {
      topicCache.set(key, found.rows[0].id);
      return found.rows[0].id;
    }
    const created = await query<{ id: string }>(
      `INSERT INTO topics (chapter_id, name, tags) VALUES ($1, $2, $3) RETURNING id`,
      [chapterId, name.trim(), JSON.stringify([])],
    );
    summary.createdTopics += 1;
    topicCache.set(key, created.rows[0].id);
    return created.rows[0].id;
  };

  for (let i = 0; i < parsed.length; i++) {
    const row = parsed[i];
    const line = i + 2;
    if (Object.values(row).every((v) => !String(v ?? '').trim())) continue;
    summary.total += 1;
    const questionText = cell(row, 'question');
    try {
      const department = cell(row, 'department');
      const subject = cell(row, 'subject');
      const chapter = cell(row, 'chapter') || 'General';
      const topic = cell(row, 'topic');
      const type = mapType(cell(row, 'type'));
      if (!department) throw new Error('department is required');
      if (!subject) throw new Error('subject is required');
      if (!topic) throw new Error('topic is required');
      if (!questionText) throw new Error('question is required');
      if (!QUESTION_TYPES.has(type)) throw new Error(`unsupported type "${cell(row, 'type')}"`);

      const marks = Number(cell(row, 'marks') || '1');
      if (!Number.isFinite(marks) || marks <= 0) throw new Error('marks must be greater than 0');
      const negativeMarks = Number(cell(row, 'negative_marks') || '0');
      if (!Number.isFinite(negativeMarks) || negativeMarks < 0) {
        throw new Error('negative_marks must be 0 or more');
      }
      const difficultyRaw = cell(row, 'difficulty');
      const difficulty = difficultyRaw ? Number(difficultyRaw) : 2;
      if (!Number.isInteger(difficulty) || difficulty < 1 || difficulty > 5) {
        throw new Error('difficulty must be 1–5');
      }
      const options = buildOptions(type, row);
      const departmentId = await ensureDepartment(department);
      const subjectId = await ensureSubject(departmentId, subject);
      const chapterId = await ensureChapter(subjectId, chapter);
      const topicId = await ensureTopic(chapterId, topic);

      const dupKey = `${topicId}|${type}|${normQuestion(questionText)}`;
      if (seenKeys.has(dupKey)) {
        summary.skipped += 1;
        summary.rows.push({
          row: line,
          status: 'skipped',
          reason: 'Duplicate question in this topic',
          question: questionText.slice(0, 120),
        });
        continue;
      }

      const tags = cell(row, 'tags')
        .split(/[,;|]+/)
        .map((t) => t.trim())
        .filter(Boolean);
      const explanation = cell(row, 'explanation') || undefined;
      const language = cell(row, 'language') || 'en';

      await withTransaction(async (client) => {
        const created = await client.query<{ id: string }>(
          `INSERT INTO questions (
             organization_id, topic_id, created_by, type, content, explanation,
             marks, negative_marks, difficulty, language, status, approved_by, approved_at
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'approved',$3,NOW())
           RETURNING id`,
          [
            organizationId,
            topicId,
            userId,
            type,
            JSON.stringify({ text: questionText, tags }),
            explanation ?? null,
            marks,
            negativeMarks,
            difficulty,
            language,
          ],
        );
        for (const opt of options) {
          await client.query(
            `INSERT INTO question_options (question_id, content, is_correct, sort_order)
             VALUES ($1, $2, $3, $4)`,
            [created.rows[0].id, JSON.stringify(opt.content), opt.isCorrect, opt.sortOrder],
          );
        }
      });

      seenKeys.add(dupKey);
      summary.created += 1;
      summary.rows.push({
        row: line,
        status: 'created',
        question: questionText.slice(0, 120),
      });
    } catch (err) {
      summary.errors += 1;
      summary.rows.push({
        row: line,
        status: 'error',
        reason: err instanceof Error ? err.message : 'Invalid row',
        question: questionText.slice(0, 120) || undefined,
      });
    }
  }

  return summary;
}
