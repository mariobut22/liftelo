const os = require('os');
const { sendMail } = require('./mailer');
const {
  claimPendingEmails,
  markEmailSent,
  markEmailFailed
} = require('./email-outbox');

let workerStarted = false;
let lastSummaryAt = 0;

function startEmailWorker() {
  if (workerStarted) return;
  workerStarted = true;

  const workerId = `${os.hostname()}-${process.pid}`;

  setInterval(async () => {
    try {
      const rows = await claimPendingEmails({ workerId, limit: 20 });
      if (!rows.length) {
        return;
      }

      let sentCount = 0;
      let failCount = 0;

      for (const row of rows) {
        try {
          await sendMail({
            to: row.to_email,
            subject: row.subject,
            html: row.html,
            text: row.text || undefined
          });
          await markEmailSent(row.id);
          sentCount += 1;
        } catch (err) {
          const message = err?.message || 'Send failed';
          await markEmailFailed(row.id, message, row.attempts + 1);
          failCount += 1;
        }
      }

      const now = Date.now();
      if (now - lastSummaryAt > 5 * 60 * 1000) {
        lastSummaryAt = now;
        console.log(`[email-worker] sent=${sentCount} failed=${failCount}`);
      }
    } catch (err) {
      console.error('[email-worker] error:', err);
      if (err?.code === 'ER_NO_SUCH_TABLE') {
        console.warn('[email-worker] email_outbox missing; worker will retry after next interval.');
      }
    }
  }, 10000);
}

module.exports = { startEmailWorker };
