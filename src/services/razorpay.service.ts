import crypto from 'node:crypto';
import Razorpay from 'razorpay';
import { env, isRazorpayConfigured } from '../config/env.js';
import { ValidationError } from '../utils/errors.js';

let client: Razorpay | null = null;

function getRazorpay(): Razorpay {
  if (!isRazorpayConfigured) {
    throw new ValidationError('Razorpay is not configured');
  }
  if (!client) {
    client = new Razorpay({
      key_id: env.RAZORPAY_KEY_ID!,
      key_secret: env.RAZORPAY_KEY_SECRET!,
    });
  }
  return client;
}

export function getRazorpayKeyId(): string | null {
  return env.RAZORPAY_KEY_ID ?? null;
}

export async function createOrder(amountInRupees: number, receipt: string, notes?: Record<string, string>) {
  const razorpay = getRazorpay();
  const amountPaise = Math.round(amountInRupees * 100);

  if (amountPaise < 100) {
    throw new ValidationError('Minimum payment amount is ₹1');
  }

  const order = await razorpay.orders.create({
    amount: amountPaise,
    currency: 'INR',
    receipt,
    notes: notes ?? {},
  });

  return order;
}

export function verifyPaymentSignature(
  orderId: string,
  paymentId: string,
  signature: string,
): boolean {
  if (!env.RAZORPAY_KEY_SECRET) return false;
  const expected = crypto
    .createHmac('sha256', env.RAZORPAY_KEY_SECRET)
    .update(`${orderId}|${paymentId}`)
    .digest('hex');
  return expected === signature;
}
