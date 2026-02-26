/**
 * Generiraj inicijale iz adrese/naziva lokacije
 * Npr. "Nike Katunara 4" -> "Nk4"
 */
function generateInitials(locationName) {
  if (!locationName) return 'XXX';
  
  const words = locationName.split(' ');
  let initials = '';
  
  words.forEach(word => {
    if (/^\d+$/.test(word)) {
      // Ako je riječ broj, dodaj ga
      initials += word;
    } else if (word.length > 0) {
      // Inače dodaj prvo slovo (uppercase)
      initials += word[0].toUpperCase();
    }
  });
  
  return initials || 'XXX';
}

/**
 * Generiraj naziv RMS dokumenta
 * Format: Nk4-RMS-01/26-11.01.2026-xxxx
 */
function generateRMSDocumentName(locationName, date, rmsPeriod) {
  const initials = generateInitials(locationName);
  
  // Format datuma: DD.MM.YYYY
  const dateObj = new Date(date);
  const day = String(dateObj.getDate()).padStart(2, '0');
  const month = String(dateObj.getMonth() + 1).padStart(2, '0');
  const year = dateObj.getFullYear();
  const formattedDate = `${day}.${month}.${year}`;
  
  // Random 4-znamenkasti broj
  const randomNumber = Math.floor(1000 + Math.random() + 9000);
  
  // Period s "/" za prikaz
  const period = rmsPeriod || 'XX/XX';
  
  return `${initials}-RMS-${period}-${formattedDate}-${randomNumber}`;
}

/**
 * Generiraj naziv Intervencije dokumenta
 * Format: Nk4-INTERVENCIJA-11.01.2026-xxxx
 */
function generateInterventionDocumentName(locationName, date) {
  const initials = generateInitials(locationName);
  
  // Format datuma: DD.MM.YYYY
  const dateObj = new Date(date);
  const day = String(dateObj.getDate()).padStart(2, '0');
  const month = String(dateObj.getMonth() + 1).padStart(2, '0');
  const year = dateObj.getFullYear();
  const formattedDate = `${day}.${month}.${year}`;
  
  // Random 4-znamenkasti broj
  const randomNumber = Math.floor(1000 + Math.random() * 9000);
  
  return `${initials}-INTERVENCIJA-${formattedDate}-${randomNumber}`;
}

/**
 * Pretvori naziv dokumenta u naziv datoteke (zamijeni nedozvoljene znakove)
 */
function documentNameToFilename(documentName) {
  return documentName
    .replace(/\//g, '-')  // Zamijeni / s -
    .replace(/[šŠ]/g, 's')
    .replace(/[čČćĆ]/g, 'c')
    .replace(/[đĐ]/g, 'd')
    .replace(/[žŽ]/g, 'z')
    + '.pdf';
}

module.exports = {
  generateRMSDocumentName,
  generateInterventionDocumentName,
  documentNameToFilename,
  generateInitials
};
