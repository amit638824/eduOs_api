import { query } from '../config/database.js';
import { ForbiddenError, NotFoundError } from '../utils/errors.js';
import { PaginatedResult } from '../types/express.js';

export async function listPayments(
  organizationId: string,
  page: number,
  limit: number,
  userId?: string,
) {
  const offset = (page - 1) * limit;
  const params: unknown[] = [organizationId];
  let where = 'p.organization_id = $1';
  if (userId) {
    params.push(userId);
    where += ` AND p.user_id = $${params.length}`;
  }
  params.push(limit, offset);

  const [data, count] = await Promise.all([
    query(
      `SELECT p.id, p.user_id, p.amount, p.currency, p.status, p.gateway_ref, p.metadata, p.created_at,
              u.email, u.first_name, u.last_name
       FROM payments p JOIN users u ON u.id = p.user_id
       WHERE ${where} ORDER BY p.created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    ),
    query(`SELECT COUNT(*)::int AS total FROM payments p WHERE ${where}`, params.slice(0, -2)),
  ]);
  const total = count.rows[0].total as number;
  return {
    data: data.rows,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  } satisfies PaginatedResult<unknown>;
}

export async function createPayment(
  organizationId: string,
  input: {
    userId: string;
    amount: number;
    currency?: string;
    metadata?: Record<string, unknown>;
  },
  requesterOrgId: string | null,
  isSuperAdmin: boolean,
) {
  if (!isSuperAdmin && requesterOrgId !== organizationId) {
    throw new ForbiddenError('Cannot create payments for another organization');
  }
  const result = await query(
    `INSERT INTO payments (organization_id, user_id, amount, currency, status, metadata)
     VALUES ($1, $2, $3, $4, 'pending', $5)
     RETURNING id, amount, currency, status, created_at`,
    [
      organizationId,
      input.userId,
      input.amount,
      input.currency ?? 'INR',
      JSON.stringify(input.metadata ?? {}),
    ],
  );
  return result.rows[0];
}

export async function updatePaymentStatus(
  paymentId: string,
  status: 'pending' | 'completed' | 'failed' | 'refunded',
  organizationId: string,
  gatewayRef?: string,
) {
  const result = await query(
    `UPDATE payments SET status = $2, gateway_ref = COALESCE($3, gateway_ref), updated_at = NOW()
     WHERE id = $1 AND organization_id = $4
     RETURNING id, status, gateway_ref, updated_at`,
    [paymentId, status, gatewayRef ?? null, organizationId],
  );
  if (!result.rows[0]) throw new NotFoundError('Payment');
  return result.rows[0];
}

export async function getWalletSummary(userId: string, organizationId: string) {
  const result = await query(
    `SELECT
       COALESCE(SUM(CASE WHEN status = 'completed' THEN amount ELSE 0 END), 0) AS total_paid,
       COALESCE(SUM(CASE WHEN status = 'pending' THEN amount ELSE 0 END), 0) AS pending,
       COUNT(*)::int AS transaction_count
     FROM payments WHERE user_id = $1 AND organization_id = $2`,
    [userId, organizationId],
  );
  return result.rows[0];
}
