require('dotenv').config();
const mysql = require('mysql2/promise');

async function checkTable() {
  try {
    const connection = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'liftelo'
    });

    console.log('✅ Connected to database\n');

    // Check rms_records table structure
    const [columns] = await connection.query('DESCRIBE rms_records');
    console.log('📋 rms_records table columns:');
    columns.forEach(col => {
      console.log(`  - ${col.Field} (${col.Type}) ${col.Null === 'YES' ? 'NULL' : 'NOT NULL'}`);
    });

    await connection.end();
  } catch (err) {
    console.error('❌ Error:', err.message);
  }
}

checkTable();
