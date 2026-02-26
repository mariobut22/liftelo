const https = require('https');

const GOOGLE_MAPS_API_KEY = 'AIzaSyC_bv1yYLg0ZZqby-XRWC9vOFQ_bQX-elw';

/**
 * Geocode adresu u latitude/longitude koristeći Google Maps API
 * @param {string} address - Adresa za geocoding
 * @returns {Promise<{lat: number, lng: number}>}
 */
function geocodeAddress(address) {
  return new Promise((resolve, reject) => {
    const encodedAddress = encodeURIComponent(address);
    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodedAddress}&key=${GOOGLE_MAPS_API_KEY}`;

    https.get(url, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          
          if (parsed.status === 'OK' && parsed.results.length > 0) {
            const location = parsed.results[0].geometry.location;
            resolve({
              lat: location.lat,
              lng: location.lng,
              formatted_address: parsed.results[0].formatted_address
            });
          } else {
            reject(new Error(`Geocoding failed: ${parsed.status}`));
          }
        } catch (err) {
          reject(err);
        }
      });
    }).on('error', (err) => {
      reject(err);
    });
  });
}

module.exports = { geocodeAddress, GOOGLE_MAPS_API_KEY };
