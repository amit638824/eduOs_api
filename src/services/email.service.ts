import nodemailer from 'nodemailer';
import { env, bccEmails, isSmtpConfigured } from '../config/env.js';
import {
  adminPasswordResetMailTemplate,
  contactFormMailTemplate,
  emailVerificationOtpMailTemplate,
  forgetPasswordMailTemplate,
  organizationActionMailTemplate,
  paymentConfirmationMailTemplate,
  welcomeMailTemplate,
  type OrganizationActionType,
} from '../templates/emailTemplates.js';
import * as orgService from './organization.service.js';

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
    html: forgetPasswordMailTemplate({ hyperText: resetUrl }),
    text: `Reset your password: ${resetUrl}\nExpires in 1 hour.`,
  });
}

export async function sendAdminPasswordResetEmail(
  email: string,
  userName: string,
  resetToken: string,
): Promise<boolean> {
  const resetLink = `${env.FRONTEND_URL}/reset-password?token=${encodeURIComponent(resetToken)}`;
  return sendEmail({
    to: email,
    subject: `${env.APP_NAME} — Set a new password`,
    html: adminPasswordResetMailTemplate({ userName, resetLink }),
    text: `Your password was reset by an administrator. Set a new password: ${resetLink}`,
  });
}

export async function sendOtpEmail(email: string, code: string, purpose: string): Promise<boolean> {
  return sendEmail({
    to: email,
    subject: `${env.APP_NAME} — Your verification code`,
    html: emailVerificationOtpMailTemplate({ hyperText: code, purpose }),
    text: `Your OTP for ${purpose} is ${code}. Valid for 10 minutes.`,
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
    html: paymentConfirmationMailTemplate({ amount, currency, paymentId }),
    text: `Payment of ${currency} ${amount} received. Ref: ${paymentId}`,
  });
}

export async function sendWelcomeEmail(email: string, firstName: string): Promise<boolean> {
  return sendEmail({
    to: email,
    subject: `Welcome to ${env.APP_NAME}`,
    html: welcomeMailTemplate({ firstName }),
    text: `Welcome to ${env.APP_NAME}. Login at ${env.FRONTEND_URL}/login`,
  });
}

export async function sendContactFormEmail(input: {
  name: string;
  email: string;
  phone: string;
  message: string;
  subject: string;
  to?: string;
}): Promise<boolean> {
  const to = input.to || env.SMTP_FROM || env.SMTP_USER;
  if (!to) return false;
  return sendEmail({
    to,
    subject: `${env.APP_NAME} — Contact: ${input.subject}`,
    html: contactFormMailTemplate(input),
    text: `Name: ${input.name}\nEmail: ${input.email}\nPhone: ${input.phone}\nSubject: ${input.subject}\n\n${input.message}`,
  });
}

const ORG_ACTION_SUBJECT: Record<OrganizationActionType, string> = {
  created: 'Organization registered on platform',
  approved: 'Organization access approved',
  updated: 'Organization details updated',
  deleted: 'Organization removed from platform',
  deactivated: 'Organization deactivated',
};

/**
 * Email all org admins (+ contactEmail) when Super Admin acts on the organization.
 */
export async function notifyOrganizationOfSuperAdminAction(input: {
  organizationId: string;
  orgName: string;
  action: OrganizationActionType;
  message: string;
  actorName?: string;
  extraEmails?: string[];
}): Promise<boolean> {
  const emails = new Set(await orgService.getOrganizationNotifyEmails(input.organizationId));
  for (const e of input.extraEmails ?? []) {
    if (e.includes('@')) emails.add(e.toLowerCase().trim());
  }
  if (emails.size === 0) {
    console.warn(
      `[email] No org contacts for ${input.orgName} (${input.organizationId}) — skip ${input.action} mail`,
    );
    return false;
  }

  const to = Array.from(emails);
  return sendEmail({
    to,
    subject: `${env.APP_NAME} — ${ORG_ACTION_SUBJECT[input.action]}`,
    html: organizationActionMailTemplate({
      orgName: input.orgName,
      action: input.action,
      message: input.message,
      actorName: input.actorName,
    }),
    text: `${ORG_ACTION_SUBJECT[input.action]}: ${input.orgName}\n\n${input.message}`,
  });
}
