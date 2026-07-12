import { query } from '../config/database.js';
import { NotFoundError } from '../utils/errors.js';
import { PaginatedResult } from '../types/express.js';

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
  return result.rows[0];
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
