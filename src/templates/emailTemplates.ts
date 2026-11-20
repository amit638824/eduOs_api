import { env } from '../config/env.js';

const UI_BASE_URL = env.FRONTEND_URL.replace(/\/$/, '');
/** Hosted MindSprint mark. */
export const LOGO_URL = 'https://mindsprint.techwagger.com/img/logo/mindsprint-logo.png';
const TEAM_NAME = `Team ${env.APP_NAME}`;
const CURRENT_YEAR = new Date().getFullYear();
const FONT = "Arial, Helvetica, sans-serif";
const BRAND_PRIMARY = '#5f2ded';
const TEAL = BRAND_PRIMARY;
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

/**
 * Extracts only the first name from a full name string, falling back to a default label.
 * Guarantees that only the first name is used (e.g. "Rahul Sharma" -> "Rahul").
 */
export function extractFirstName(name?: string | null, fallback = 'User'): string {
  if (!name) return fallback;
  const trimmed = name.trim();
  if (!trimmed) return fallback;
  return trimmed.split(/\s+/)[0] || fallback;
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
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;width:600px;max-width:600px;background-color:#ffffff;border:1px solid #e5e7eb;table-layout:fixed;">
          <tr>
            <td align="left" style="padding:32px 32px 20px 32px;background-color:#ffffff;">
              <a href="${UI_BASE_URL}" target="_blank" style="text-decoration:none;display:inline-block;">
                <img src="cid:mindsprint-logo" width="180" alt="${appName}" style="display:block;border:0;outline:none;text-decoration:none;width:180px;max-width:180px;height:auto;">
              </a>
            </td>
          </tr>
          <tr>
            <td style="padding:10px 32px 12px 32px;font-family:${FONT};font-size:15px;line-height:24px;color:${INK};">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;table-layout:fixed;width:100%;">
                ${innerRowsHtml}
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:8px 32px 28px 32px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
                <tr>
                  <td style="border-top:1px solid #e5e7eb;padding-top:16px;font-family:${FONT};font-size:12px;line-height:18px;color:${MUTED};" align="center">
                    &copy; ${CURRENT_YEAR} MindSprint. Techwagger Solutions Pvt. Ltd. All rights reserved.
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

function ctaButton(href: string, label: string, bg = BRAND_PRIMARY): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;margin:8px 0 16px 0;">
  <tr>
    <td align="center" bgcolor="${bg}" style="background-color:${bg};border-radius:6px;">
      <a href="${href}" target="_blank" style="display:inline-block;padding:12px 24px;font-family:${FONT};font-size:14px;line-height:16px;font-weight:bold;color:#ffffff;text-decoration:none;border-radius:6px;">
        ${escapeHtml(label)}
      </a>
    </td>
  </tr>
</table>`;
}

function dashboardCta(href: string, label = 'Sign in'): string {
  return ctaButton(href, label, BRAND_PRIMARY);
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
      <td width="140" valign="top" style="width:140px;max-width:140px;padding:12px 14px;border-bottom:1px solid #e5e7eb;background-color:#f8fafc;font-family:${FONT};font-size:13px;line-height:20px;font-weight:600;color:${MUTED};word-break:keep-all;white-space:nowrap;">
        ${escapeHtml(row.label)}
      </td>
      <td valign="top" style="padding:12px 14px;border-bottom:1px solid #e5e7eb;font-family:${FONT};font-size:14px;line-height:22px;color:${INK};word-break:break-word;overflow-wrap:anywhere;word-wrap:break-word;white-space:pre-wrap;max-width:396px;">
        ${escapeHtml(row.value)}
      </td>
    </tr>`,
    )
    .join('');
  return `<tr>
    <td style="padding:0 0 16px 0;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;table-layout:fixed;width:100%;max-width:100%;border-radius:8px;overflow:hidden;border:1px solid #e5e7eb;">
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
  firstName,
}: {
  subject?: string;
  text?: string;
  hyperText: string;
  firstName?: string;
}): string {
  const first = extractFirstName(firstName, 'User');
  return wrapEmailBody(`
    ${heading('Reset Your Password')}
    ${textRow(`Dear ${escapeHtml(first)},`)}
    ${textRow(`We received a request to reset the password for your <strong>${escapeHtml(env.APP_NAME)}</strong> account. Please click the button below to set a new password for your MindSprint account. This password reset link will expire in 1 hour.`)}
    ${actionRow(ctaButton(hyperText, 'Reset Password', BRAND_PRIMARY))}
    ${textRow(`If you did not request a password reset, ignore this email. Your current password will not change.`)}
    ${signoff()}
  `);
}

/** Email / OTP verification */
export function emailVerificationOtpMailTemplate({
  hyperText,
  purpose = 'verification',
  firstName,
}: {
  subject?: string;
  text?: string;
  hyperText: string;
  purpose?: string;
  firstName?: string;
}): string {
  const first = extractFirstName(firstName, 'User');
  const purposeLabel = purpose.replace(/[_-]+/g, ' ').trim() || 'verification';
  return wrapEmailBody(`
    ${heading('Your verification code')}
    ${textRow(`Dear ${escapeHtml(first)},`)}
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
    ${heading('New Contact Enquiry')}
    ${textRow(`A visitor submitted a new enquiry from the <strong>${escapeHtml(env.APP_NAME)}</strong> contact &amp; demo form. Reply directly to this email or reach out using the details below.`)}
    ${detailTable([
      { label: 'Name', value: name },
      { label: 'Email', value: email },
      { label: 'Phone', value: phone || 'Not provided' },
      { label: 'Subject', value: subject },
    ])}
    <tr>
      <td style="padding:6px 0 6px 0;font-family:${FONT};font-size:12px;font-weight:bold;color:${MUTED};text-transform:uppercase;letter-spacing:0.5px;">
        Message / Requirement
      </td>
    </tr>
    <tr>
      <td style="padding:0 0 16px 0;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;table-layout:fixed;width:100%;max-width:100%;background-color:#f8fafc;border:1px solid #e2e8f0;border-left:4px solid #2563eb;border-radius:6px;">
          <tr>
            <td style="padding:14px 16px;font-family:${FONT};font-size:14px;line-height:22px;color:${INK};word-break:break-all;word-break:break-word;overflow-wrap:anywhere;word-wrap:break-word;white-space:pre-wrap;">
              ${escapeHtml(message)}
            </td>
          </tr>
        </table>
      </td>
    </tr>
    ${actionRow(ctaButton(`mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent('Re: ' + subject)}`, 'Reply to Visitor', BRAND_PRIMARY))}
    ${signoff()}
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
  const first = extractFirstName(userName, 'User');
  return wrapEmailBody(`
    ${heading('Set a new password')}
    ${textRow(`Dear ${escapeHtml(first)},`)}
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
  const first = extractFirstName(firstName, 'User');
  return wrapEmailBody(`
    ${heading(`Welcome to ${env.APP_NAME}`)}
    ${textRow(`Dear ${escapeHtml(first)},`)}
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
  const first = extractFirstName(studentName, 'Student');
  return wrapEmailBody(`
    ${heading('An exam has been assigned to you')}
    ${textRow(`Dear ${escapeHtml(first)},`)}
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
  const first = extractFirstName(userName, 'User');
  return wrapEmailBody(`
    ${heading('Document not accepted')}
    ${textRow(`Dear ${escapeHtml(first)},`)}
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
  resetToken,
  setPasswordUrl,
  isApproved,
  loginUrl = `${UI_BASE_URL}/login`,
}: {
  orgName: string;
  adminName?: string;
  loginEmail: string;
  temporaryPassword?: string;
  resetToken?: string;
  setPasswordUrl?: string;
  isApproved: boolean;
  loginUrl?: string;
}): string {
  const actionUrl = setPasswordUrl || loginUrl;
  const hasResetLink = Boolean(setPasswordUrl || resetToken);
  const first = extractFirstName(adminName, 'Organization Admin');

  const details = [
    { label: 'Organization', value: orgName },
    { label: 'Login email', value: loginEmail },
    ...(temporaryPassword && !hasResetLink
      ? [{ label: 'Temporary password', value: temporaryPassword }]
      : []),
    { label: 'Account status', value: isApproved ? 'Active' : 'Pending approval' },
  ];

  return wrapEmailBody(`
    ${heading(isApproved ? 'Welcome to ' + env.APP_NAME : 'Your organization is awaiting approval')}
    ${textRow(`Dear ${escapeHtml(first)},`)}
    ${textRow(
      isApproved
        ? `Your organization account for <strong>${escapeHtml(orgName)}</strong> is active on <strong>${escapeHtml(env.APP_NAME)}</strong>. Click the button below to set your password and access your administrator portal.`
        : `<strong>${escapeHtml(orgName)}</strong> has been registered on <strong>${escapeHtml(env.APP_NAME)}</strong>. A platform administrator still needs to approve it.`,
    )}
    ${detailTable(details)}
    ${actionRow(dashboardCta(actionUrl, hasResetLink ? 'Click Here to Set Password' : 'Sign in'))}
    ${textRow(hasResetLink ? 'Once your password is set, you will be taken directly to your profile setup. This link is valid for 48 hours.' : 'Change this password after your first sign-in. Do not forward this email.')}
    ${signoff()}
  `);
}

