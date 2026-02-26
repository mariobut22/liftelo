// === GLOBALNI LOADER ===

// Prikaz spinnera
function showSpinner() {
  const spinner = document.getElementById('spinner');
  if (spinner) spinner.style.display = 'block';
}

// Sakrij spinner
function hideSpinner() {
  const spinner = document.getElementById('spinner');
  if (spinner) spinner.style.display = 'none';
}

// === AUTENTIKACIJA: Provjera sesije korisnika ===

fetch('/api/users/session', {
  credentials: 'include'
})
  .then(res => res.json())
  .then(data => {
    if (!data.loggedIn) {
      window.location.href = '/login';
    } else {
      hideSpinner(); // ako je logiran, sakrij spinner
    }
  })
  .catch(err => {
    console.error('Greška pri provjeri sesije:', err);
    window.location.href = '/login';
  });

// === HAMBURGER NAVIGACIJA ===

function toggleMenu() {
  const menu = document.getElementById('navMenu');
  if (menu) {
    menu.classList.toggle('open');
  }
}

// === GUMB "+" za dodavanje RMS ili Intervencije ===

document.addEventListener('DOMContentLoaded', () => {
  const fab = document.createElement('div');
  fab.className = 'fab';
  fab.innerHTML = '+';
  document.body.appendChild(fab);

  const options = document.createElement('div');
  options.className = 'fab-options';
  options.innerHTML = `
    <button onclick="window.location.href='/dashboard/rms-create.html'">➕ RMS</button>
    <button onclick="window.location.href='/dashboard/intervention-create.html'">➕ Intervencija</button>
  `;
  document.body.appendChild(options);

  fab.addEventListener('click', () => {
    options.classList.toggle('visible');
  });
});
