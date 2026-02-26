const mysql = require('mysql2/promise');

async function checkDatabases() {
  try {
    // Connect without specifying a database
    const connection = await mysql.createConnection({
      host: 'localhost',
      user: 'root',
      password: ''
    });

    console.log('✅ Connected to MySQL\n');

    // List all databases
    const [databases] = await connection.query('SHOW DATABASES');
    console.log('📋 Available databases:');
    databases.forEach(db => {
      console.log(`  - ${db.Database}`);
    });

    // Check for liftelo-related databases
    console.log('\n🔍 Checking for liftelo-related databases...');
    const lifteloDbs = databases.filter(db => 
      db.Database.toLowerCase().includes('liftelo')
    );

    if (lifteloDbs.length > 0) {
      console.log('\n✅ Found liftelo databases:');
      for (const db of lifteloDbs) {
        console.log(`\n📦 Database: ${db.Database}`);
        
        // Check if it has a users table
        await connection.query(`USE ${db.Database}`);
        const [tables] = await connection.query('SHOW TABLES');
        console.log(`   Tables: ${tables.map(t => Object.values(t)[0]).join(', ')}`);
        
        // Check if users table exists
        const hasUsers = tables.some(t => Object.values(t)[0] === 'users');
        if (hasUsers) {
          const [users] = await connection.query('SELECT COUNT(*) as count FROM users');
          console.log(`   ✅ Has users table with ${users[0].count} users`);
        }
      }
    } else {
      console.log('❌ No liftelo-related databases found');
    }

    await connection.end();
  } catch (err) {
    console.error('❌ Error:', err.message);
  }
}

checkDatabases();
