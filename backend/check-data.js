require('dotenv').config();
const mysql = require('mysql2/promise');

async function checkData() {
  try {
    const connection = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'liftelo'
    });

    console.log('✅ Connected to database:', process.env.DB_NAME || 'liftelo');
    console.log('');

    // Check users
    const [users] = await connection.query('SELECT id, username, role, full_name FROM users');
    console.log('👤 Users:', users.length);
    users.forEach(u => console.log(`   - ${u.username} (${u.role}) - ${u.full_name}`));
    console.log('');

    // Check locations
    const [locations] = await connection.query('SELECT id, name, address FROM locations');
    console.log('📍 Locations:', locations.length);
    locations.forEach(l => console.log(`   - ${l.name} - ${l.address}`));
    console.log('');

    // Check elevators
    const [elevators] = await connection.query('SELECT id, location_id, elevator_number FROM elevators');
    console.log('🛗 Elevators:', elevators.length);
    console.log('');

    // Check RMS records
    const [rms] = await connection.query('SELECT id, elevator_id, created_at FROM rms_records LIMIT 5');
    console.log('🛠 RMS Records:', rms.length);
    console.log('');

    // Check interventions
    const [interventions] = await connection.query('SELECT id, elevator_id, created_at FROM interventions LIMIT 5');
    console.log('🚨 Interventions:', interventions.length);

    await connection.end();
  } catch (err) {
    console.error('❌ Error:', err.message);
  }
}

checkData();
