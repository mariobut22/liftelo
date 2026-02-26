document.addEventListener('DOMContentLoaded', () => {
  initVehicles();
});

async function initVehicles() {
  const session = await fetchSession();
  const isAdmin = session?.user?.role === 'admin';
  if (session?.user?.role) {
    document.body.dataset.userRole = session.user.role;
  }
  if (!isAdmin) {
    alert('Samo administratori imaju pristup vozilima.');
    window.location.href = '/dashboard/home.html';
    return;
  }

  bindModalButtons();
  await loadVehicles();
}

function fetchSession() {
  return fetch('/api/users/session')
    .then(res => res.ok ? res.json() : null)
    .catch(() => null);
}

function bindModalButtons() {
  const addBtn = document.getElementById('addVehicleBtn');
  const emptyBtn = document.getElementById('vehiclesEmptyAdd');
  if (addBtn) addBtn.addEventListener('click', () => openVehicleModal());
  if (emptyBtn) emptyBtn.addEventListener('click', () => openVehicleModal());

  const form = document.getElementById('vehicleForm');
  if (form) {
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      await saveVehicle();
    });
  }
}

function openVehicleModal(vehicle = null) {
  const idField = document.getElementById('vehicleId');
  const nameField = document.getElementById('vehicleName');
  const yearField = document.getElementById('vehicleYear');
  const lastField = document.getElementById('vehicleLastRegistration');
  const expiryField = document.getElementById('vehicleExpiryDate');
  const imageField = document.getElementById('vehicleImage');
  const title = document.getElementById('vehicleModalTitle');

  if (vehicle) {
    idField.value = vehicle.id;
    nameField.value = vehicle.name || '';
    yearField.value = vehicle.year || '';
    lastField.value = formatDateInput(vehicle.last_registration_date);
    expiryField.value = formatDateInput(vehicle.registration_expiry_date);
    if (title) title.textContent = 'Uredi vozilo';
  } else {
    idField.value = '';
    nameField.value = '';
    yearField.value = '';
    lastField.value = '';
    expiryField.value = '';
    if (title) title.textContent = 'Dodaj vozilo';
  }

  if (imageField) imageField.value = '';
  if (typeof window.openModal === 'function') {
    window.openModal('vehicleModal');
  }
}

async function loadVehicles() {
  try {
    const res = await fetch('/api/vehicles');
    if (!res.ok) throw new Error('Greška pri dohvaćanju vozila');
    const vehicles = await res.json();
    renderVehicles(vehicles);
  } catch (err) {
    console.error(err);
    alert('Greška pri dohvaćanju vozila.');
  }
}

function renderVehicles(vehicles) {
  const list = document.getElementById('vehiclesList');
  const empty = document.getElementById('vehiclesEmpty');
  if (!list || !empty) return;

  list.innerHTML = '';
  if (!vehicles.length) {
    empty.classList.remove('d-none');
    return;
  }
  empty.classList.add('d-none');

  vehicles.forEach(vehicle => {
    const card = document.createElement('div');
    card.className = 'vehicle-card';
    const imgSrc = vehicle.image_path || '/logo.png';

    card.innerHTML = `
      <div class="vehicle-card-image">
        <img src="${imgSrc}" alt="${escapeHtml(vehicle.name)}" />
      </div>
      <div class="vehicle-card-body">
        <div>
          <h4>${escapeHtml(vehicle.name)}</h4>
          <p class="vehicle-meta">Godina: ${vehicle.year}</p>
          <p class="vehicle-meta">Zadnja registracija: ${formatDate(vehicle.last_registration_date)}</p>
          <p class="vehicle-meta">Registracija vrijedi do: ${formatDate(vehicle.registration_expiry_date)}</p>
        </div>
        <div class="vehicle-card-actions">
          <button class="tw-btn-secondary" data-action="edit">Uredi</button>
          <button class="tw-btn-secondary" data-action="delete">Obriši</button>
        </div>
      </div>
    `;

    card.querySelector('[data-action="edit"]').addEventListener('click', () => openVehicleModal(vehicle));
    card.querySelector('[data-action="delete"]').addEventListener('click', () => deleteVehicle(vehicle.id));

    list.appendChild(card);
  });
}

async function saveVehicle() {
  const id = document.getElementById('vehicleId').value;
  const name = document.getElementById('vehicleName').value.trim();
  const year = document.getElementById('vehicleYear').value;
  const lastRegistration = document.getElementById('vehicleLastRegistration').value;
  const expiryDate = document.getElementById('vehicleExpiryDate').value;
  const imageFile = document.getElementById('vehicleImage').files[0] || null;

  if (!name || !year || !lastRegistration || !expiryDate) {
    alert('Popuni sva obavezna polja.');
    return;
  }

  const lastDate = new Date(lastRegistration);
  const expiry = new Date(expiryDate);
  if (Number.isNaN(lastDate.getTime()) || Number.isNaN(expiry.getTime())) {
    alert('Neispravni datumi registracije.');
    return;
  }
  if (expiry <= lastDate) {
    alert('Datum isteka registracije mora biti nakon datuma zadnje registracije.');
    return;
  }

  const formData = new FormData();
  formData.append('name', name);
  formData.append('year', year);
  formData.append('last_registration_date', lastRegistration);
  formData.append('registration_expiry_date', expiryDate);
  if (imageFile) formData.append('image', imageFile);

  const url = id ? `/api/vehicles/${id}` : '/api/vehicles';
  const method = id ? 'PUT' : 'POST';

  try {
    const res = await fetch(url, { method, body: formData });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Greška pri spremanju vozila');
    }

    if (typeof window.closeModal === 'function') {
      window.closeModal('vehicleModal');
    }
    await loadVehicles();
  } catch (err) {
    console.error(err);
    alert(err.message || 'Greška pri spremanju vozila.');
  }
}

async function deleteVehicle(id) {
  if (!confirm('Obrisati vozilo?')) return;
  try {
    const res = await fetch(`/api/vehicles/${id}`, { method: 'DELETE' });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Greška pri brisanju vozila');
    }
    await loadVehicles();
  } catch (err) {
    console.error(err);
    alert(err.message || 'Greška pri brisanju vozila.');
  }
}

function formatDate(value) {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('hr-HR');
}

function formatDateInput(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
}

function escapeHtml(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
