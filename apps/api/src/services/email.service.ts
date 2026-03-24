import nodemailer from 'nodemailer'
import type { Transporter } from 'nodemailer'

export class EmailService {
  private static transporter: Transporter | null = null

  private static getTransporter(): Transporter {
    if (!this.transporter) {
      const host = process.env.SMTP_HOST
      const user = process.env.SMTP_USER
      const pass = process.env.SMTP_PASS

      if (!host || !user || !pass) {
        throw new Error('SMTP credentials not configured (SMTP_HOST, SMTP_USER, SMTP_PASS required)')
      }

      this.transporter = nodemailer.createTransport({
        host,
        port: process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT, 10) : 465,
        secure: true,
        auth: { user, pass },
      })
    }
    return this.transporter
  }

  static async sendInvitationEmail({ to, tempPassword, invitedBy }: {
    to: string
    tempPassword: string
    invitedBy: string
  }) {
    const fromEmail  = process.env.EMAIL_FROM || process.env.SMTP_USER
    const fromName   = process.env.EMAIL_FROM_NAME || 'Blurr Tools'
    const appUrl     = process.env.APP_URL || 'http://localhost:5173'
    const loginUrl   = `${appUrl}/login`

    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#862f7b 0%,#b842a9 100%);padding:32px 40px;text-align:center;">
              <div style="display:inline-flex;align-items:center;gap:12px;">
                <div style="width:44px;height:44px;border-radius:10px;background:rgba(255,255,255,0.2);display:inline-flex;align-items:center;justify-content:center;font-size:22px;font-weight:700;color:#fff;">B</div>
                <span style="font-size:20px;font-weight:700;color:#ffffff;vertical-align:middle;">Blurr Tools</span>
              </div>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:40px;">
              <h2 style="margin:0 0 12px;font-size:22px;font-weight:700;color:#111827;">You've been invited</h2>
              <p style="margin:0 0 24px;font-size:15px;color:#6b7280;line-height:1.6;">
                <strong style="color:#374151;">${invitedBy}</strong> has invited you to join <strong style="color:#374151;">Blurr Tools</strong>.
                Use the temporary password below to sign in and set up your account.
              </p>

              <div style="background:#fdf0fc;border:1px solid #f3adef;border-radius:8px;padding:20px;margin-bottom:28px;text-align:center;">
                <p style="margin:0 0 4px;font-size:12px;font-weight:600;color:#862f7b;text-transform:uppercase;letter-spacing:0.05em;">Temporary Password</p>
                <p style="margin:0;font-size:24px;font-weight:700;color:#111827;letter-spacing:0.1em;font-family:monospace;">${tempPassword}</p>
              </div>

              <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
                <tr>
                  <td align="center">
                    <a href="${loginUrl}"
                       style="display:inline-block;background:linear-gradient(135deg,#862f7b,#b842a9);color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:14px 36px;border-radius:8px;">
                      Sign In to Blurr Tools
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin:0;font-size:13px;color:#9ca3af;line-height:1.6;">
                Please change your password after your first login. If you didn't expect this invitation, you can safely ignore this email.
              </p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background:#f9fafb;border-top:1px solid #e5e7eb;padding:20px 40px;text-align:center;">
              <p style="margin:0;font-size:12px;color:#9ca3af;">
                This is an automated message from Blurr Tools. Do not reply.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`

    const text = `
You've been invited to Blurr Tools by ${invitedBy}.

Your temporary password is: ${tempPassword}

Sign in at: ${loginUrl}

Please change your password after your first login.
`.trim()

    const info = await this.getTransporter().sendMail({
      from: `"${fromName}" <${fromEmail}>`,
      to,
      subject: "You've been invited to Blurr Tools",
      text,
      html,
    })

    return { success: true, messageId: info.messageId }
  }

  static async testConnection(): Promise<boolean> {
    try {
      await this.getTransporter().verify()
      return true
    } catch {
      return false
    }
  }
}
