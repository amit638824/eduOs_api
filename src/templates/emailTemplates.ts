import { env } from '../config/env.js';

const LOGO_URL = env.LOGO_URL;
const UI_BASE_URL = env.FRONTEND_URL.replace(/\/$/, '');
const CTA_DASHBOARD_PNG = env.EMAIL_CTA_DASHBOARD_PNG || '';
const CTA_RESET_PNG = env.EMAIL_CTA_RESET_PNG || env.RESET_PASSWORD_PNG || '';
const TEAM_NAME = `Team ${env.APP_NAME}`;
const CURRENT_YEAR = new Date().getFullYear();

const EMAIL_STYLES = `
@media only screen and (max-width: 620px) {
  table.body h1 { font-size: 28px !important; margin-bottom: 10px !important; }
  table.body p, table.body ul, table.body ol, table.body td, table.body span, table.body a { font-size: 16px !important; }
  table.body .wrapper, table.body .article { padding: 10px !important; }
  table.body .content { padding: 0 !important; }
  table.body .container { padding: 0 !important; width: 100% !important; }
  table.body .main { border-left-width: 0 !important; border-radius: 0 !important; border-right-width: 0 !important; }
  table.body .btn table { width: 100% !important; }
  table.body .btn a { width: 100% !important; }
  table.body .img-responsive { height: auto !important; max-width: 100% !important; width: auto !important; }
}
@media all {
  .ExternalClass { width: 100%; }
  .ExternalClass, .ExternalClass p, .ExternalClass span, .ExternalClass font, .ExternalClass td, .ExternalClass div { line-height: 100%; }
  .apple-link a { color: inherit !important; font-family: inherit !important; font-size: inherit !important; font-weight: inherit !important; line-height: inherit !important; text-decoration: none !important; }
  #MessageViewBody a { color: inherit; text-decoration: none; font-size: inherit; font-family: inherit; font-weight: inherit; line-height: inherit; }
  .btn-primary table td:hover { background-color: #1d4ed8 !important; }
  .btn-primary a:hover { background-color: #1d4ed8 !important; border-color: #1d4ed8 !important; }
}
`;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function wrapEmailBody(innerRowsHtml: string): string {
  return `<!doctype html>
<html style="height:100%">
<head>
  <meta http-equiv="X-UA-Compatible" content="ie=edge">
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Open+Sans:wght@300;400;500;600&display=swap" rel="stylesheet">
  <title>${escapeHtml(env.APP_NAME)}</title>
  <style>${EMAIL_STYLES}</style>
</head>
<body style="background-color:#fff;font-family:'Open Sans',sans-serif;-webkit-font-smoothing:antialiased;font-size:13px;line-height:1.4;margin:0;padding:0;-ms-text-size-adjust:100%;-webkit-text-size-adjust:100%;height:100%;">
  <table class="es-wrapper" style="mso-table-lspace:0pt;mso-table-rspace:0pt;border-collapse:collapse;border-spacing:0px;padding:0;Margin:0;width:100%;height:100%;background-repeat:repeat;background-position:center top;background-color:#EDEDED;" width="100%" cellspacing="0" cellpadding="0">
    <tbody>
      <tr><td style="height:15px;"></td></tr>
      <tr>
        <td style="padding:0;Margin:0" valign="top">
          <table class="es-content" style="mso-table-lspace:0pt;mso-table-rspace:0pt;border-collapse:collapse;border-spacing:0px;table-layout:fixed !important;width:100%" cellspacing="0" cellpadding="0" align="center">
            <tbody>
              <tr>
                <td style="padding:0;Margin:0" align="center">
                  <table class="es-content-body" style="mso-table-lspace:0pt;mso-table-rspace:0pt;border-collapse:collapse;border-spacing:0px;background-color:#ffffff;width:100%;max-width:600px" cellspacing="0" cellpadding="0" bgcolor="#ffffff" align="center">
                    <tbody>
                      <tr>
                        <td class="es-m-p0t" style="Margin:0;padding-top:0;padding-bottom:30px;padding-left:30px;padding-right:30px;" align="left">
                          <table style="mso-table-lspace:0pt;mso-table-rspace:0pt;border-collapse:collapse;border-spacing:0px" width="100%" cellspacing="0" cellpadding="0">
                            <tbody>
                              <tr>
                                <td style="padding:0;Margin:0;width:520px" valign="top" align="center">
                                  <table role="presentation" style="mso-table-lspace:0pt;mso-table-rspace:0pt;border-collapse:collapse;border-spacing:0px" width="100%" cellspacing="0" cellpadding="0">
                                    <tbody>
                                      <tr><td style="padding:0;height:20px" align="left">&nbsp;</td></tr>
                                      <tr>
                                        <td style="padding:0;" align="left">
                                          <a href="${UI_BASE_URL}" target="_blank" style="display:inline-block;">
                                            <img width="180" class="adapt-img" style="display:block;border:0;outline:none;text-decoration:none;-ms-interpolation-mode:bicubic;" alt="${escapeHtml(env.APP_NAME)}" src="${LOGO_URL}">
                                          </a>
                                        </td>
                                      </tr>
                                      <tr><td style="padding:0;height:35px" align="left">&nbsp;</td></tr>
                                      ${innerRowsHtml}
                                    </tbody>
                                  </table>
                                </td>
                              </tr>
                            </tbody>
                          </table>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </td>
              </tr>
            </tbody>
          </table>
          <table class="es-content" style="mso-table-lspace:0pt;mso-table-rspace:0pt;border-collapse:collapse;border-spacing:0px;table-layout:fixed !important;width:100%" cellspacing="0" cellpadding="0" align="center">
            <tbody>
              <tr>
                <td class="es-info-area" style="padding:0;Margin:0" align="center">
                  <table class="es-content-body" style="mso-table-lspace:0pt;mso-table-rspace:0pt;border-collapse:collapse;border-spacing:0px;background-color:transparent;width:100%;max-width:600px" cellspacing="0" cellpadding="0" align="center">
                    <tbody>
                      <tr>
                        <td style="Margin:0;padding-top:10px;padding-bottom:30px;padding-left:30px;padding-right:30px;" align="left">
                          <table style="mso-table-lspace:0pt;mso-table-rspace:0pt;border-collapse:collapse;border-spacing:0px" width="100%" cellspacing="0" cellpadding="0">
                            <tbody>
                              <tr>
                                <td style="padding:0;Margin:0;width:520px" valign="top" align="center">
                                  <table role="presentation" style="mso-table-lspace:0pt;mso-table-rspace:0pt;border-collapse:collapse;border-spacing:0px" width="100%" cellspacing="0" cellpadding="0">
                                    <tbody>
                                      <tr>
                                        <td class="es-infoblock made_with" style="padding:0;Margin:0;line-height:120%;font-size:0;padding-top:0px;height:20px;" align="left">
                                          <p style="text-align:center;Margin:0;-webkit-text-size-adjust:none;-ms-text-size-adjust:none;mso-line-height-rule:exactly;line-height:24px;color:#000;font-size:14px;">
                                            ${escapeHtml(env.APP_NAME)}. &copy; ${CURRENT_YEAR} All Rights Reserved.
                                          </p>
                                        </td>
                                      </tr>
                                    </tbody>
                                  </table>
                                </td>
                              </tr>
                            </tbody>
                          </table>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </td>
              </tr>
            </tbody>
          </table>
        </td>
      </tr>
    </tbody>
  </table>
</body>
</html>`;
}

