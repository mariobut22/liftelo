const https = require('https');
const url = require('url');

// Slack webhook URLs
const WEBHOOKS = {
  RMS: 'https://hooks.slack.com/services/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',
  INTERVENTION: 'https://hooks.slack.com/services/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',
  OPS: 'https://hooks.slack.com/services/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'
};

/**
 * Pošalji poruku na Slack webhook
 * @param {string} webhookUrl - URL Slack webhooka
 * @param {object} message - Slack message objekt
 */
function sendSlackMessage(webhookUrl, message) {
  return new Promise((resolve, reject) => {
    const parsedUrl = url.parse(webhookUrl);
    const payload = JSON.stringify(message);

    const options = {
      hostname: parsedUrl.hostname,
      port: 443,
      path: parsedUrl.path,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      }
    };

    const req = https.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        if (res.statusCode === 200) {
          resolve({ success: true, response: data });
        } else {
          reject(new Error(`Slack API error: ${res.statusCode} - ${data}`));
        }
      });
    });

    req.on('error', (err) => {
      reject(err);
    });

    req.write(payload);
    req.end();
  });
}

/**
 * Pošalji notifikaciju o novom RMS zapisu
 */
async function notifyNewRMS(rmsData) {
  const message = {
    text: '🛠️ *Novi RMS zapis kreiran*',
    blocks: [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: '🛠️ Novi RMS zapis',
          emoji: true
        }
      },
      {
        type: 'section',
        fields: [
          {
            type: 'mrkdwn',
            text: `*Serviser:*\n${rmsData.technician || 'N/A'}`
          },
          {
            type: 'mrkdwn',
            text: `*Lokacija:*\n${rmsData.location_name || 'N/A'}`
          },
          {
            type: 'mrkdwn',
            text: `*Datum:*\n${rmsData.date || 'N/A'}`
          },
          {
            type: 'mrkdwn',
            text: `*Status:*\n${rmsData.status || 'N/A'}`
          }
        ]
      }
    ]
  };

  if (rmsData.second_technician) {
    message.blocks[1].fields.push({
      type: 'mrkdwn',
      text: `*Drugi serviser:*\n${rmsData.second_technician}`
    });
  }

  if (rmsData.notes) {
    message.blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Napomene:*\n${rmsData.notes}`
      }
    });
  }

  try {
    await sendSlackMessage(WEBHOOKS.RMS, message);
    console.log('✅ Slack notifikacija poslana za RMS');
  } catch (err) {
    console.error('❌ Greška pri slanju Slack notifikacije:', err.message);
  }
}

/**
 * Pošalji notifikaciju o novoj intervenciji
 */
async function notifyNewIntervention(interventionData) {
  const message = {
    text: '🚨 *Nova intervencija kreirana*',
    blocks: [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: '🚨 Nova intervencija',
          emoji: true
        }
      },
      {
        type: 'section',
        fields: [
          {
            type: 'mrkdwn',
            text: `*Serviser:*\n${interventionData.technician || 'N/A'}`
          },
          {
            type: 'mrkdwn',
            text: `*Lokacija:*\n${interventionData.location || 'N/A'}`
          },
          {
            type: 'mrkdwn',
            text: `*Datum:*\n${interventionData.date || 'N/A'}`
          },
          {
            type: 'mrkdwn',
            text: `*Status:*\n${interventionData.status || 'NIJE RIJEŠENO'}`
          }
        ]
      }
    ]
  };

  if (interventionData.second_technician) {
    message.blocks[1].fields.push({
      type: 'mrkdwn',
      text: `*Drugi serviser:*\n${interventionData.second_technician}`
    });
  }

  if (interventionData.notes) {
    message.blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Opis:*\n${interventionData.notes}`
      }
    });
  }

  try {
    await sendSlackMessage(WEBHOOKS.INTERVENTION, message);
    console.log('✅ Slack notifikacija poslana za intervenciju');
  } catch (err) {
    console.error('❌ Greška pri slanju Slack notifikacije:', err.message);
  }
}

/**
 * Pošalji dnevnu statistiku
 */
async function sendDailyStats(stats) {
  const message = {
    text: '📊 *Dnevna statistika*',
    blocks: [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: '📊 Dnevna statistika',
          emoji: true
        }
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Datum:* ${new Date().toLocaleDateString('hr-HR')}`
        }
      },
      {
        type: 'section',
        fields: [
          {
            type: 'mrkdwn',
            text: `*🛠️ RMS zapisi:*\n${stats.rms_count || 0}`
          },
          {
            type: 'mrkdwn',
            text: `*🚨 Intervencije:*\n${stats.intervention_count || 0}`
          }
        ]
      },
      {
        type: 'divider'
      },
      {
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: `Ukupno danas: *${(stats.rms_count || 0) + (stats.intervention_count || 0)}* zapisa`
          }
        ]
      }
    ]
  };

  try {
    await sendSlackMessage(WEBHOOKS.OPS, message);
    console.log('✅ Dnevna statistika poslana na Slack');
  } catch (err) {
    console.error('❌ Greška pri slanju dnevne statistike:', err.message);
  }
}

module.exports = {
  notifyNewRMS,
  notifyNewIntervention,
  sendDailyStats,
  WEBHOOKS
};
