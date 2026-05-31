import { Resend } from "resend";

/**
 * Resend client + a thin wrapper for sending transactional email from server code.
 *
 * NOTE: Supabase Auth magic-link / OTP emails are sent by Supabase itself
 * (not through this client) — point Supabase's SMTP settings at Resend to
 * route those through here too. This module is for app-side emails like
 * reminders, goal-change confirmations, or weekly summaries.
 */

let _resend: Resend | undefined;

function client(): Resend {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    throw new Error("RESEND_API_KEY is required (set in .env.local)");
  }
  if (!_resend) _resend = new Resend(key);
  return _resend;
}

export interface SendEmailInput {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  from?: string;
}

export async function sendEmail(input: SendEmailInput) {
  const from = input.from ?? process.env.RESEND_FROM_EMAIL ?? "onboarding@resend.dev";
  const { data, error } = await client().emails.send({
    from,
    to: input.to,
    subject: input.subject,
    html: input.html,
    text: input.text,
  });
  if (error) throw new Error(`Resend error: ${error.message}`);
  return data;
}
