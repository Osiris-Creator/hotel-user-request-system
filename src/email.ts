// Email service using Gmail SMTP via MailChannels (Cloudflare Workers compatible)
export interface EmailConfig {
  to: string;
  subject: string;
  html: string;
  from?: string;
}

export async function sendEmail(config: EmailConfig): Promise<boolean> {
  try {
    const response = await fetch('https://api.mailchannels.net/tx/v1/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        personalizations: [
          {
            to: [{ email: config.to }],
          },
        ],
        from: {
          email: config.from || 'noreply@avanisamui.com',
          name: 'AVANI+ User Request System',
        },
        subject: config.subject,
        content: [
          {
            type: 'text/html',
            value: config.html,
          },
        ],
      }),
    });

    return response.ok;
  } catch (error) {
    console.error('Email send error:', error);
    return false;
  }
}

// Email templates
export function getApprovalRequestEmail(
  requestNumber: string,
  employeeName: string,
  programs: string[],
  approverName: string,
  approverLevel: number
): string {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
        .content { background: #ffffff; padding: 30px; border: 1px solid #e0e0e0; border-radius: 0 0 8px 8px; }
        .badge { display: inline-block; background: #667eea; color: white; padding: 5px 12px; border-radius: 20px; font-size: 14px; margin: 5px 0; }
        .button { display: inline-block; background: #667eea; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; margin: 20px 0; }
        .footer { text-align: center; margin-top: 20px; font-size: 12px; color: #999; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>🏨 New Access Request</h1>
          <p>Approval Required</p>
        </div>
        <div class="content">
          <p>Dear <strong>${approverName}</strong>,</p>

          <p>A new user access request requires your approval:</p>

          <div style="background: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <p><strong>Request Number:</strong> <span class="badge">${requestNumber}</span></p>
            <p><strong>Employee:</strong> ${employeeName}</p>
            <p><strong>Programs Requested:</strong></p>
            <ul>
              ${programs.map(p => `<li>${p}</li>`).join('')}
            </ul>
            <p><strong>Your Approval Level:</strong> Approver ${approverLevel}</p>
          </div>

          <p>Please review and approve this request at your earliest convenience.</p>

          <a href="https://avani-user-request.pages.dev" class="button">Review Request</a>

          <p style="margin-top: 30px; color: #666; font-size: 14px;">
            This is an automated notification from AVANI+ User Request System.
          </p>
        </div>
        <div class="footer">
          <p>© 2026 AVANI+ Vacation Club Samui</p>
        </div>
      </div>
    </body>
    </html>
  `;
}

export function getApprovalCompletedEmail(
  requestNumber: string,
  employeeName: string,
  programs: string[]
): string {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: linear-gradient(135deg, #11998e 0%, #38ef7d 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
        .content { background: #ffffff; padding: 30px; border: 1px solid #e0e0e0; border-radius: 0 0 8px 8px; }
        .badge { display: inline-block; background: #11998e; color: white; padding: 5px 12px; border-radius: 20px; font-size: 14px; margin: 5px 0; }
        .success { color: #11998e; font-size: 48px; text-align: center; margin: 20px 0; }
        .footer { text-align: center; margin-top: 20px; font-size: 12px; color: #999; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>✅ Request Approved</h1>
          <p>All Approvals Completed</p>
        </div>
        <div class="content">
          <div class="success">✓</div>

          <p>The following access request has been fully approved:</p>

          <div style="background: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <p><strong>Request Number:</strong> <span class="badge">${requestNumber}</span></p>
            <p><strong>Employee:</strong> ${employeeName}</p>
            <p><strong>Programs Approved:</strong></p>
            <ul>
              ${programs.map(p => `<li>${p}</li>`).join('')}
            </ul>
            <p style="color: #11998e;"><strong>Status:</strong> ✓ Approved</p>
          </div>

          <p>The IT team can now proceed with granting the requested access.</p>

          <p style="margin-top: 30px; color: #666; font-size: 14px;">
            This is an automated notification from AVANI+ User Request System.
          </p>
        </div>
        <div class="footer">
          <p>© 2026 AVANI+ Vacation Club Samui</p>
        </div>
      </div>
    </body>
    </html>
  `;
}
