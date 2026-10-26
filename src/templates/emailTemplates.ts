import { env } from '../config/env.js';

const UI_BASE_URL = env.FRONTEND_URL.replace(/\/$/, '');
/** Hosted TechWagger mark. Do not fall back to the old Super Computer logo. */
const LOGO_URL = 'https://mindsprint.techwagger.com/img/logo/techwagger-logo.png';
const TEAM_NAME = `Team ${env.APP_NAME}`;
const CURRENT_YEAR = new Date().getFullYear();
const FONT = "Arial, Helvetica, sans-serif";
const TEAL = '#0e7490';
const INK = '#1f2937';
const MUTED = '#6b7280';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function wrapEmailBody(innerRowsHtml: string): string {
  const appName = escapeHtml(env.APP_NAME);
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${appName}</title>
</head>
<body style="margin:0;padding:0;background-color:#f3f5f7;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;background-color:#f3f5f7;">
    <tr>
      <td align="center" style="padding:32px 12px;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;width:600px;max-width:600px;background-color:#ffffff;border:1px solid #e5e7eb;">
          <tr>
            <td align="center" style="padding:28px 32px 18px 32px;background-color:#ffffff;">
              <a href="${UI_BASE_URL}" target="_blank" style="text-decoration:none;">
                <img src="${LOGO_URL}" width="200" alt="TechWagger" style="display:block;border:0;outline:none;text-decoration:none;width:200px;max-width:200px;height:auto;">
              </a>
            </td>
          </tr>
          <tr>
            <td style="padding:0 32px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
                <tr>
                  <td style="height:3px;line-height:3px;font-size:0;background-color:${TEAL};">&nbsp;</td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:28px 32px 8px 32px;font-family:${FONT};font-size:15px;line-height:24px;color:${INK};">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
                ${innerRowsHtml}
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:8px 32px 28px 32px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
                <tr>
                  <td style="border-top:1px solid #e5e7eb;padding-top:16px;font-family:${FONT};font-size:12px;line-height:18px;color:${MUTED};" align="center">
                    ${appName}<br>
                    &copy; ${CURRENT_YEAR} TechWagger. All rights reserved.
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function ctaButton(href: string, label: string, bg = TEAL): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;margin:8px 0 16px 0;">
  <tr>
    <td align="center" bgcolor="${bg}" style="background-color:${bg};border-radius:4px;">
      <a href="${href}" target="_blank" style="display:inline-block;padding:12px 22px;font-family:${FONT};font-size:14px;line-height:16px;font-weight:bold;color:#ffffff;text-decoration:none;">
        ${escapeHtml(label)}
      </a>
    </td>
  </tr>
</table>`;
}

function dashboardCta(href: string, label = 'Sign in'): string {
  return ctaButton(href, label, TEAL);
}

function heading(text: string): string {
  return `<tr>
    <td style="padding:0 0 14px 0;font-family:${FONT};font-size:22px;line-height:28px;font-weight:bold;color:#0f172a;">
      ${escapeHtml(text)}
    </td>
  </tr>`;
}

function textRow(html: string, padding = '0 0 14px 0'): string {
  return `<tr>
    <td style="padding:${padding};font-family:${FONT};font-size:15px;line-height:24px;color:${INK};">
      ${html}
    </td>
  </tr>`;
}

function signoff(): string {
  return textRow(`Regards,<br>${escapeHtml(TEAM_NAME)}`, '8px 0 12px 0');
}

function actionRow(buttonHtml: string): string {
  return `<tr><td style="padding:2px 0 16px 0;">${buttonHtml}</td></tr>`;
}

function detailTable(rows: { label: string; value: string }[]): string {
  const body = rows
    .filter((row) => row.value.trim() !== '')
    .map(
      (row) => `<tr>
      <td width="168" valign="top" style="width:168px;padding:12px 14px;border-bottom:1px solid #e5e7eb;background-color:#f8fafc;font-family:${FONT};font-size:13px;line-height:20px;color:${MUTED};">
        ${escapeHtml(row.label)}
      </td>
      <td valign="top" style="padding:12px 14px;border-bottom:1px solid #e5e7eb;font-family:${FONT};font-size:14px;line-height:20px;color:${INK};">
        ${escapeHtml(row.value)}
      </td>
    </tr>`,
    )
    .join('');
  return `<tr>
    <td style="padding:0 0 16px 0;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;border:1px solid #e5e7eb;">
        ${body}
      </table>
    </td>
  </tr>`;
}

function codeBlock(code: string): string {
  return `<tr>
    <td align="center" style="padding:4px 0 18px 0;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
        <tr>
          <td align="center" style="padding:14px 28px;background-color:#f0fdfa;border:1px solid #99f6e4;font-family:${FONT};font-size:28px;line-height:32px;font-weight:bold;letter-spacing:6px;color:#0f172a;">
            ${escapeHtml(code)}
          </td>
        </tr>
      </table>
    </td>
  </tr>`;
}

/** Forgot / reset password email */
export function forgetPasswordMailTemplate({
  hyperText,
}: {
  subject?: string;
  text?: string;
  hyperText: string;
}): string {
  return wrapEmailBody(`
    ${heading('Reset your password')}
    ${textRow(`Dear User,`)}
    ${textRow(`We received a request to reset the password for your <strong>${escapeHtml(env.APP_NAME)}</strong> account. Choose a new password with the button below. This link expires in 1 hour.`)}
    ${actionRow(ctaButton(hyperText, 'Reset password', TEAL))}
    ${textRow(`If you did not ask for a reset, ignore this email. Your current password will not change.`)}
    ${signoff()}
  `);
}

/** Email / OTP verification */
export function emailVerificationOtpMailTemplate({
  hyperText,
  purpose = 'verification',
}: {
  subject?: string;
  text?: string;
  hyperText: string;
  purpose?: string;
}): string {
  const purposeLabel = purpose.replace(/[_-]+/g, ' ').trim() || 'verification';
  return wrapEmailBody(`
    ${heading('Your verification code')}
    ${textRow(`Dear User,`)}
    ${textRow(`Use this code to complete <strong>${escapeHtml(purposeLabel)}</strong> on <strong>${escapeHtml(env.APP_NAME)}</strong>. It expires in 10 minutes.`)}
    ${codeBlock(hyperText)}
    ${textRow(`Do not share this code. ${escapeHtml(env.APP_NAME)} will never ask for it by phone or message. If you did not request it, ignore this email.`)}
    ${signoff()}
  `);
}

/** Contact form notification (admin) */
export function contactFormMailTemplate({
  name,
  email,
  phone,
  message,
  subject,
}: {
  name: string;
  email: string;
  phone: string;
  message: string;
  subject: string;
}): string {
  return wrapEmailBody(`
    ${heading('New contact enquiry')}
    ${textRow(`A visitor sent a message from the ${escapeHtml(env.APP_NAME)} contact form. Reply to the email address below.`)}
    ${detailTable([
      { label: 'Name', value: name },
      { label: 'Email', value: email },
      { label: 'Phone', value: phone || 'Not provided' },
      { label: 'Subject', value: subject },
      { label: 'Message', value: message },
    ])}
  `);
}

/** Admin-forced password reset */
export function adminPasswordResetMailTemplate({
  userName,
  resetLink,
}: {
  userName?: string;
  resetLink: string;
}): string {
  return wrapEmailBody(`
    ${heading('Set a new password')}
    ${textRow(`Dear ${escapeHtml(userName || 'User')},`)}
    ${textRow(`An administrator reset the password on your <strong>${escapeHtml(env.APP_NAME)}</strong> account. Set a new password before you sign in again. This link expires in 1 hour.`)}
    ${actionRow(ctaButton(resetLink, 'Set a new password', TEAL))}
    ${textRow(`If you did not expect this, contact your organization administrator before using the link.`)}
    ${signoff()}
  `);
}

/** Welcome email after register / user create */
export function welcomeMailTemplate({
  firstName,
  loginUrl = `${UI_BASE_URL}/login`,
}: {
  firstName: string;
  loginUrl?: string;
}): string {
  return wrapEmailBody(`
    ${heading(`Welcome to ${env.APP_NAME}`)}
    ${textRow(`Dear ${escapeHtml(firstName)},`)}
    ${textRow(`Your account is ready. Sign in to view assigned exams, check results, and update your profile.`)}
    ${actionRow(dashboardCta(loginUrl, 'Sign in'))}
    ${textRow(`Keep your login details private. If you need a new password later, use Forgot password on the sign-in page.`)}
    ${signoff()}
  `);
}

/** Exam assignment notification for students */
export function examAssignmentMailTemplate({
  studentName,
  examName,
  scheduledDate,
  scheduledTime,
  durationMinutes,
  status,
  dashboardUrl = `${UI_BASE_URL}/dashboard`,
}: {
  studentName: string;
  examName: string;
  scheduledDate?: string | null;
  scheduledTime?: string | null;
  durationMinutes?: number | null;
  status?: string | null;
  dashboardUrl?: string;
}): string {
  return wrapEmailBody(`
    ${heading('An exam has been assigned to you')}
    ${textRow(`Dear ${escapeHtml(studentName)},`)}
    ${textRow(`Your institute assigned an exam on <strong>${escapeHtml(env.APP_NAME)}</strong>. Sign in before the scheduled time and read the instructions on the exam page.`)}
    ${detailTable([
      { label: 'Exam', value: examName },
      { label: 'Date', value: scheduledDate ?? '' },
      { label: 'Time', value: scheduledTime ?? '' },
      { label: 'Duration', value: durationMinutes != null ? `${durationMinutes} minutes` : '' },
      { label: 'Status', value: status ?? '' },
    ])}
    ${actionRow(dashboardCta(dashboardUrl, 'Open my exams'))}
    ${textRow(`Start only when you are ready. If the exam uses fullscreen, stay in that mode until you submit. The timer cannot be paused.`)}
    ${signoff()}
  `);
}

/** Payment confirmation */
export function paymentConfirmationMailTemplate({
  amount,
  currency,
  paymentId,
}: {
  amount: number;
  currency: string;
  paymentId: string;
}): string {
  return wrapEmailBody(`
    ${heading('Payment received')}
    ${textRow(`Dear User,`)}
    ${textRow(`Your payment was successful. Keep this email as your receipt.`)}
    ${detailTable([
      { label: 'Amount', value: `${currency} ${amount}` },
      { label: 'Reference', value: paymentId },
      { label: 'Status', value: 'Paid' },
    ])}
    ${textRow(`If this amount does not match what you expected, contact your organization administrator and share the reference above.`)}
    ${signoff()}
  `);
}

/** Org / document style rejection notice (reusable) */
export function documentRejectedMailTemplate({
  userName,
  documentName,
  supportEmail = 'support@edutech.com',
  actionUrl = `${UI_BASE_URL}/dashboard`,
}: {
  userName?: string;
  documentName: string;
  supportEmail?: string;
  actionUrl?: string;
}): string {
  return wrapEmailBody(`
    ${heading('Document not accepted')}
    ${textRow(`Dear ${escapeHtml(userName || 'User')},`)}
    ${textRow(`We reviewed <strong>${escapeHtml(documentName)}</strong> and could not accept it. Upload a new copy that meets the checks below.`)}
    ${detailTable([
      { label: 'Document', value: documentName },
      { label: 'Status', value: 'Not accepted' },
      { label: 'What to check', value: 'It must be valid, not expired, clear enough to read, and show every required field.' },
    ])}
    ${actionRow(ctaButton(actionUrl, 'Upload again', '#b91c1c'))}
    ${textRow(`If this looks like a mistake, write to ${escapeHtml(supportEmail)} and include the document name.`)}
    ${signoff()}
  `);
}

/** Login credentials for newly created organization admin */
export function organizationCredentialsMailTemplate({
  orgName,
  adminName,
  loginEmail,
  temporaryPassword,
  isApproved,
  loginUrl = `${UI_BASE_URL}/login`,
}: {
  orgName: string;
  adminName?: string;
  loginEmail: string;
  temporaryPassword: string;
  isApproved: boolean;
  loginUrl?: string;
}): string {
  return wrapEmailBody(`
    ${heading(isApproved ? 'Your organization can sign in' : 'Your organization is awaiting approval')}
    ${textRow(`Dear ${escapeHtml(adminName || 'Organization Admin')},`)}
    ${textRow(
      isApproved
        ? `<strong>${escapeHtml(orgName)}</strong> is active on <strong>${escapeHtml(env.APP_NAME)}</strong>. Use the details below to sign in and set up exams, faculty, and students.`
        : `<strong>${escapeHtml(orgName)}</strong> has been registered on <strong>${escapeHtml(env.APP_NAME)}</strong>. A platform administrator still needs to approve it. You can sign in with these details after approval.`,
    )}
    ${detailTable([
      { label: 'Organization', value: orgName },
      { label: 'Login email', value: loginEmail },
      { label: 'Temporary password', value: temporaryPassword },
      { label: 'Account status', value: isApproved ? 'Active' : 'Pending approval' },
    ])}
    ${actionRow(dashboardCta(loginUrl, 'Sign in'))}
    ${textRow(`Change this password after your first sign-in. Do not forward this email.`)}
    ${signoff()}
  `);
}

export type OrganizationActionType =
  | 'created'
  | 'approved'
  | 'updated'
  | 'deleted'
  | 'deactivated';

/** Notify organization when Super Admin performs an action */
export function organizationActionMailTemplate({
  orgName,
  action,
  message,
  actorName,
  actionUrl = `${UI_BASE_URL}/login`,
}: {
  orgName: string;
  action: OrganizationActionType;
  message: string;
  actorName?: string;
  actionUrl?: string;
}): string {
  const titles: Record<OrganizationActionType, string> = {
    created: 'Organization registered',
    approved: 'Organization approved',
    updated: 'Organization details updated',
    deleted: 'Organization removed',
    deactivated: 'Organization access paused',
  };
  const leads: Record<OrganizationActionType, string> = {
    created: `${orgName} has been registered on ${env.APP_NAME}. A platform administrator will review it before the account can be used.`,
    approved: `${orgName} is approved. You can sign in and manage exams, faculty, and students.`,
    updated: `The record for ${orgName} was updated. Sign in if you need to confirm the new details.`,
    deleted: `${orgName} has been removed from ${env.APP_NAME}. Sign-in for this organization is no longer available.`,
    deactivated: `${orgName} has been deactivated. Sign-in is paused until a platform administrator restores access.`,
  };
  const showSignIn = action === 'approved' || action === 'created' || action === 'updated';
  const showSupport = action === 'deactivated';

  return wrapEmailBody(`
    ${heading(titles[action])}
    ${textRow(`Dear Organization Admin,`)}
    ${textRow(escapeHtml(leads[action]))}
    ${textRow(escapeHtml(message))}
    ${detailTable([
      { label: 'Organization', value: orgName },
      { label: 'Update', value: titles[action] },
      { label: 'Updated by', value: actorName ? `${actorName}, platform administrator` : '' },
    ])}
    ${showSignIn ? actionRow(dashboardCta(actionUrl, 'Sign in')) : ''}
    ${showSupport ? actionRow(ctaButton(actionUrl, 'Contact support', '#b45309')) : ''}
    ${signoff()}
  `);
}

/** Credentials email when faculty / student / org user is created by admin */
export function userCredentialsMailTemplate({
  firstName,
  roleLabel,
  loginEmail,
  enrollmentNo,
  temporaryPassword,
  loginUrl = `${UI_BASE_URL}/login`,
  orgName,
}: {
  firstName: string;
  roleLabel: string;
  loginEmail: string;
  enrollmentNo?: string | null;
  temporaryPassword: string;
  loginUrl?: string;
  orgName?: string;
}): string {
  const roleIntro =
    roleLabel === 'Student'
      ? 'You can view assigned exams, attempt them, and check your results after you sign in.'
      : roleLabel === 'Faculty'
        ? 'You can create tests, review attempts, and manage your classes after you sign in.'
        : 'You can manage your organization from the dashboard after you sign in.';
  return wrapEmailBody(`
    ${heading(`Your ${roleLabel.toLowerCase()} account is ready`)}
    ${textRow(`Dear ${escapeHtml(firstName)},`)}
    ${textRow(
      `An administrator created your <strong>${escapeHtml(roleLabel)}</strong> account on <strong>${escapeHtml(env.APP_NAME)}</strong>${
        orgName ? ` for <strong>${escapeHtml(orgName)}</strong>` : ''
      }. ${roleIntro}`,
    )}
    ${detailTable([
      { label: 'Role', value: roleLabel },
      { label: 'Organization', value: orgName ?? '' },
      { label: 'Login email', value: loginEmail },
      { label: 'Enrollment number', value: enrollmentNo ?? '' },
      { label: 'Password', value: temporaryPassword },
    ])}
    ${actionRow(dashboardCta(loginUrl, 'Sign in'))}
    ${textRow(
      enrollmentNo
        ? `Sign in with your email or enrollment number and the password above. Change the password after your first sign-in. If you forget it later, use Forgot password on the sign-in page.`
        : `Sign in with your email and the password above. Change the password after your first sign-in. If you forget it later, use Forgot password on the sign-in page.`,
    )}
    ${signoff()}
  `);
}

/** Plain notification that still uses the same branded layout. */
export function notificationMailTemplate({
  title,
  body,
}: {
  title: string;
  body: string;
}): string {
  return wrapEmailBody(`
    ${heading(title)}
    ${textRow(escapeHtml(body).replace(/\n/g, '<br>'))}
    ${signoff()}
  `);
}
