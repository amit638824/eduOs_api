import { query, withTransaction } from '../config/database.js';
import { ForbiddenError, NotFoundError } from '../utils/errors.js';
import { PaginatedResult } from '../types/express.js';

export interface QuestionOptionInput {
  content: Record<string, unknown>;
  isCorrect: boolean;
  sortOrder?: number;
}

export interface CreateQuestionInput {
  type: string;
  content: Record<string, unknown>;
  explanation?: string;
  marks?: number;
  negativeMarks?: number;
  difficulty?: number;
  language?: string;
  categoryId?: string;
  topicId?: string;
  options?: QuestionOptionInput[];
}

export async function listQuestions(
  organizationId: string,
  page: number,
  limit: number,
  filters?: { status?: string; type?: string },
) {
  const offset = (page - 1) * limit;
  const params: unknown[] = [organizationId];
  let where = 'q.organization_id = $1 AND q.archived_at IS NULL';
  if (filters?.status) {
    params.push(filters.status);
    where += ` AND q.status = $${params.length}`;
  }
  if (filters?.type) {
    params.push(filters.type);
    where += ` AND q.type = $${params.length}`;
  }
  params.push(limit, offset);

  const [data, count] = await Promise.all([
    query(
      `SELECT q.id, q.organization_id, q.category_id, q.topic_id, q.type, q.status, q.content, q.marks,
              q.negative_marks, q.difficulty, q.language, q.version, q.created_at, q.updated_at,
              t.name AS topic_name, s.name AS subject_name, d.name AS department_name
       FROM questions q
       LEFT JOIN topics t ON t.id = q.topic_id
       LEFT JOIN chapters c ON c.id = t.chapter_id
       LEFT JOIN subjects s ON s.id = c.subject_id
       LEFT JOIN departments d ON d.id = s.department_id
       WHERE ${where}
       ORDER BY q.created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    ),
    query(
      `SELECT COUNT(*)::int AS total FROM questions q WHERE ${where}`,
      params.slice(0, -2),
    ),
  ]);
  const total = count.rows[0].total as number;
  return {
    data: data.rows,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  } satisfies PaginatedResult<unknown>;
}

export async function getQuestionById(id: string, organizationId: string) {
  const question = await query(
    `SELECT q.id, q.organization_id, q.category_id, q.topic_id, q.type, q.status, q.content, q.explanation,
            q.marks, q.negative_marks, q.difficulty, q.language, q.version, q.created_at, q.updated_at,
            t.name AS topic_name, c.subject_id, s.name AS subject_name, s.department_id, d.name AS department_name
     FROM questions q
     LEFT JOIN topics t ON t.id = q.topic_id
     LEFT JOIN chapters c ON c.id = t.chapter_id
     LEFT JOIN subjects s ON s.id = c.subject_id
     LEFT JOIN departments d ON d.id = s.department_id
     WHERE q.id = $1 AND q.organization_id = $2 AND q.archived_at IS NULL`,
    [id, organizationId],
  );
  if (!question.rows[0]) throw new NotFoundError('Question');

  const options = await query(
    `SELECT id, content, is_correct, sort_order FROM question_options
     WHERE question_id = $1 ORDER BY sort_order`,
    [id],
  );

  return { ...question.rows[0], options: options.rows };
}

export async function createQuestion(
  organizationId: string,
  userId: string,
  input: CreateQuestionInput,
) {
  return withTransaction(async (client) => {
    await assertRelatedIdsInOrg(client, organizationId, input);

    const q = await client.query(
      `INSERT INTO questions (
         organization_id, category_id, topic_id, created_by, type, content, explanation,
         marks, negative_marks, difficulty, language, status
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'draft')
       RETURNING id, organization_id, type, status, content, marks, created_at`,
      [
        organizationId,
        input.categoryId ?? null,
        input.topicId ?? null,
        userId,
        input.type,
        JSON.stringify(input.content),
        input.explanation ?? null,
        input.marks ?? 1,
        input.negativeMarks ?? 0,
        input.difficulty ?? null,
        input.language ?? 'en',
      ],
    );
    const question = q.rows[0];

    if (input.options?.length) {
      for (const [i, opt] of input.options.entries()) {
        await client.query(
          `INSERT INTO question_options (question_id, content, is_correct, sort_order)
           VALUES ($1, $2, $3, $4)`,
          [question.id, JSON.stringify(opt.content), opt.isCorrect, opt.sortOrder ?? i],
        );
      }
    }

    return question;
  });
}

export async function updateQuestion(
  id: string,
  organizationId: string,
  input: CreateQuestionInput,
) {
  return withTransaction(async (client) => {
    const existing = await client.query(
      `SELECT id FROM questions WHERE id = $1 AND organization_id = $2 AND archived_at IS NULL`,
      [id, organizationId],
    );
    if (!existing.rows[0]) throw new NotFoundError('Question');

    await assertRelatedIdsInOrg(client, organizationId, input);

    const q = await client.query(
      `UPDATE questions SET
         topic_id = $3,
         type = $4,
         content = $5,
         explanation = $6,
         marks = $7,
         negative_marks = $8,
         difficulty = $9,
         language = $10,
         category_id = $11,
         updated_at = NOW()
       WHERE id = $1 AND organization_id = $2
       RETURNING id, organization_id, type, status, content, marks, topic_id, updated_at`,
      [
        id,
        organizationId,
        input.topicId ?? null,
        input.type,
        JSON.stringify(input.content),
        input.explanation ?? null,
        input.marks ?? 1,
        input.negativeMarks ?? 0,
        input.difficulty ?? null,
        input.language ?? 'en',
        input.categoryId ?? null,
      ],
    );

    await client.query(`DELETE FROM question_options WHERE question_id = $1`, [id]);

    if (input.options?.length) {
      for (const [i, opt] of input.options.entries()) {
        await client.query(
          `INSERT INTO question_options (question_id, content, is_correct, sort_order)
           VALUES ($1, $2, $3, $4)`,
          [id, JSON.stringify(opt.content), opt.isCorrect, opt.sortOrder ?? i],
        );
      }
    }

    return q.rows[0];
  });
}

export async function deleteQuestion(id: string, organizationId: string) {
  const result = await query(
    `UPDATE questions SET archived_at = NOW(), updated_at = NOW()
     WHERE id = $1 AND organization_id = $2 AND archived_at IS NULL
     RETURNING id`,
    [id, organizationId],
  );
  if (!result.rows[0]) throw new NotFoundError('Question');
  return { id: result.rows[0].id, deleted: true };
}

export async function approveQuestion(id: string, organizationId: string, approverId: string) {
  const result = await query(
    `UPDATE questions SET status = 'approved', approved_by = $3, approved_at = NOW(), updated_at = NOW()
     WHERE id = $1 AND organization_id = $2 AND archived_at IS NULL
     RETURNING id, status, approved_at`,
    [id, organizationId, approverId],
  );
  if (!result.rows[0]) throw new NotFoundError('Question');
  return result.rows[0];
}

export async function listCategories(organizationId: string) {
  const result = await query(
    `SELECT id, name, parent_id, created_at FROM question_categories
     WHERE organization_id = $1 ORDER BY name`,
    [organizationId],
  );
  return result.rows;
}

export async function createCategory(organizationId: string, input: { name: string; parentId?: string }) {
  const result = await query(
    `INSERT INTO question_categories (organization_id, name, parent_id)
     VALUES ($1, $2, $3) RETURNING id, name, parent_id, created_at`,
    [organizationId, input.name, input.parentId ?? null],
  );
  return result.rows[0];
}

async function assertRelatedIdsInOrg(
  client: { query: (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }> },
  organizationId: string,
  input: CreateQuestionInput,
) {
  if (input.topicId) {
    const topic = await client.query(
      `SELECT t.id
       FROM topics t
       JOIN chapters c ON c.id = t.chapter_id
       JOIN subjects s ON s.id = c.subject_id
       JOIN departments d ON d.id = s.department_id
       JOIN branches b ON b.id = d.branch_id
       WHERE t.id = $1 AND b.organization_id = $2`,
      [input.topicId, organizationId],
    );
    if (!topic.rows[0]) throw new ForbiddenError('Topic does not belong to the selected organization');
  }
  if (input.categoryId) {
    const category = await client.query(
      `SELECT id FROM question_categories WHERE id = $1 AND organization_id = $2`,
      [input.categoryId, organizationId],
    );
    if (!category.rows[0]) {
      throw new ForbiddenError('Category does not belong to the selected organization');
    }
  }
}
