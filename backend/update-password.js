const bcrypt = require('bcrypt');

async function generateHash() {
  const password = 'novaLozinka123';
  const hash = await bcrypt.hash(password, 10);
  console.log('Password:', password);
  console.log('Hash:', hash);
  console.log('\nRun this SQL command to update the admin password:');
  console.log(`UPDATE users SET password = '${hash}' WHERE username = 'admin';`);
}

generateHash();
