import { query } from '../config/database.js';
import { ForbiddenError, NotFoundError, ValidationError } from '../utils/errors.js';
import { PaginatedResult } from '../types/express.js';
import * as razorpayService from './razorpay.service.js';
import { sendPaymentConfirmationEmail } from './email.service.js';
import { isSmtpConfigured } from '../config/env.js';
import * as notificationService from './notification.service.js';

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

export async function getPaymentConfig() {
  return {
    razorpayKeyId: razorpayService.getRazorpayKeyId(),
    currency: 'INR',
    gateway: razorpayService.getRazorpayKeyId() ? 'razorpay' : 'demo',
  };
}

export async function createRazorpayOrder(
  organizationId: string,
  userId: string,
  amount: number,
  userEmail: string,
) {
  if (!razorpayService.getRazorpayKeyId()) {
    throw new ValidationError('Payment gateway is not configured');
  }

  const payment = await query<{ id: string }>(
    `INSERT INTO payments (organization_id, user_id, amount, currency, status, metadata)
     VALUES ($1, $2, $3, 'INR', 'pending', $4)
     RETURNING id`,
    [
      organizationId,
      userId,
      amount,
      JSON.stringify({ gateway: 'razorpay', email: userEmail }),
    ],
  );

  const paymentId = payment.rows[0].id;
  const order = await razorpayService.createOrder(amount, paymentId.replace(/-/g, '').slice(0, 40), {
    paymentId,
    userId,
    organizationId,
  });

  await query(
    `UPDATE payments SET gateway_ref = $2,
       metadata = metadata || $3::jsonb, updated_at = NOW()
     WHERE id = $1`,
    [paymentId, order.id, JSON.stringify({ razorpayOrderId: order.id })],
  );

  return {
    paymentId,
    orderId: order.id,
    amount: order.amount,
    currency: order.currency,
    keyId: razorpayService.getRazorpayKeyId(),
  };
}

export async function verifyRazorpayPayment(
  organizationId: string,
  userId: string,
  input: {
    paymentId: string;
    razorpayOrderId: string;
    razorpayPaymentId: string;
    razorpaySignature: string;
  },
) {
  const valid = razorpayService.verifyPaymentSignature(
    input.razorpayOrderId,
    input.razorpayPaymentId,
    input.razorpaySignature,
  );
  if (!valid) {
    await query(
      `UPDATE payments SET status = 'failed', metadata = metadata || $2::jsonb, updated_at = NOW()
       WHERE id = $1 AND user_id = $3`,
      [input.paymentId, JSON.stringify({ failedReason: 'invalid_signature' }), userId],
    );
    throw new ValidationError('Payment verification failed');
  }

  const result = await query<{ id: string; amount: string }>(
    `UPDATE payments SET status = 'completed', gateway_ref = $2,
       metadata = metadata || $3::jsonb, updated_at = NOW()
     WHERE id = $1 AND organization_id = $4 AND user_id = $5 AND status = 'pending'
     RETURNING id, amount, user_id`,
    [
      input.paymentId,
      input.razorpayPaymentId,
      JSON.stringify({
        razorpayOrderId: input.razorpayOrderId,
        razorpayPaymentId: input.razorpayPaymentId,
      }),
      organizationId,
      userId,
    ],
  );

  if (!result.rows[0]) {
    throw new NotFoundError('Payment');
  }

  const user = await query<{ email: string }>(
    `SELECT email FROM users WHERE id = $1`,
    [userId],
  );

  if (isSmtpConfigured && user.rows[0]?.email) {
    await sendPaymentConfirmationEmail(
      user.rows[0].email,
      Number(result.rows[0].amount),
      'INR',
      input.razorpayPaymentId,
    );
  }

  await notificationService.createNotification({
    userId,
    channel: 'in_app',
    title: 'Payment Successful',
    body: `Your payment of ₹${result.rows[0].amount} was successful.`,
    data: { paymentId: input.paymentId, razorpayPaymentId: input.razorpayPaymentId },
  });

  return result.rows[0];
}
