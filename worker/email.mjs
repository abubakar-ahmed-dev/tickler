// Email alert delivery via Resend REST — best effort, never fails the workflow.
// Recipient: first (:Settings {email}) in the graph, else ALERT_EMAIL_TO env.
import { graph } from '../pipeline/graph-write.mjs';
import { RESEND_KEY, RESEND_FROM, APP_URL } from '../shared/config.mjs';

async function recipientEmail() {
  const g = await graph();
  const s = await g.query(`MATCH (st:Settings) RETURN st.email AS email LIMIT 1`);
  return s.data[0]?.email || process.env.ALERT_EMAIL_TO || '';
}

export async function alertEmailEnabled() {
  return Boolean(RESEND_KEY && (await recipientEmail()));
}

export async function saveSettings({ email }) {
  const g = await graph();
  await g.query(
    `MERGE (st:Settings {id:'global'}) SET st.email=$email RETURN st.email AS email`,
    { params: { email: String(email || '').trim() } });
  return { saved: true };
}

export async function getSettings() {
  const g = await graph();
  const s = await g.query(`MATCH (st:Settings) RETURN st.email AS email LIMIT 1`);
  return { email: s.data[0]?.email ?? '' };
}

/**
 * Send one alert email. Returns {sent, error?} — errors are logged, not thrown,
 * so a mail outage can't re-trigger Temporal retries of the reminder workflow.
 */
export async function sendAlertEmail({ leaseId, leaseTitle, deadlineType, deadlineDate, action, message, urgency }) {
  try {
    const to = await recipientEmail();
    if (!to || !RESEND_KEY) return { sent: false, error: 'no recipient or key' };
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${RESEND_KEY}` },
      body: JSON.stringify({
        from: RESEND_FROM,
        to,
        subject: `Tickler — ${urgency === 'urgent' ? 'URGENT: ' : ''}${deadlineType.replace(/_/g, ' ')} on ${deadlineDate} (${leaseTitle || leaseId})`,
        html: `
          <div style="font-family:ui-sans-serif,system-ui,sans-serif;max-width:560px;margin:0 auto;color:#e6edf3;background:#0f1317;padding:24px;border-radius:12px;border:1px solid #263039">
            <p style="margin:0 0 6px;font-size:12px;letter-spacing:.1em;text-transform:uppercase;color:#4cc38a"><b>Tickler reminder</b></p>
            <h2 style="margin:0 0 12px;font-size:18px">${deadlineType.replace(/_/g, ' ')} — ${deadlineDate}</h2>
            <p style="margin:0 0 8px">Lease: <b>${leaseTitle || leaseId}</b></p>
            <p style="margin:0 0 16px;line-height:1.6">${message}</p>
            <p style="margin:0 0 16px"><a href="${APP_URL}/app" style="color:#4cc38a">Open Tickler →</a></p>
            <p style="margin:0;font-size:11px;color:#8b98a5">Sent by Tickler — dates are computed from your approved lease details.</p>
          </div>`,
      }),
    });
    if (!res.ok) {
      const t = await res.text();
      console.error('email send failed:', res.status, t.slice(0, 150));
      return { sent: false, error: t.slice(0, 150) };
    }
    return { sent: true };
  } catch (e) {
    console.error('email send error:', e.message);
    return { sent: false, error: e.message };
  }
}
