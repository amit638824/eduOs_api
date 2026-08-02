import { query } from '../config/database.js';
import { NotFoundError } from '../utils/errors.js';
import { PaginatedResult } from '../types/express.js';
import { sendEmail } from './email.service.js';
import { isSmtpConfigured } from '../config/env.js';

export async function listNotifications(userId: string, page: number, limit: number) {
  const offset = (page - 1) * limit;
  const [data, count] = await Promise.all([
    query(
      `SELECT id, channel, title, body, data, is_read, sent_at, created_at
       FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
      [userId, limit, offset],
    ),
    query(`SELECT COUNT(*)::int AS total FROM notifications WHERE user_id = $1`, [userId]),
  ]);
  const total = count.rows[0].total as number;
  return {
    data: data.rows,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  } satisfies PaginatedResult<unknown>;
}

export async function createNotification(input: {
  userId: string;
  channel: 'email' | 'sms' | 'push' | 'in_app';
  title: string;
  body: string;
  data?: Record<string, unknown>;
}) {
  const result = await query(
    `INSERT INTO notifications (user_id, channel, title, body, data, sent_at)
     VALUES ($1, $2, $3, $4, $5, NOW())
     RETURNING id, channel, title, body, is_read, created_at`,
    [input.userId, input.channel, input.title, input.body, JSON.stringify(input.data ?? {})],
  );

  if (input.channel === 'email' && isSmtpConfigured) {
    const user = await query<{ email: string }>(
      `SELECT email FROM users WHERE id = $1`,
      [input.userId],
    );
    if (user.rows[0]?.email) {
      void sendEmail({
        to: user.rows[0].email,
        subject: input.title,
        html: `<div style="font-family:Arial,sans-serif"><h3>${input.title}</h3><p>${input.body}</p></div>`,
        text: input.body,
      }).catch((err) => console.error('[email] notification failed:', err));
    }
  }

  return result.rows[0];
}

/** In-app notification for a user — never throws (safe to fire-and-forget). */
export async function notifyUserInApp(
  userId: string,
  title: string,
  body: string,
  data?: Record<string, unknown>,
) {
  try {
    if (!userId) return null;
    return await createNotification({
      userId,
      channel: 'in_app',
      title,
      body,
      data,
    });
  } catch (err) {
    console.error('[notification] notifyUserInApp failed:', err);
    return null;
  }
}

/** Resolve students.id → users.id and notify. */
export async function notifyStudentByStudentId(
  studentId: string,
  title: string,
  body: string,
  data?: Record<string, unknown>,
) {
  try {
    const row = await query<{ user_id: string }>(
      `SELECT user_id FROM students WHERE id = $1`,
      [studentId],
    );
    const userId = row.rows[0]?.user_id;
    if (!userId) return null;
    return await notifyUserInApp(userId, title, body, data);
  } catch (err) {
    console.error('[notification] notifyStudentByStudentId failed:', err);
    return null;
  }
}

/** Notify every student assigned to a test. */
export async function notifyAssignedStudents(
  testId: string,
  title: string,
  body: string,
  data?: Record<string, unknown>,
) {
  try {
    const rows = await query<{ user_id: string; student_id: string }>(
      `SELECT s.user_id, s.id AS student_id
       FROM test_assignments ta
       JOIN students s ON s.id = ta.assignee_id
       WHERE ta.test_id = $1 AND ta.assignee_type = 'student'`,
      [testId],
    );
    await Promise.all(
      rows.rows.map((r) =>
        notifyUserInApp(r.user_id, title, body, {
          ...data,
          testId,
          studentId: r.student_id,
        }),
      ),
    );
    return rows.rows.length;
  } catch (err) {
    console.error('[notification] notifyAssignedStudents failed:', err);
    return 0;
  }
}

export async function markNotificationRead(userId: string, notificationId: string) {
  const result = await query(
    `UPDATE notifications SET is_read = TRUE WHERE id = $1 AND user_id = $2 RETURNING id`,
    [notificationId, userId],
  );
  if (!result.rows[0]) throw new NotFoundError('Notification');
  return { message: 'Marked as read' };
}

export async function markAllNotificationsRead(userId: string) {
  await query(`UPDATE notifications SET is_read = TRUE WHERE user_id = $1 AND is_read = FALSE`, [
    userId,
  ]);
  return { message: 'All notifications marked as read' };
}

export async function getUnreadCount(userId: string) {
  const result = await query(
    `SELECT COUNT(*)::int AS count FROM notifications WHERE user_id = $1 AND is_read = FALSE`,
    [userId],
  );
  return { count: result.rows[0].count as number };
}
