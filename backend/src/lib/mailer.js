/**
 * mailer — sends the email verification code.
 *
 * EMAIL_PROVIDER picks the transport:
 *
 *   console  (default) Write the mail to the server log. Needs no account,
 *            no API key and no network, so the whole verification flow can
 *            be built, tested and demoed offline — the route also echoes
 *            the code back to the client when this provider is active in
 *            non-production (see routes/emailVerification.js).
 *
 *   sendgrid HTTP API v3. Needs SENDGRID_API_KEY and EMAIL_FROM. Single
 *            Sender Verification in SendGrid is enough — no custom domain
 *            required, so an address you already own can mail any user.
 *
 *   resend   HTTP API. Needs RESEND_API_KEY and EMAIL_FROM, and (unlike
 *            SendGrid's single sender) a domain verified in Resend before
 *            it will deliver to arbitrary recipients.
 *
 *   mailersend HTTP API. Needs MAILERSEND_API_KEY, and EMAIL_FROM must be
 *            on a domain verified in MailerSend — its trial domain counts
 *            while testing.
 *
 * All HTTP providers are plain fetch calls on purpose: Node 22 has fetch
 * built in, so switching from console to a real inbox costs one environment
 * variable and no npm dependency to add, patch or deploy.
 */

/** Which transport is active — 'console', 'sendgrid' or 'resend'. */
export function getEmailProvider() {
  return (process.env.EMAIL_PROVIDER || 'console').trim().toLowerCase();
}

export function isConsoleProvider() {
  return getEmailProvider() === 'console';
}

const SEND_TIMEOUT_MS = 10_000;
const DEFAULT_FROM = 'NovaStack-F1 <no-reply@localhost>';

function fromAddress() {
  return (process.env.EMAIL_FROM || DEFAULT_FROM).trim();
}

/** "NovaStack-F1 <no-reply@x.com>" -> { name, email }. */
function parseFrom(raw) {
  const match = raw.match(/^\s*(.*?)\s*<([^>]+)>\s*$/);
  if (!match) return { name: undefined, email: raw.trim() };
  return { name: match[1] || undefined, email: match[2].trim() };
}

function subjectFor(code) {
  return `${code} is your NovaStack-F1 verification code`;
}

function bodyFor({ code, expiresInMinutes }) {
  return [
    'Welcome to NovaStack-F1.',
    '',
    `Your email verification code is: ${code}`,
    '',
    `The code expires in ${expiresInMinutes} minutes. Enter it to finish setting up your account.`,
    'If you did not create this account you can ignore this email.',
  ].join('\n');
}

async function post(url, { headers, body }) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
  });
  if (!res.ok) {
    // Include the provider's own message — a 401 from a bad API key and a
    // 403 from an unverified sender look identical otherwise.
    const detail = await res.text().catch(() => '');
    throw new Error(`Mail provider responded ${res.status}: ${detail.slice(0, 300)}`);
  }
}

async function sendViaSendgrid({ to, subject, text }) {
  const key = process.env.SENDGRID_API_KEY;
  if (!key) throw new Error('EMAIL_PROVIDER=sendgrid requires SENDGRID_API_KEY.');
  const from = parseFrom(fromAddress());

  await post('https://api.sendgrid.com/v3/mail/send', {
    headers: { Authorization: `Bearer ${key}` },
    body: {
      personalizations: [{ to: [{ email: to }] }],
      from,
      subject,
      content: [{ type: 'text/plain', value: text }],
    },
  });
  return { provider: 'sendgrid', delivered: 'email' };
}

async function sendViaResend({ to, subject, text }) {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error('EMAIL_PROVIDER=resend requires RESEND_API_KEY.');

  await post('https://api.resend.com/emails', {
    headers: { Authorization: `Bearer ${key}` },
    body: { from: fromAddress(), to: [to], subject, text },
  });
  return { provider: 'resend', delivered: 'email' };
}

async function sendViaMailersend({ to, subject, text }) {
  const key = process.env.MAILERSEND_API_KEY;
  if (!key) throw new Error('EMAIL_PROVIDER=mailersend requires MAILERSEND_API_KEY.');
  // parseFrom's shape already matches MailerSend's `from` object; an
  // absent display name is dropped by JSON.stringify.
  const from = parseFrom(fromAddress());

  await post('https://api.mailersend.com/v1/email', {
    headers: { Authorization: `Bearer ${key}` },
    body: { from, to: [{ email: to }], subject, text },
  });
  return { provider: 'mailersend', delivered: 'email' };
}

/**
 * Send the verification code. Resolves with { provider, delivered } or
 * throws — the route turns a throw into a 502 so a mail outage reads as
 * "we couldn't send it", never as "your code was wrong".
 */
export async function sendVerificationEmail({ to, code, expiresInMinutes }) {
  const provider = getEmailProvider();
  const subject = subjectFor(code);
  const text = bodyFor({ code, expiresInMinutes });

  if (provider === 'console') {
    console.log(
      [
        '',
        '─────────────── ✉  EMAIL (console provider) ───────────────',
        `  To:      ${to}`,
        `  From:    ${fromAddress()}`,
        `  Subject: ${subject}`,
        '',
        ...text.split('\n').map((line) => `  ${line}`),
        '───────────────────────────────────────────────────────────',
        '',
      ].join('\n')
    );
    return { provider: 'console', delivered: 'log' };
  }

  if (provider === 'sendgrid') return sendViaSendgrid({ to, subject, text });
  if (provider === 'resend') return sendViaResend({ to, subject, text });
  if (provider === 'mailersend') return sendViaMailersend({ to, subject, text });

  throw new Error(`EMAIL_PROVIDER "${provider}" is not supported (use console, sendgrid, resend or mailersend).`);
}