function ctaButton(href: string, label: string, bg = '#3b82f6'): string {
  return `<p style="margin-bottom:10px;">
  <a href="${href}" style="display:inline-block;background:${bg};color:#fff;padding:12px 22px;text-decoration:none;border-radius:4px;font-weight:600;">
    ${escapeHtml(label)}
  </a>
</p>`;
}

/** Image CTA when available; falls back to styled text button */
function ctaImageButton(
  href: string,
  label: string,
  imageUrl: string,
  opts?: { width?: number; height?: number; bg?: string },
): string {
  if (imageUrl) {
    const width = opts?.width ?? 160;
    const heightAttr = opts?.height ? ` height="${opts.height}"` : '';
    return `<p style="margin-bottom:10px;">
  <a href="${href}" target="_blank" style="display:inline-block;text-decoration:none;border:0;outline:none;">
    <img width="${width}"${heightAttr} alt="${escapeHtml(label)}" src="${imageUrl}" style="display:block;border:0;outline:none;text-decoration:none;-ms-interpolation-mode:bicubic;max-width:100%;height:auto;" />
  </a>
</p>`;
  }
  return ctaButton(href, label, opts?.bg);
}

function dashboardCta(href: string, label = 'Go to Dashboard'): string {
  return ctaImageButton(href, label, CTA_DASHBOARD_PNG, { width: 160, height: 41 });
}