export type OrganizationActionType =
  | 'created'
  | 'approved'
  | 'updated'
  | 'deleted'
  | 'deactivated'
  | 'suspended'
  | 'reactivated';

function orgDetailsTable(rows: { label: string; value: string }[]): string {
  const body = rows
    .filter((row) => row.value.trim() !== '')
    .map(
      (row) => `<tr>
      <td width="180" valign="top" style="width:180px;padding:10px 14px;border-bottom:1px solid #e5e7eb;background-color:#f8fafc;font-family:${FONT};font-size:13px;line-height:20px;color:#475569;font-weight:600;">
        ${escapeHtml(row.label)}
      </td>
      <td valign="top" style="padding:10px 14px;border-bottom:1px solid #e5e7eb;font-family:${FONT};font-size:14px;line-height:20px;color:${INK};">
        ${escapeHtml(row.value)}
      </td>
    </tr>`,
    )
    .join('');
  return `<tr>
    <td style="padding:4px 0 16px 0;">
      <div style="font-family:${FONT};font-size:15px;font-weight:bold;color:#0f172a;margin-bottom:8px;">Organization Details</div>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;border:1px solid #e5e7eb;">
        <thead>
          <tr>
            <th width="180" align="left" style="width:180px;padding:10px 14px;border-bottom:2px solid #e2e8f0;background-color:#f1f5f9;font-family:${FONT};font-size:12px;font-weight:700;color:#334155;text-transform:uppercase;letter-spacing:0.5px;">Field</th>
            <th align="left" style="padding:10px 14px;border-bottom:2px solid #e2e8f0;background-color:#f1f5f9;font-family:${FONT};font-size:12px;font-weight:700;color:#334155;text-transform:uppercase;letter-spacing:0.5px;">Details</th>
          </tr>
        </thead>
        <tbody>
          ${body}
        </tbody>
      </table>
    </td>
  </tr>`;
}

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
  message?: string;
  actorName?: string;
  actionUrl?: string;
}): string {
  const adminEmail = actorName && actorName.includes('@') ? actorName : 'superadmin@edutech.com';

  if (action === 'deactivated' || action === 'suspended') {
    return wrapEmailBody(`
      ${heading('Organization Account Suspended')}
      ${textRow(`Dear Organization Administrator,`)}
      ${textRow(`This is to inform you that <strong>${escapeHtml(orgName)}</strong> has been suspended by the Super Administrator.`)}
      ${textRow(`As a result, access to your organization account and all associated user accounts has been temporarily restricted. Users will be unable to sign in until access is restored by the platform administrator.`)}
      ${textRow(`If you believe this action was taken in error or require further clarification, please contact our support team.`)}
      ${orgDetailsTable([
        { label: 'Organization', value: orgName },
        { label: 'Status', value: 'Suspended' },
        { label: 'Action performed by', value: 'Platform Administrator' },
        { label: 'Administrator email', value: adminEmail },
      ])}
      ${actionRow(ctaButton(`mailto:${adminEmail}`, 'Contact Support', BRAND_PRIMARY))}
      ${signoff()}
    `);
  }

  if (action === 'reactivated' || action === 'approved') {
    return wrapEmailBody(`
      ${heading('Organization Account Activated')}
      ${textRow(`Dear Organization Administrator,`)}
      ${textRow(`This is to inform you that <strong>${escapeHtml(orgName)}</strong> has been activated by the Super Administrator.`)}
      ${textRow(`Access to your organization account and all associated user accounts has been restored. Users can now sign in to the platform.`)}
      ${orgDetailsTable([
        { label: 'Organization', value: orgName },
        { label: 'Status', value: 'Active' },
        { label: 'Action performed by', value: 'Platform Administrator' },
        { label: 'Administrator email', value: adminEmail },
      ])}
      ${actionRow(dashboardCta(actionUrl, 'Sign In'))}
      ${signoff()}
    `);
  }

  if (action === 'updated') {
    return wrapEmailBody(`
      ${heading('Organization Details Updated')}
      ${textRow(`Dear Organization Administrator,`)}
      ${textRow(`This is to inform you that details for <strong>${escapeHtml(orgName)}</strong> have been updated by the Super Administrator.`)}
      ${orgDetailsTable([
        { label: 'Organization', value: orgName },
        { label: 'Status', value: 'Updated' },
        { label: 'Action performed by', value: 'Platform Administrator' },
        { label: 'Administrator email', value: adminEmail },
      ])}
      ${actionRow(dashboardCta(actionUrl, 'Sign In'))}
      ${signoff()}
    `);
  }

  const titles: Record<OrganizationActionType, string> = {
    created: 'Organization registered',
    approved: 'Organization approved',
    updated: 'Organization details updated',
    deleted: 'Organization removed',
    deactivated: 'Organization access paused',
    suspended: 'Organization access suspended',
    reactivated: 'Organization access reactivated',
  };
  const leads: Record<OrganizationActionType, string> = {
    created: `${orgName} has been registered on ${env.APP_NAME}. A platform administrator will review it before the account can be used.`,
    approved: `${orgName} is approved. You can sign in and manage exams, faculty, and students.`,
    updated: `The record for ${orgName} was updated. Sign in if you need to confirm the new details.`,
    deleted: `${orgName} has been removed from ${env.APP_NAME}. Sign-in for this organization is no longer available.`,
    deactivated: `${orgName} has been suspended. Sign-in is paused until a platform administrator restores access.`,
    suspended: `${orgName} has been suspended. Sign-in is paused until a platform administrator restores access.`,
    reactivated: `${orgName} has been reactivated. Users can sign in again.`,
  };

  return wrapEmailBody(`
    ${heading(titles[action] || 'Organization Notification')}
    ${textRow(`Dear Organization Administrator,`)}
    ${textRow(escapeHtml(leads[action] || 'An update occurred on your organization.'))}
    ${message ? textRow(escapeHtml(message)) : ''}
    ${orgDetailsTable([
      { label: 'Organization', value: orgName },
      { label: 'Status', value: titles[action] || 'Updated' },
      { label: 'Action performed by', value: 'Platform Administrator' },
      { label: 'Administrator email', value: adminEmail },
    ])}
    ${signoff()}
  `);
}

