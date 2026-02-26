const initInterventionModal = () => {
  const modal = document.getElementById('interventionModal');
  if (!modal) return;
  const form = modal.querySelector('#interventionForm');
  if (!form) return;
  const technicianInput = modal.querySelector('#technician');
  const secondTechInput = modal.querySelector('#second_technician');
  const techniciansList = modal.querySelector('#techniciansList');
  const locationInput = modal.querySelector('#location');
  const locationSuggestions = modal.querySelector('#locationSuggestions');
  const locationsList = modal.querySelector('#interventionLocationsList');
  const interventionItemsList = modal.querySelector('#interventionItemsList');

  // Postavi današnji datum
  const dateInput = modal.querySelector('#date');
  if (dateInput && !dateInput.value) {
    dateInput.valueAsDate = new Date();
  }

  // Dohvati trenutno ulogiranog korisnika
  fetch('/api/users/session', { credentials: 'include' })
    .then(res => res.json())
    .then(data => {
      if (data.loggedIn && data.user) {
        technicianInput.value = data.user.full_name;
      } else {
        window.location.href = '/login';
      }
    });

  // Dohvati sve korisnike za datalist drugog servisera
  fetch('/api/users', { credentials: 'include' })
    .then(res => res.json())
    .then(users => {
      users.forEach(user => {
        const option = document.createElement('option');
        option.value = user.full_name;
        techniciansList.appendChild(option);
      });
    });

  // Dohvati sve lokacije za autocomplete
  let allLocations = [];
  fetch('/api/locations', { credentials: 'include' })
    .then(res => res.json())
    .then(locations => {
      allLocations = locations;
      if (locationsList) {
        locationsList.innerHTML = '';
        locations.forEach(loc => {
          const option = document.createElement('option');
          option.value = loc.name;
          locationsList.appendChild(option);
        });
      }
    })
    .catch(err => console.error('Greška pri dohvaćanju lokacija:', err));

  const renderInterventionItems = (elevators) => {
    if (!interventionItemsList) return;
    interventionItemsList.innerHTML = '';
    if (!Array.isArray(elevators) || elevators.length === 0) {
      interventionItemsList.innerHTML = '<div class="text-muted">Nema dizala za ovu lokaciju.</div>';
      return;
    }

    elevators.forEach(elevator => {
      const row = document.createElement('div');
      row.className = 'flex flex-wrap items-center gap-2 p-2 rounded-xl border border-slate-200 bg-white';
      row.dataset.label = elevator.label;
      row.innerHTML = `
        <span class="text-sm font-semibold text-slate-700">${elevator.label}</span>
        <select class="tw-input" data-field="status" style="max-width: 260px;">
          <option value="O.K." selected>O.K.</option>
          <option value="Potreban popravak - Dizalo u funkciji">Potreban popravak - Dizalo u funkciji</option>
          <option value="Potreban popravak - Dizalo nije u funkciji">Potreban popravak - Dizalo nije u funkciji</option>
        </select>
        <input type="text" class="tw-input" data-field="comment" placeholder="Komentar (opcionalno)" style="flex: 1; min-width: 220px;" />
      `;
      interventionItemsList.appendChild(row);
    });
  };

  const loadElevatorsForLocation = async (locationId) => {
    if (!interventionItemsList) return;
    interventionItemsList.innerHTML = '';
    try {
      const res = await fetch(`/api/locations/${locationId}/elevators`, { credentials: 'include' });
      const elevators = await res.json();
      renderInterventionItems(elevators);
    } catch (err) {
      console.error('Greška pri dohvaćanju dizala:', err);
    }
  };

  const resolveLocationId = () => {
    const selectedLocation = allLocations.find(loc => loc.name === locationInput.value.trim());
    return selectedLocation?.id || null;
  };

  // Autocomplete za lokacije
  locationInput.addEventListener('input', () => {
    const query = locationInput.value.trim().toLowerCase();
    locationSuggestions.innerHTML = '';

    if (!query) return;

    const filtered = allLocations.filter(loc =>
      loc.name.toLowerCase().includes(query) ||
      loc.address.toLowerCase().includes(query)
    );

    filtered.slice(0, 5).forEach(loc => {
      const li = document.createElement('li');
      li.className = 'list-group-item list-group-item-action';
      li.style.cursor = 'pointer';
      li.innerHTML = `<strong>${loc.name}</strong><br><small>${loc.address}</small>`;
      li.addEventListener('click', () => {
        locationInput.value = loc.name;
        locationSuggestions.innerHTML = '';
        const locationId = resolveLocationId();
        if (locationId) {
          loadElevatorsForLocation(locationId);
        }
      });
      locationSuggestions.appendChild(li);
    });
  });

  if (locationInput && interventionItemsList) {
    locationInput.addEventListener('blur', () => {
      const locationId = resolveLocationId();
      if (locationId) {
        loadElevatorsForLocation(locationId);
      }
    });
  }

  // Podnošenje forme
  if (form.dataset.bound === 'true') return;
  form.dataset.bound = 'true';

  form.addEventListener('submit', (e) => {
    e.preventDefault();

    const formData = new FormData(form);

    const selectedLocation = allLocations.find(loc => loc.name === locationInput.value.trim());
    if (!selectedLocation) {
      alert('❌ Lokacija nije pronađena. Molimo odaberite iz padajuće liste.');
      return;
    }

    const selectedElevators = Array.from(interventionItemsList?.querySelectorAll('[data-label]') || [])
      .map(row => ({
        elevator_label: row.dataset.label,
        status: row.querySelector('[data-field="status"]')?.value || 'O.K.',
        comment: row.querySelector('[data-field="comment"]')?.value?.trim() || ''
      }));

    const payload = {
      technician: technicianInput.value,
      second_technician: secondTechInput.value || null,
      date: formData.get('date'),
      location: selectedLocation.name, // <- OVDE je promjena
      notes: formData.get('notes') || '',
      status: formData.get('status') || 'O.K.',
      elevator_items: selectedElevators
    };

    const uploadData = new FormData();
    for (const file of formData.getAll('images')) {
      uploadData.append('images', file);
    }

    for (const [key, value] of Object.entries(payload)) {
      uploadData.append(key, key === 'elevator_items' ? JSON.stringify(value) : value);
    }

    fetch('/api/interventions', {
      method: 'POST',
      body: uploadData,
      credentials: 'include'
    })
      .then(async res => {
        const resData = await res.json();
        if (!res.ok) {
          throw new Error(resData.error || 'Greška prilikom slanja intervencije.');
        }
        return resData;
      })
      .then(() => {
        const successBanner = document.getElementById('interventionSuccessBanner');
        if (successBanner) {
          successBanner.classList.remove('d-none');
        }
        const modalEl = document.getElementById('interventionModal');
        if (modalEl) {
          if (window.bootstrap?.Modal) {
            const modal = window.bootstrap.Modal.getInstance(modalEl);
            if (modal) {
              modal.hide();
            }
          } else if (typeof closeModal === 'function') {
            closeModal('interventionModal');
          }
        }
        if (typeof showToast === 'function') {
          showToast('Intervencija je spremljena.', 'success');
        }
        form.reset();
        if (successBanner) {
          setTimeout(() => successBanner.classList.add('d-none'), 1500);
        }
        if (typeof loadInterventions === 'function') {
          loadInterventions();
        }
      })
      .catch(err => {
        console.error('❌ Error:', err);
        if (typeof showToast === 'function') {
          showToast('Greška pri dodavanju intervencije.', 'error');
        }
      });
  });
};

window.initInterventionModal = initInterventionModal;

document.addEventListener('DOMContentLoaded', initInterventionModal);