function resetPasswordAction(hyperText: string): string {
  return ctaImageButton(hyperText, 'Reset Password', CTA_RESET_PNG, { width: 160, height: 41 });
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
    <tr>
      <td style="padding:0;Margin:0;" align="left">
        <p style="Margin:0;line-height:24px;color:#000;">Dear User,</p>
      </td>
    </tr>
    <tr>
      <td style="padding:0;Margin:0;" align="left">
        <p style="margin-top:0;margin-bottom:10px;line-height:24px;color:#000;">
          We are sending you this email because you requested a password reset. Click below to create a new password.
        </p>
        ${resetPasswordAction(hyperText)}
        <p style="margin-bottom:10px;line-height:24px;color:#000;">
          If you did not request a password reset, you can ignore this email. Your existing password will not be changed.
        </p>
      </td>
    </tr>
    <tr>
      <td>
        <p style="Margin:0;line-height:24px;color:#000;">Regards,<br />${escapeHtml(TEAM_NAME)}</p>
      </td>
    </tr>
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
  return wrapEmailBody(`
    <tr>
      <td style="padding:0;Margin:0;" align="left">
        <p style="Margin:0;line-height:24px;color:#000;">Dear User,</p>
      </td>
    </tr>
    <tr>
      <td style="padding:0;Margin:0;" align="left">
        <p style="margin-top:0;margin-bottom:10px;line-height:24px;color:#000;">
          Your verification code for <strong>${escapeHtml(purpose)}</strong> is:
        </p>
        <p style="margin-bottom:10px;">
          <span style="display:inline-block;font-size:28px;font-weight:700;letter-spacing:6px;color:#0f172a;">${escapeHtml(hyperText)}</span>
        </p>
        <p style="margin-bottom:10px;line-height:24px;color:#000;">
          This code is valid for 10 minutes. Do not share it with anyone.
          If you did not request this, you can ignore this email.
        </p>
      </td>
    </tr>
    <tr>
      <td>
        <p style="Margin:0;line-height:24px;color:#000;">Regards,<br />${escapeHtml(TEAM_NAME)}</p>
      </td>
    </tr>
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
  const row = (label: string, value: string) => `
    <tr>
      <td width="80" style="padding:0;Margin:0;" align="left"><p style="Margin:0;line-height:24px;color:#000;">${escapeHtml(label)}</p></td>
      <td width="10" style="line-height:24px;">:</td>
      <td style="text-align:left;color:#000;font-weight:normal;line-height:24px;">${escapeHtml(value)}</td>
    </tr>`;

  return wrapEmailBody(`
    ${row('Name', name)}
    ${row('Email', email)}
    ${row('Phone', phone || '—')}
    ${row('Subject', subject)}
    <tr>
      <td valign="top" width="80" style="padding:0;Margin:0;" align="left"><p style="Margin:0;line-height:24px;color:#000;">Message</p></td>
      <td valign="top" width="10" style="line-height:24px;">:</td>
      <td style="text-align:left;color:#000;font-weight:normal;line-height:24px;">${escapeHtml(message)}</td>
    </tr>
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
    <tr>
      <td style="padding:0;Margin:0;" align="left">
        <p style="Margin:0;line-height:24px;color:#000;">Dear ${escapeHtml(userName || 'User')},</p>
      </td>
    </tr>
    <tr>
      <td style="padding:0;Margin:0;" align="left">
        <p style="margin-top:0;margin-bottom:10px;line-height:24px;color:#000;">
          Your password has been reset by a Super Administrator.
        </p>
        <p style="margin-bottom:10px;line-height:24px;color:#000;">
          For security reasons, please set a new password using the link below:
        </p>
        ${ctaImageButton(resetLink, 'Set New Password', CTA_RESET_PNG, { width: 160, height: 41 })}
        <p style="margin-bottom:10px;line-height:24px;color:#000;">
          This link will expire soon. If you did not expect this, contact support immediately.
        </p>
      </td>
    </tr>
    <tr>
      <td>
        <p style="Margin:0;line-height:24px;color:#000;">Regards,<br />${escapeHtml(TEAM_NAME)}</p>
      </td>
    </tr>
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
    <tr>
      <td style="padding:0;Margin:0;" align="left">
        <p style="Margin:0;line-height:24px;color:#000;">Dear ${escapeHtml(firstName)},</p>
      </td>
    </tr>
    <tr>
      <td style="padding:0;Margin:0;" align="left">
        <p style="margin-top:0;margin-bottom:10px;line-height:24px;color:#000;">
          Welcome to <strong>${escapeHtml(env.APP_NAME)}</strong>. Your account is ready.
        </p>
        ${dashboardCta(loginUrl, 'Login to Dashboard')}
        <p style="margin-bottom:10px;line-height:24px;color:#000;">
          You can take exams, view results, and manage your profile from the dashboard.
        </p>
      </td>
    </tr>
    <tr>
      <td>
        <p style="Margin:0;line-height:24px;color:#000;">Regards,<br />${escapeHtml(TEAM_NAME)}</p>
      </td>
    </tr>
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
    <tr>
      <td style="padding:0;Margin:0;" align="left">
        <p style="Margin:0;line-height:24px;color:#000;">Dear User,</p>
      </td>
    </tr>
    <tr>
      <td style="padding:0;Margin:0;" align="left">
        <p style="margin-top:0;margin-bottom:10px;line-height:24px;color:#000;">
          We received your payment of <strong>${escapeHtml(currency)} ${escapeHtml(String(amount))}</strong>.
        </p>
        <p style="margin-bottom:10px;line-height:24px;color:#000;">
          Reference: <strong>${escapeHtml(paymentId)}</strong>
        </p>
        <p style="margin-bottom:10px;line-height:24px;color:#000;">
          Thank you for using ${escapeHtml(env.APP_NAME)}.
        </p>
      </td>
    </tr>
    <tr>
      <td>
        <p style="Margin:0;line-height:24px;color:#000;">Regards,<br />${escapeHtml(TEAM_NAME)}</p>
      </td>
    </tr>
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
    <tr>
      <td style="padding:0;Margin:0;" align="left">
        <p style="Margin:0;line-height:24px;color:#000;">Dear ${escapeHtml(userName || 'User')},</p>
      </td>
    </tr>
    <tr>
      <td style="padding:0;Margin:0;" align="left">
        <p style="margin-top:0;margin-bottom:10px;line-height:24px;color:#000;">
          Your document <strong>${escapeHtml(documentName)}</strong> has been reviewed and
          unfortunately <strong>rejected</strong>.
        </p>
        <p style="margin-bottom:10px;line-height:24px;color:#000;">
          Please re-upload the document with correct and clear details.
        </p>
        <p style="margin-bottom:10px;line-height:24px;color:#000;">
          Make sure:
        </p>
        <ul style="margin-top:0;line-height:24px;color:#000;">
          <li>The document is valid and not expired</li>
          <li>The image is clear and readable</li>
          <li>All required information is visible</li>
        </ul>
        ${ctaButton(actionUrl, 'Re-upload Document', '#d9534f')}
        <p style="margin-bottom:10px;line-height:24px;color:#000;">
          If you believe this is a mistake, contact support:<br/>${escapeHtml(supportEmail)}
        </p>
      </td>
    </tr>
    <tr>
      <td>
        <p style="Margin:0;line-height:24px;color:#000;">Regards,<br />${escapeHtml(TEAM_NAME)}</p>
      </td>
    </tr>
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
    <tr>
      <td style="padding:0;Margin:0;" align="left">
        <p style="Margin:0;line-height:24px;color:#000;">Dear ${escapeHtml(adminName || 'Organization Admin')},</p>
      </td>
    </tr>
    <tr>
      <td style="padding:0;Margin:0;" align="left">
        <p style="margin-top:0;margin-bottom:10px;line-height:24px;color:#000;">
          Your organization <strong>${escapeHtml(orgName)}</strong> has been added to
          <strong>${escapeHtml(env.APP_NAME)}</strong>.
        </p>
        <p style="margin-bottom:10px;line-height:24px;color:#000;">
          ${
            isApproved
              ? 'Your account is active. Use the credentials below to log in.'
              : 'Your account is pending approval. After Super Admin approves, you can log in with these credentials.'
          }
        </p>
        <table style="width:100%;border-collapse:collapse;margin:12px 0 16px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;" cellpadding="0" cellspacing="0">
          <tr>
            <td style="padding:12px 16px;line-height:24px;color:#000;">
              <strong>Login email:</strong><br/>
              ${escapeHtml(loginEmail)}
            </td>
          </tr>
          <tr>
            <td style="padding:0 16px 12px;line-height:24px;color:#000;">
              <strong>Temporary password:</strong><br/>
              <span style="font-family:ui-monospace,Consolas,monospace;font-size:15px;letter-spacing:0.5px;">${escapeHtml(temporaryPassword)}</span>
            </td>
          </tr>
        </table>
        ${dashboardCta(loginUrl, 'Login to Dashboard')}
        <p style="margin-bottom:10px;line-height:24px;color:#000;">
          For security, please change your password after the first login.
        </p>
      </td>
    </tr>
    <tr>
      <td>
        <p style="Margin:0;line-height:24px;color:#000;">Regards,<br />${escapeHtml(TEAM_NAME)}</p>
      </td>
    </tr>
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
    updated: 'Organization updated',
    deleted: 'Organization removed',
    deactivated: 'Organization deactivated',
  };
  const ctaLabel =
    action === 'approved' || action === 'created' || action === 'updated'
      ? 'Go to Dashboard'
      : 'Contact Support';
  const ctaColor = action === 'deleted' || action === 'deactivated' ? '#d9534f' : '#3b82f6';
  const useDashboardImage =
    action === 'approved' || action === 'created' || action === 'updated';

  return wrapEmailBody(`
    <tr>
      <td style="padding:0;Margin:0;" align="left">
        <p style="Margin:0;line-height:24px;color:#000;">Dear Organization Admin,</p>
      </td>
    </tr>
    <tr>
      <td style="padding:0;Margin:0;" align="left">
        <p style="margin-top:0;margin-bottom:10px;line-height:24px;color:#000;">
          <strong>${escapeHtml(titles[action])}</strong> for
          <strong>${escapeHtml(orgName)}</strong>.
        </p>
        <p style="margin-bottom:10px;line-height:24px;color:#000;">
          ${escapeHtml(message)}
        </p>
        ${
          actorName
            ? `<p style="margin-bottom:10px;line-height:24px;color:#000;">
          Action by: <strong>${escapeHtml(actorName)}</strong> (Super Admin)
        </p>`
            : ''
        }
        ${
          action !== 'deleted'
            ? useDashboardImage
              ? dashboardCta(actionUrl, ctaLabel)
              : ctaButton(actionUrl, ctaLabel, ctaColor)
            : ''
        }
      </td>
    </tr>
    <tr>
      <td>
        <p style="Margin:0;line-height:24px;color:#000;">Regards,<br />${escapeHtml(TEAM_NAME)}</p>
      </td>
    </tr>
  `);
}

