import nodemailer from 'nodemailer';

export type MailLang = 'tr' | 'en' | 'sq';

export interface SendPasswordResetEmailInput {
  to: string;
  displayName: string;
  code: string;
  expiresInMinutes: number;
  lang?: MailLang;
}

export interface MailSendResult {
  sent: boolean;
  provider: 'resend' | 'smtp' | 'dev-console';
  error?: string;
}

export interface MailProvider {
  sendPasswordResetEmail(input: SendPasswordResetEmailInput): Promise<MailSendResult>;
}

interface LocalizedMailCopy {
  subject: string;
  greeting: string;
  intro: string;
  codeLabel: string;
  expiry: string;
  ignoreNotice: string;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function getMailCopy(lang: MailLang | undefined, displayName: string, expiresInMinutes: number): LocalizedMailCopy {
  const safeName = displayName.trim() || 'GyroPilot';
  switch (lang) {
    case 'en':
      return {
        subject: 'GYROGON · Password Reset Code',
        greeting: `Hi ${safeName},`,
        intro: 'Use the 6-digit verification code below to reset your GYROGON password:',
        codeLabel: 'Verification Code',
        expiry: `This code is valid for ${expiresInMinutes} minutes and can only be used once.`,
        ignoreNotice: 'If you did not request a password reset, you can safely ignore this email.'
      };
    case 'sq':
      return {
        subject: 'GYROGON · Kodi i Rivendosjes së Fjalëkalimit',
        greeting: `Përshëndetje ${safeName},`,
        intro: 'Përdor kodin 6-shifror të verifikimit më poshtë për të rivendosur fjalëkalimin në GYROGON:',
        codeLabel: 'Kodi i Verifikimit',
        expiry: `Ky kod është i vlefshëm për ${expiresInMinutes} minuta dhe mund të përdoret vetëm një herë.`,
        ignoreNotice: 'Nëse nuk e ke kërkuar ti rivendosjen e fjalëkalimit, mund ta shpërfillësh këtë email.'
      };
    case 'tr':
    default:
      return {
        subject: 'GYROGON · Şifre Sıfırlama Kodu',
        greeting: `Merhaba ${safeName},`,
        intro: 'GYROGON hesabının şifresini sıfırlamak için aşağıdaki 6 haneli doğrulama kodunu kullan:',
        codeLabel: 'Doğrulama Kodu',
        expiry: `Bu kod ${expiresInMinutes} dakika boyunca geçerlidir ve tek kullanımlıktır.`,
        ignoreNotice: 'Bu talebi sen oluşturmadıysan bu e-postayı güvenle görmezden gelebilirsin.'
      };
  }
}

function buildResetEmailContent(input: SendPasswordResetEmailInput): {
  subject: string;
  text: string;
  html: string;
} {
  const copy = getMailCopy(input.lang, input.displayName, input.expiresInMinutes);
  const text = [
    copy.greeting,
    '',
    copy.intro,
    `${copy.codeLabel}: ${input.code}`,
    '',
    copy.expiry,
    copy.ignoreNotice,
    '',
    'GYROGON'
  ].join('\n');

  const html = `<!doctype html>
<html>
<body style="margin:0;padding:24px;background-color:#0b1120;color:#e2e8f0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:480px;margin:0 auto;background-color:#111827;border:1px solid #1e293b;border-radius:18px;padding:28px;">
    <div style="font-size:22px;font-weight:800;letter-spacing:0.08em;color:#ffffff;margin-bottom:18px;">
      GYRO<span style="color:#22d3ee;">GON</span>
    </div>
    <p style="margin:0 0 12px;font-size:15px;font-weight:700;color:#f8fafc;">${escapeHtml(copy.greeting)}</p>
    <p style="margin:0 0 20px;font-size:14px;line-height:1.6;color:#cbd5e1;">${escapeHtml(copy.intro)}</p>
    <div style="background-color:#0f172a;border:1px solid #38bdf8;border-radius:14px;padding:18px;text-align:center;margin-bottom:20px;">
      <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.14em;color:#38bdf8;margin-bottom:8px;">
        ${escapeHtml(copy.codeLabel)}
      </div>
      <div style="font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;font-size:32px;font-weight:800;letter-spacing:0.28em;color:#ffffff;">
        ${escapeHtml(input.code)}
      </div>
    </div>
    <p style="margin:0 0 10px;font-size:12px;line-height:1.5;color:#94a3b8;">${escapeHtml(copy.expiry)}</p>
    <p style="margin:0;font-size:12px;line-height:1.5;color:#64748b;">${escapeHtml(copy.ignoreNotice)}</p>
  </div>
</body>
</html>`;

  return { subject: copy.subject, text, html };
}

export function createMailer(): MailProvider {
  return {
    async sendPasswordResetEmail(input: SendPasswordResetEmailInput): Promise<MailSendResult> {
      const { subject, text, html } = buildResetEmailContent(input);
      const resendApiKey = process.env.RESEND_API_KEY?.trim();
      const smtpHost = process.env.SMTP_HOST?.trim();

      if (resendApiKey) {
        const from = process.env.MAIL_FROM?.trim() || 'GYROGON <noreply@gyrogon.com>';
        try {
          const res = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${resendApiKey}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              from,
              to: [input.to],
              subject,
              html,
              text
            })
          });
          if (!res.ok) {
            const errBody = await res.text().catch(() => '');
            console.error('[GYROGON MAIL] Resend API error:', res.status, errBody);
            return {
              sent: false,
              provider: 'resend',
              error: `RESEND_${res.status}`
            };
          }
          return { sent: true, provider: 'resend' };
        } catch (err) {
          console.error('[GYROGON MAIL] Resend request failed:', err);
          return {
            sent: false,
            provider: 'resend',
            error: err instanceof Error ? err.message : 'RESEND_FAILED'
          };
        }
      }

      if (smtpHost) {
        const port = Number(process.env.SMTP_PORT || 587);
        const secure = process.env.SMTP_SECURE === 'true' || port === 465;
        const user = process.env.SMTP_USER?.trim();
        const pass = process.env.SMTP_PASS ?? '';
        const from = process.env.MAIL_FROM?.trim() || user || 'GYROGON <noreply@gyrogon.com>';

        try {
          const transporter = nodemailer.createTransport({
            host: smtpHost,
            port: Number.isFinite(port) && port > 0 ? port : 587,
            secure,
            ...(user ? { auth: { user, pass } } : {})
          });
          await transporter.sendMail({
            from,
            to: input.to,
            subject,
            text,
            html
          });
          return { sent: true, provider: 'smtp' };
        } catch (err) {
          console.error('[GYROGON MAIL] SMTP send failed:', err);
          return {
            sent: false,
            provider: 'smtp',
            error: err instanceof Error ? err.message : 'SMTP_FAILED'
          };
        }
      }

      if (process.env.NODE_ENV === 'production') {
        console.error('[GYROGON MAIL] Neither RESEND_API_KEY nor SMTP_HOST is configured in production.');
        return {
          sent: false,
          provider: 'dev-console',
          error: 'MAIL_NOT_CONFIGURED'
        };
      }

      console.info(
        `[GYROGON DEV MAIL] Password reset code for ${input.to}: ${input.code} (valid ${input.expiresInMinutes}m)`
      );
      return { sent: true, provider: 'dev-console' };
    }
  };
}
