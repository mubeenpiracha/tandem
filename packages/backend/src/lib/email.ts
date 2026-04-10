import { Resend } from 'resend';

function getClient(): Resend {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error('RESEND_API_KEY is not set');
  return new Resend(apiKey);
}

function getFromAddress(): string {
  return process.env.EMAIL_FROM ?? 'Tandem <noreply@tandem.app>';
}

function getFrontendUrl(): string {
  return process.env.FRONTEND_URL ?? 'http://localhost:5173';
}

export async function sendVerificationEmail(to: string, token: string): Promise<void> {
  const client = getClient();
  const link = `${getFrontendUrl()}/verify-email?token=${encodeURIComponent(token)}`;

  await client.emails.send({
    from: getFromAddress(),
    to,
    subject: 'Verify your Tandem email',
    html: `
      <p>Welcome to Tandem!</p>
      <p>Click the link below to verify your email address. This link expires in 24 hours.</p>
      <p><a href="${link}">Verify Email</a></p>
      <p>If you didn't create a Tandem account, you can ignore this email.</p>
    `,
  });
}

export async function sendPasswordResetEmail(to: string, token: string): Promise<void> {
  const client = getClient();
  const link = `${getFrontendUrl()}/reset-password?token=${encodeURIComponent(token)}`;

  await client.emails.send({
    from: getFromAddress(),
    to,
    subject: 'Reset your Tandem password',
    html: `
      <p>You requested a password reset for your Tandem account.</p>
      <p>Click the link below to reset your password. This link expires in 1 hour.</p>
      <p><a href="${link}">Reset Password</a></p>
      <p>If you didn't request a password reset, you can ignore this email.</p>
    `,
  });
}
