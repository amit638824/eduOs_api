import nodemailer from 'nodemailer';
import { env, bccEmails, isSmtpConfigured } from '../config/env.js';

let transporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter | null {
  if (!isSmtpConfigured) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: false,
      auth: {
        user: env.SMTP_USER,
        pass: env.SMTP_PASS,
      },
      tls: { ciphers: 'SSLv3', rejectUnauthorized: false },
    });
  }
  return transporter;
}

export interface SendEmailInput {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
}

export async function sendEmail(input: SendEmailInput): Promise<boolean> {
  const mailer = getTransporter();
  if (!mailer) {
    console.warn('[email] SMTP not configured — skipping send to', input.to);
    return false;
  }

  const from = env.SMTP_FROM ?? env.SMTP_USER ?? 'noreply@edutech.com';

  await mailer.sendMail({
    from: `"${env.APP_NAME}" <${from}>`,
    to: input.to,
    bcc: bccEmails.length > 0 ? bccEmails : undefined,
    subject: input.subject,
    html: input.html,
    text: input.text,
  });

  return true;
}

export async function sendPasswordResetEmail(email: string, resetToken: string): Promise<boolean> {
  const resetUrl = `${env.FRONTEND_URL}/reset-password?token=${encodeURIComponent(resetToken)}`;
  return sendEmail({
    to: email,
    subject: `${env.APP_NAME} — Reset your password`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto">
        <h2>Password Reset</h2>
        <p>You requested a password reset for your ${env.APP_NAME} account.</p>
        <p><a href="${resetUrl}" style="display:inline-block;padding:12px 24px;background:#2563eb;color:#fff;text-decoration:none;border-radius:6px">Reset Password</a></p>
        <p>Or copy this link: <br/><a href="${resetUrl}">${resetUrl}</a></p>
        <p>This link expires in 1 hour. If you did not request this, ignore this email.</p>
        <hr/>
        <small>${env.APP_NAME} · Kerakat, Jaunpur</small>
      </div>
    `,
    text: `Reset your password: ${resetUrl}\nExpires in 1 hour.`,
  });
}

export async function sendOtpEmail(email: string, code: string, purpose: string): Promise<boolean> {
  return sendEmail({
    to: email,
    subject: `${env.APP_NAME} — Your verification code`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto">
        <h2>Verification Code</h2>
        <p>Your OTP for <strong>${purpose}</strong> is:</p>
        <p style="font-size:28px;font-weight:bold;letter-spacing:4px">${code}</p>
        <p>Valid for 10 minutes. Do not share this code.</p>
        <hr/>
        <small>${env.APP_NAME} · Kerakat, Jaunpur</small>
      </div>
    `,
    text: `Your OTP is ${code}. Valid for 10 minutes.`,
  });
}

export async function sendPaymentConfirmationEmail(
  email: string,
  amount: number,
  currency: string,
  paymentId: string,
): Promise<boolean> {
  return sendEmail({
    to: email,
    subject: `${env.APP_NAME} — Payment successful`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto">
        <h2>Payment Received</h2>
        <p>We received your payment of <strong>${currency} ${amount}</strong>.</p>
        <p>Reference: ${paymentId}</p>
        <p>Thank you for using ${env.APP_NAME}.</p>
        <hr/>
        <small>${env.APP_NAME} · Kerakat, Jaunpur</small>
      </div>
    `,
    text: `Payment of ${currency} ${amount} received. Ref: ${paymentId}`,
  });
}

export async function sendWelcomeEmail(email: string, firstName: string): Promise<boolean> {
  return sendEmail({
    to: email,
    subject: `Welcome to ${env.APP_NAME}`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto">
        <h2>Welcome, ${firstName}!</h2>
        <p>Your account on ${env.APP_NAME} is ready.</p>
        <p><a href="${env.FRONTEND_URL}/login">Login to your dashboard</a></p>
        <hr/>
        <small>${env.APP_NAME} · Kerakat, Jaunpur</small>
      </div>
    `,
    text: `Welcome to ${env.APP_NAME}. Login at ${env.FRONTEND_URL}/login`,
  });
}
