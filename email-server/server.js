const express = require('express');
const nodemailer = require('nodemailer');

const app = express();

// Attachments arrive base64-encoded, so allow a generous body size.
app.use(express.json({ limit: '10mb' }));

const PORT = process.env.PORT || 3000;
const GMAIL_USER = process.env.GMAIL_USER;
const GMAIL_APP_PASSWORD = process.env.GMAIL_APP_PASSWORD;
const EMAIL_API_TOKEN = process.env.EMAIL_API_TOKEN;
const FROM_NAME = process.env.FROM_NAME || 'AVANI+ User Request System';

// A single reusable transporter keeps the SMTP connection pool warm.
let transporter = null;
function getTransporter() {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 587,
      secure: false, // STARTTLS on port 587
      auth: { user: GMAIL_USER, pass: GMAIL_APP_PASSWORD },
      pool: true,
      maxConnections: 3,
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 15000,
      tls: { rejectUnauthorized: false },
    });
  }
  return transporter;
}

// This endpoint can send mail through our Gmail account, so it must never be
// callable by the public internet - require a shared secret on every request.
function requireToken(req, res, next) {
  if (!EMAIL_API_TOKEN) {
    console.error('EMAIL_API_TOKEN is not set - refusing all requests');
    return res.status(500).json({ success: false, message: 'Email server not configured' });
  }

  const provided = req.get('X-Email-Token');
  if (provided !== EMAIL_API_TOKEN) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }

  next();
}

app.get('/', (_req, res) => {
  res.json({
    success: true,
    message: 'Email Server is running',
    service: 'Gmail SMTP',
    configured: Boolean(GMAIL_USER && GMAIL_APP_PASSWORD && EMAIL_API_TOKEN),
  });
});

app.post('/send-email', requireToken, async (req, res) => {
  try {
    const { to, subject, html, attachments } = req.body || {};

    if (!to || !subject || !html) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: to, subject, html',
      });
    }

    if (!GMAIL_USER || !GMAIL_APP_PASSWORD) {
      console.error('Gmail credentials not configured');
      return res.status(500).json({ success: false, message: 'Email server not configured' });
    }

    // Expected shape: [{ filename, content (base64), contentType? }]
    let mailAttachments;
    if (attachments !== undefined && attachments !== null) {
      if (!Array.isArray(attachments)) {
        return res.status(400).json({ success: false, message: 'attachments must be an array' });
      }

      for (const att of attachments) {
        if (!att || typeof att.filename !== 'string' || typeof att.content !== 'string') {
          return res.status(400).json({
            success: false,
            message: 'Each attachment needs a filename and base64 content',
          });
        }
      }

      mailAttachments = attachments.map((att) => ({
        filename: att.filename,
        content: att.content,
        encoding: 'base64',
        contentType: att.contentType || 'application/octet-stream',
      }));
    }

    const info = await getTransporter().sendMail({
      from: `"${FROM_NAME}" <${GMAIL_USER}>`,
      to,
      subject,
      html,
      ...(mailAttachments ? { attachments: mailAttachments } : {}),
    });

    console.log(
      `Email sent: ${info.messageId} | to: ${to} | attachments: ${mailAttachments ? mailAttachments.length : 0}`
    );

    res.json({ success: true, message: 'Email sent successfully', messageId: info.messageId });
  } catch (error) {
    console.error('Email send error:', error);
    res.status(500).json({ success: false, message: 'Failed to send email', error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`Email server listening on port ${PORT}`);
  if (!GMAIL_USER || !GMAIL_APP_PASSWORD) {
    console.warn('WARNING: GMAIL_USER / GMAIL_APP_PASSWORD are not set');
  }
  if (!EMAIL_API_TOKEN) {
    console.warn('WARNING: EMAIL_API_TOKEN is not set - all requests will be rejected');
  }
});