/** Credentials email when faculty / student / org user is created by admin */
export function userCredentialsMailTemplate({
  firstName,
  roleLabel,
  loginEmail,
  temporaryPassword,
  loginUrl = `${UI_BASE_URL}/login`,
  orgName,
}: {
  firstName: string;
  roleLabel: string;
  loginEmail: string;
  temporaryPassword: string;
  loginUrl?: string;
  orgName?: string;
}): string {
  return wrapEmailBody(`
    <tr>
      <td style="padding:0;Margin:0;" align="left">
        <p style="Margin:0;line-height:24px;color:#000;">Dear ${escapeHtml(firstName)},</p>
      </td>
    </tr>
    <tr>
      <td style="padding:0;Margin:0;" align="left">
        <p style="margin-top:0;margin-bottom:10px;line-height:24px;color:#000;">
          Your <strong>${escapeHtml(roleLabel)}</strong> account has been created on
          <strong>${escapeHtml(env.APP_NAME)}</strong>${
            orgName ? ` for <strong>${escapeHtml(orgName)}</strong>` : ''
          }.
        </p>
        <table style="width:100%;border-collapse:collapse;margin:12px 0 16px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;" cellpadding="0" cellspacing="0">
          <tr>
            <td style="padding:12px 16px;line-height:24px;color:#000;">
              <strong>Login email:</strong><br/>
              ${escapeHtml(loginEmail)}
            </td>
          </tr>
          <tr>
            <td style="padding:0 16px 12px;line-height:24px;color:#000;">
              <strong>Password:</strong><br/>
              <span style="font-family:ui-monospace,Consolas,monospace;font-size:15px;letter-spacing:0.5px;">${escapeHtml(temporaryPassword)}</span>
            </td>
          </tr>
        </table>
        ${dashboardCta(loginUrl, 'Go to Dashboard')}
        <p style="margin-bottom:10px;line-height:24px;color:#000;">
          For security, please change your password after the first login.
          If you forget it later, use <strong>Forgot Password</strong> on the login page.
        </p>
      </td>
    </tr>
    <tr>
      <td>
        <p style="Margin:0;line-height:24px;color:#000;">Regards,<br />${escapeHtml(TEAM_NAME)}</p>
      </td>
    </tr>
  `);
}
