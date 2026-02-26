const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');
const ejs = require('ejs');
const { randomInt } = require('crypto');

function generateInitials(address) {
  return address
    .split(' ')
    .map(word => word[0].toLowerCase())
    .join('');
}

async function generateInterventionPDF(data, fullPath) {
  const {
    location,
    technician,
    second_technician,
    comment,
    date,
    imageUrls = []
  } = data;

  const datum = new Date(date);
  const dateStr = datum.toLocaleDateString('hr-HR');

  const html = await ejs.renderFile(
    path.join(__dirname, '..', 'templates', 'intervention-pdf.ejs'),
    {
      logoPath: '/logo.png',
      companyLogoPath: data.companyLogoPath || '',
      location,
      technician,
      second_technician,
      comment,
      date: dateStr,
      images: imageUrls
    }
  );

  const dir = path.dirname(fullPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: 'networkidle0' });

  await page.pdf({
    path: fullPath,
    format: 'A4',
    printBackground: true,
    margin: { top: '30px', bottom: '30px', left: '20px', right: '20px' }
  });

  await browser.close();
}

module.exports = generateInterventionPDF;
