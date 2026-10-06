// Email service using Gmail SMTP
export interface EmailAttachment {
  filename: string;
  // base64-encoded file content
  content: string;
  contentType?: string;
}

export interface EmailConfig {
  to: string;
  subject: string;
  html: string;
  attachments?: EmailAttachment[];
}

interface EmailEnv {
  APP_URL: string;
  GMAIL_USER?: string;
  GMAIL_APP_PASSWORD?: string;
  EMAIL_SERVICE_URL?: string;
  EMAIL_API_TOKEN?: string;
}

const DEFAULT_EMAIL_SERVICE_URL = 'https://email-service.vsam.workers.dev/send-email';

export async function sendEmail(config: EmailConfig, env: EmailEnv): Promise<boolean> {
  try {
    // Call the external email server that handles Gmail SMTP.
    // Cloudflare Workers cannot open raw TCP sockets, so SMTP has to live
    // on a plain Node host (Render) rather than in a Worker.
    const response = await fetch(env.EMAIL_SERVICE_URL || DEFAULT_EMAIL_SERVICE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(env.EMAIL_API_TOKEN ? { 'X-Email-Token': env.EMAIL_API_TOKEN } : {}),
      },
      body: JSON.stringify({
        to: config.to,
        subject: config.subject,
        html: config.html,
        attachments: config.attachments,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Email send failed for ${config.to}:`, errorText);
      return false;
    }

    console.log('Email sent successfully to:', config.to);
    return true;
  } catch (error) {
    console.error(`Email send error for ${config.to}:`, error);
    return false;
  }
}

// Generate approval email HTML
export function getApprovalRequestEmail(
  requestNumber: string,
  employeeName: string,
  programNames: string,
  approverName: string,
  approverLevel: number,
  token: string,
  appUrl: string,
  requestId?: number | string
): string {
  const approveUrl = `${appUrl}/approve.html?token=${token}&action=approve`;
  const rejectUrl = `${appUrl}/approve.html?token=${token}&action=reject`;
  const viewUrl = requestId
    ? `${appUrl}/api/requests/${requestId}/print-form`
    : `${appUrl}/approve.html?token=${token}`;

  return `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:20px;background:#ffffff">
      <div style="text-align:center;padding:20px 0;border-bottom:3px solid #1e3a5f">
        <h1 style="color:#1e3a5f;margin:0;font-size:28px">🏨 AVANI+ User Access Request</h1>
      </div>

      <div style="padding:30px 20px">
        <p style="font-size:16px;color:#333;line-height:1.6">
          Dear <strong style="color:#1e3a5f">${approverName}</strong>,
        </p>

        <p style="font-size:16px;color:#333;line-height:1.6">
          A new user access request requires your approval as <strong style="color:#1e3a5f">Approver Level ${approverLevel}</strong>.
        </p>

        <div style="background:#f8f9fa;padding:20px;border-radius:8px;margin:20px 0;border-left:4px solid #1e3a5f">
          <p style="margin:0 0 8px;color:#666;font-size:14px">Request Number:</p>
          <p style="margin:0 0 16px;font-size:18px;font-weight:600;color:#1e3a5f">${requestNumber}</p>

          <p style="margin:0 0 8px;color:#666;font-size:14px">Employee Name:</p>
          <p style="margin:0 0 16px;font-size:16px;font-weight:500;color:#333">${employeeName}</p>

          <p style="margin:0 0 8px;color:#666;font-size:14px">Requested Programs:</p>
          <p style="margin:0;font-size:14px;color:#555;line-height:1.6">${programNames}</p>
        </div>

        <div style="text-align:center;margin:40px 0">
          <p style="font-size:15px;font-weight:600;color:#555;margin-bottom:20px">Quick Actions:</p>
          <table cellpadding="0" cellspacing="0" border="0" style="margin:0 auto">
            <tr>
              <td style="padding-right:10px">
                <a href="${approveUrl}" style="display:inline-block;background:#16a34a;color:white;padding:14px 40px;text-decoration:none;border-radius:8px;font-weight:600;font-size:16px;box-shadow:0 2px 4px rgba(22,163,74,0.3)">
                  ✅ Approve
                </a>
              </td>
              <td style="padding-left:10px">
                <a href="${rejectUrl}" style="display:inline-block;background:#dc2626;color:white;padding:14px 40px;text-decoration:none;border-radius:8px;font-weight:600;font-size:16px;box-shadow:0 2px 4px rgba(220,38,38,0.3)">
                  ❌ Reject
                </a>
              </td>
            </tr>
          </table>

          <p style="margin:24px 0 0">
            <a href="${viewUrl}" style="display:inline-block;color:#1e3a5f;text-decoration:none;font-size:14px;font-weight:600;border:1px solid #1e3a5f;padding:10px 28px;border-radius:8px">
              📄 View Full Request
            </a>
          </p>
        </div>

        <div style="background:#fffbeb;padding:16px;border-radius:6px;border-left:3px solid #f59e0b;margin-top:30px">
          <p style="margin:0;font-size:13px;color:#92400e;line-height:1.5">
            💡 <strong>Note:</strong> Clicking a button will redirect you to a page where you can add optional comments before confirming.
          </p>
          <p style="margin:8px 0 0;font-size:13px;color:#92400e;line-height:1.5">
            📎 The full request form is attached to this email. Open it and press Ctrl+P (Cmd+P) to save it as a PDF.
          </p>
        </div>
      </div>

      <div style="border-top:1px solid #e5e7eb;padding:20px;text-align:center">
        <p style="color:#9ca3af;font-size:12px;margin:0">
          This approval link is unique to you. Please do not forward this email.
        </p>
      </div>
    </div>
  `;
}

// Generate approval notification email (to requester)
export function getApprovalNotificationEmail(
  requestNumber: string,
  employeeName: string,
  approverRole: string,
  approved: boolean,
  comment?: string
): string {
  const status = approved ? '✅ Approved' : '❌ Rejected';
  const color = approved ? '#16a34a' : '#dc2626';

  return `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:20px;background:#ffffff">
      <div style="text-align:center;padding:20px 0;border-bottom:3px solid ${color}">
        <h1 style="color:${color};margin:0;font-size:28px">Request Status Update</h1>
      </div>

      <div style="padding:30px 20px">
        <div style="background:#f8f9fa;padding:20px;border-radius:8px;border-left:4px solid ${color}">
          <p style="margin:0 0 8px;color:#666;font-size:14px">Request Number:</p>
          <p style="margin:0 0 16px;font-size:18px;font-weight:600;color:#1e3a5f">${requestNumber}</p>

          <p style="margin:0;font-size:16px;color:#333">
            <strong>${approverRole}</strong> has <strong style="color:${color}">${status}</strong> this request.
          </p>
        </div>

        ${comment ? `
        <div style="background:#fffbeb;padding:16px;border-radius:8px;border-left:3px solid #f59e0b;margin-top:20px">
          <p style="margin:0 0 8px;font-size:13px;font-weight:600;color:#92400e">Comment:</p>
          <p style="margin:0;font-size:14px;color:#78350f;line-height:1.5">${comment}</p>
        </div>
        ` : ''}
      </div>
    </div>
  `;
}

// Generate completion email (final approval/rejection)
export function getApprovalCompletedEmail(
  requestNumber: string,
  employeeName: string,
  programNames: string,
  approved: boolean = true,
  appUrl?: string,
  requestId?: number | string
): string {
  const viewUrl = appUrl && requestId ? `${appUrl}/api/requests/${requestId}/print-form` : null;
  const color = approved ? '#16a34a' : '#dc2626';
  const title = approved ? '✅ Request Fully Approved' : '❌ Request Rejected';
  const message = approved
    ? 'Your user access request has been fully approved by all approvers.'
    : 'Your user access request has been rejected.';

  return `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:20px;background:#ffffff">
      <div style="text-align:center;padding:20px 0;border-bottom:3px solid ${color}">
        <h1 style="color:${color};margin:0;font-size:28px">${title}</h1>
      </div>

      <div style="padding:30px 20px">
        <p style="font-size:16px;color:#333;line-height:1.6">
          ${message}
        </p>

        <div style="background:#f8f9fa;padding:20px;border-radius:8px;margin:20px 0;border-left:4px solid ${color}">
          <p style="margin:0 0 8px;color:#666;font-size:14px">Request Number:</p>
          <p style="margin:0 0 16px;font-size:18px;font-weight:600;color:#1e3a5f">${requestNumber}</p>

          <p style="margin:0 0 8px;color:#666;font-size:14px">Employee Name:</p>
          <p style="margin:0 0 16px;font-size:16px;font-weight:500;color:#333">${employeeName}</p>

          <p style="margin:0 0 8px;color:#666;font-size:14px">Programs:</p>
          <p style="margin:0;font-size:14px;color:#555;line-height:1.6">${programNames}</p>
        </div>

        ${viewUrl ? `
        <div style="text-align:center;margin:24px 0">
          <a href="${viewUrl}" style="display:inline-block;color:#1e3a5f;text-decoration:none;font-size:14px;font-weight:600;border:1px solid #1e3a5f;padding:10px 28px;border-radius:8px">
            📄 View Full Request
          </a>
        </div>
        ` : ''}

        ${approved ? `
        <div style="background:#f0fdf4;padding:16px;border-radius:6px;border-left:3px solid #16a34a;margin-top:20px">
          <p style="margin:0;font-size:13px;color:#166534">
            🎉 <strong>Next Steps:</strong> The IT team will process your access request shortly.
          </p>
          <p style="margin:8px 0 0;font-size:13px;color:#166534">
            📎 The approved request form is attached. Open it and press Ctrl+P (Cmd+P) to save it as a PDF.
          </p>
        </div>
        ` : ''}
      </div>
    </div>
  `;
}