/** Credentials email when faculty / student / org user is created by admin.. */
export function userCredentialsMailTemplate({
  firstName,
  roleLabel,
  loginEmail,
  enrollmentNo,
  temporaryPassword,
  resetToken,
  setPasswordUrl,
  loginUrl = `${UI_BASE_URL}/login`,
  orgName,
}: {
  firstName: string;
  roleLabel: string;
  loginEmail: string;
  enrollmentNo?: string | null;
  temporaryPassword?: string;
  resetToken?: string;
  setPasswordUrl?: string;
  loginUrl?: string;
  orgName?: string;
}): string {
  const actionUrl = setPasswordUrl || loginUrl;
  const hasResetLink = Boolean(setPasswordUrl || resetToken);
  const first = extractFirstName(firstName, 'User');

  const roleIntro =
    roleLabel === 'Student'
      ? 'Click the button below to set your password and access your exams and courses.'
      : roleLabel === 'Faculty'
        ? 'Click the button below to set your password and access your faculty portal.'
        : 'Click the button below to set your password and access your dashboard.';

  const details = [
    { label: 'Role', value: roleLabel },
    ...(orgName ? [{ label: 'Organization', value: orgName }] : []),
    { label: 'Login email', value: loginEmail },
    ...(enrollmentNo ? [{ label: 'Enrollment number', value: enrollmentNo }] : []),
    ...(temporaryPassword && !hasResetLink
      ? [{ label: 'Password', value: temporaryPassword }]
      : []),
  ];

  return wrapEmailBody(`
    ${heading(hasResetLink ? `Welcome to ${env.APP_NAME}` : `Your ${roleLabel.toLowerCase()} account is ready`)}
    ${textRow(`Dear ${escapeHtml(first)},`)}
    ${textRow(
      `Your <strong>${escapeHtml(roleLabel)}</strong> account has been created on <strong>${escapeHtml(env.APP_NAME)}</strong>${
        orgName ? ` for <strong>${escapeHtml(orgName)}</strong>` : ''
      }. ${roleIntro}`,
    )}
    ${detailTable(details)}
    ${actionRow(dashboardCta(actionUrl, hasResetLink ? 'Click Here to Set Password' : 'Sign in'))}
    ${textRow(
      hasResetLink
        ? `Once your password is set, you will be taken directly to your profile setup. This link is valid for 48 hours.`
        : `Sign in with your email and the password above. Change the password after your first sign-in.`
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
