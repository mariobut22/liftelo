const cron = require('node-cron');
const db = require('../db');
const { sendDailyStats } = require('./slack');

/**
 * Pokreni cron job za dnevnu statistiku
 * Izvršava se svaki dan u 18:00h
 */
function startDailyStatsCron() {
  // Cron format: minute hour day month weekday
  // '0 18 * * *' = svaki dan u 18:00
  cron.schedule('0 18 * * *', async () => {
    console.log('🕐 Pokrećem dnevnu statistiku...');
    
    try {
      const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
      
      // Dohvati broj RMS zapisa za danas
      const [rmsResult] = await db.query(
        'SELECT COUNT(*) as count FROM rms_visits WHERE DATE(visit_date) = ?',
        [today]
      );
      
      // Dohvati broj intervencija za danas
      const [interventionResult] = await db.query(
        'SELECT COUNT(*) as count FROM interventions WHERE DATE(created_at) = ?',
        [today]
      );
      
      const stats = {
        rms_count: rmsResult[0].count,
        intervention_count: interventionResult[0].count
      };
      
      console.log('📊 Dnevna statistika:', stats);
      
      // Pošalji na Slack
      await sendDailyStats(stats);
      
      console.log('✅ Dnevna statistika uspješno poslana na Slack');
    } catch (err) {
      console.error('❌ Greška pri slanju dnevne statistike:', err);
    }
  }, {
    timezone: 'Europe/Zagreb'
  });
  
  console.log('✅ Cron job za dnevnu statistiku pokrenut (svaki dan u 18:00h)');
}

module.exports = { startDailyStatsCron };
