const fs = require('fs');
const csv = require('csv-parser');
const fetch = require('node-fetch');
const mysql = require('mysql2/promise');

const GOOGLE_API_KEY = 'AIzaSyC_bv1yYLg0ZZqby-XRWC9vOFQ_bQX-elw-elw'; // 🔑 Zamijeni sa svojim ključem

const pool = mysql.createPool({
  host: 'localhost',
  user: 'liftelo_user',
  password: 'lozinka123', // 🔐 Zamijeni ako je drugačije
  database: 'liftelo',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

const failedAddresses = [];

function isLatLng(value) {
  const regex = /^-?\d+(\.\d+)?\s*,\s*-?\d+(\.\d+)?$/;
  return regex.test(value);
}

function autoAppendLocation(address) {
  if (isLatLng(address)) return address; // ostavi kako je
  if (address.includes(',')) return address; // već je "kompletna"
  return `${address}, Rijeka, Croatia`; // dodaj default
}

async function geocodeAddress(address) {
  const fullAddress = autoAppendLocation(address);

  if (isLatLng(fullAddress)) {
    const [lat, lng] = fullAddress.split(',').map(Number);
    return {
      formatted_address: `Koordinate: ${lat},${lng}`,
      lat,
      lng
    };
  }

  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(fullAddress)}&region=hr&key=${GOOGLE_API_KEY}`;
  const res = await fetch(url);
  const data = await res.json();

  if (data.status === 'OK') {
    const result = data.results[0];
    return {
      formatted_address: result.formatted_address,
      lat: result.geometry.location.lat,
      lng: result.geometry.location.lng
    };
  } else {
    console.warn(`⚠️ Adresa nije pronađena: ${address} → Status: ${data.status}`);
    failedAddresses.push(address);
    return null;
  }
}

(async () => {
  const locations = [];

  fs.createReadStream('locations.csv')
    .pipe(csv())
    .on('data', (row) => {
      locations.push(row);
    })
    .on('end', async () => {
      console.log(`🔍 Učitano ${locations.length} lokacija...`);

      for (const loc of locations) {
        const geo = await geocodeAddress(loc.address);

        if (geo) {
          try {
            await pool.query(
              `INSERT INTO locations (name, address, latitude, longitude) VALUES (?, ?, ?, ?)`,
              [loc.name, geo.formatted_address, geo.lat, geo.lng]
            );
            console.log(`✅ Unesena: ${loc.name} → ${geo.formatted_address}`);
          } catch (err) {
            console.error(`❌ Greška kod unosa "${loc.name}":`, err.message);
          }
        }
      }

      // Upis neuspjelih adresa u tekstualnu datoteku
      if (failedAddresses.length > 0) {
        fs.writeFileSync('not-found.txt', failedAddresses.join('\n'), 'utf8');
        console.log(`⚠️ Neuspjele adrese zapisane u not-found.txt (${failedAddresses.length} kom)`);
      }

      console.log('🎉 Gotovo!');
      process.exit();
    });
})();