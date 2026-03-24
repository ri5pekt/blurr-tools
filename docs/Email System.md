# Email System

**Reference:** `pfm-surveys` → `apps/api/src/services/email.service.ts`

---

## Overview

Email is sent via **nodemailer** with a standard **SMTP transport**. The configured SMTP provider is **Hostinger** (`smtp.hostinger.com:465`, SSL). No third-party email service SDK (no SendGrid, Resend, SES).

The `EmailService` class lives in `apps/api/src/services/email.service.ts` and is called directly from route handlers. Email is **fire-and-forget from the user's perspective** — if sending fails, the action still succeeds and the error is surfaced gracefully (e.g. temp password returned in response so admin can share it manually).

---

## Current Usage

| Trigger | Email Sent |
|---------|-----------|
| Admin invites a new user | Invitation email with temporary password + login link |
| Admin resends invite | Same email with a newly generated temp password |

---

## `EmailService` Pattern

`apps/api/src/services/email.service.ts`:

```typescript
import nodemailer from 'nodemailer'
import type { Transporter } from 'nodemailer'

export class EmailService {
  private static transporter: Transporter | null = null

  private static getTransporter(): Transporter {
    if (!this.transporter) {
      const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env

      if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
        throw new Error('SMTP credentials not configured (SMTP_HOST, SMTP_USER, SMTP_PASS required)')
      }

      this.transporter = nodemailer.createTransport({
        host: SMTP_HOST,
        port: SMTP_PORT ? parseInt(SMTP_PORT, 10) : 465,
        secure: true,  // SSL on port 465
        auth: { user: SMTP_USER, pass: SMTP_PASS },
      })
    }
    return this.transporter
  }

  static async sendInvitationEmail({ to, tempPassword, invitedBy }: {
    to: string
    tempPassword: string
    invitedBy: string
  }) {
    const fromEmail = process.env.EMAIL_FROM || process.env.SMTP_USER
    const fromName  = process.env.EMAIL_FROM_NAME || 'Blurr Tools'
    const appUrl    = process.env.APP_URL || 'http://localhost:5173'

    const html = `...`  // branded HTML template (see below)
    const text = `...`  // plain text fallback

    try {
      const info = await this.getTransporter().sendMail({
        from: `"${fromName}" <${fromEmail}>`,
        to,
        subject: "You've been invited to Blurr Tools",
        text,
        html,
      })
      return { success: true, messageId: info.messageId }
    } catch (error: any) {
      console.error('Failed to send invitation email:', error)
      throw new Error(`Failed to send email: ${error.message}`)
    }
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
```

**Key design decisions:**
- **Lazy singleton** — transporter is created on first use, not at startup
- **No startup validation** — SMTP is validated lazily; if credentials are wrong, the first send attempt will fail and throw
- If a test connection check is wanted, call `EmailService.testConnection()` manually (e.g. health check endpoint or admin diagnostics route)

---

## Error Handling in Routes

Email failure must **never block the primary action**. Pattern used in all route handlers:

```typescript
let emailSent = false
let emailError: string | null = null

try {
  await EmailService.sendInvitationEmail({ to, tempPassword, invitedBy: request.user.name })
  emailSent = true
} catch (error: any) {
  fastify.log.error('Failed to send invitation email:', error)
  emailError = error.message
}

return {
  user: { id: newUser.id, email: newUser.email },
  emailSent,
  // Return temp password in response if email failed, so admin can share it manually
  tempPassword: emailSent ? undefined : tempPassword,
  message: emailSent
    ? 'Invitation sent successfully.'
    : `User created but email failed. Share this password manually: ${tempPassword}`,
  error: emailError,
}
```

---

## Email Templates

Templates are **inline HTML strings** in `EmailService` — no templating engine (no Handlebars, EJS, etc.). Each email method builds its own `html` + `text` pair.

Template structure: styled HTML with embedded CSS, branded with Blurr colors (`#b842a9` primary, `#862f7b` dark), + plain text fallback.

---

## Environment Variables

```bash
# SMTP — Hostinger
SMTP_HOST=smtp.hostinger.com
SMTP_PORT=465
SMTP_USER=hello@blurr.com         # mailbox address
SMTP_PASS=your_smtp_password

# Optional overrides
EMAIL_FROM=hello@blurr.com        # From address (defaults to SMTP_USER)
EMAIL_FROM_NAME=Blurr Tools       # From display name
APP_URL=https://tools.blurr.com   # Login link in emails (defaults to localhost:5173)
```

**Zod validation in `env.ts`:**
```typescript
// SMTP is optional at startup — app works without it if email features aren't used
SMTP_HOST:     z.string().optional(),
SMTP_PORT:     z.coerce.number().optional().default(465),
SMTP_USER:     z.string().optional(),
SMTP_PASS:     z.string().optional(),
EMAIL_FROM:    z.string().email().optional(),
EMAIL_FROM_NAME: z.string().optional().default('Blurr Tools'),
APP_URL:       z.string().url().optional().default('http://localhost:5173'),
```

SMTP fields are **optional** in env validation so the app starts cleanly even when email is not configured. The error surfaces only when `EmailService.getTransporter()` is first called without credentials.

---

## Docker Compose

Production `docker-compose.yml` — inject SMTP env into the `api` service (worker only needs it if it sends email directly):

```yaml
api:
  environment:
    SMTP_HOST: ${SMTP_HOST}
    SMTP_PORT: ${SMTP_PORT:-465}
    SMTP_USER: ${SMTP_USER}
    SMTP_PASS: ${SMTP_PASS}
    EMAIL_FROM_NAME: ${EMAIL_FROM_NAME:-Blurr Tools}
    APP_URL: ${APP_URL}
```

---

## Dependency

```bash
pnpm add nodemailer --filter @blurr-tools/api
pnpm add -D @types/nodemailer --filter @blurr-tools/api
```
