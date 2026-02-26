const initRmsModal = () => {
  const form = document.getElementById('rmsForm');
  if (!form) return;
  const mainTechField = document.getElementById('technician');
  const secondaryTechInput = document.getElementById('secondTechnician');
  const techniciansList = document.getElementById('techniciansList');
  const addressInput = document.getElementById('address');
  const rmsItemsList = document.getElementById('rmsItemsList');

  const dateInput = document.querySelector('#date');
  if (dateInput && !dateInput.value) {
    dateInput.valueAsDate = new Date();
  }

  // Dohvati trenutno ulogiranog korisnika
  fetch('/api/users/session', {
    credentials: 'include'
  })
    .then(res => res.json())
    .then(data => {
      console.log('Session data:', data);
      if (data.loggedIn) {
        mainTechField.value = data.user.full_name || data.user.username;
      }
    })
    .catch(err => console.error('Greška pri dohvaćanju sesije:', err));

  // Popuni datalist s korisnicima za drugog servisera
  fetch('/api/users', {
    credentials: 'include'
  })
    .then(res => res.json())
    .then(users => {
      console.log('Dohvaćeni korisnici:', users);
      users.forEach(user => {
        const option = document.createElement('option');
        option.value = user.full_name || user.username;
        techniciansList.appendChild(option);
      });
      console.log('Datalist popunjen s', users.length, 'korisnika');
    })
    .catch(err => console.error('Greška pri dohvaćanju korisnika:', err));

  // Autocomplete za adresu (lokacije)
  let allLocations = [];
  const locationsList = document.getElementById('locationsList');
  const locationSuggestions = document.getElementById('locationSuggestions');
  let selectedLocationId = null;
  
  fetch('/api/locations', {
    credentials: 'include'
  })
    .then(res => res.json())
    .then(data => {
      allLocations = data;
      
      // Popuni datalist
      data.forEach(loc => {
        const option = document.createElement('option');
        option.value = loc.address;
        locationsList.appendChild(option);
      });

      // Dodaj i dropdown sugestije
      addressInput.addEventListener('input', () => {
        const inputVal = addressInput.value.toLowerCase();
        locationSuggestions.innerHTML = '';
        
        if (!inputVal) return;
        
        const filtered = allLocations.filter(loc =>
          loc.address.toLowerCase().includes(inputVal) ||
          loc.name.toLowerCase().includes(inputVal)
        );

        filtered.slice(0, 5).forEach(loc => {
          const li = document.createElement('li');
          li.className = 'list-group-item list-group-item-action';
          li.style.cursor = 'pointer';
          li.innerHTML = `<strong>${loc.name}</strong><br><small>${loc.address}</small>`;
          li.addEventListener('click', () => {
            addressInput.value = loc.address;
            locationSuggestions.innerHTML = '';
            selectedLocationId = loc.id;
            triggerElevatorLoad();
          });
          locationSuggestions.appendChild(li);
        });
      });

      // Zatvori sugestije kada klikneš izvan
      document.addEventListener('click', (e) => {
        if (!addressInput.contains(e.target) && !locationSuggestions.contains(e.target)) {
          locationSuggestions.innerHTML = '';
        }
      });
    })
    .catch(err => console.error('Greška pri dohvaćanju lokacija:', err));

  const buildItemRow = (label) => {
    const wrapper = document.createElement('div');
    wrapper.className = 'flex flex-wrap items-center gap-2 p-2 rounded-xl border border-slate-200 bg-white';
    wrapper.dataset.label = label;
    wrapper.innerHTML = `
      <span class="text-sm font-semibold text-slate-700">${label}</span>
      <select class="tw-input" data-field="status" style="max-width: 260px;">
        <option value="O.K." selected>O.K.</option>
        <option value="Potreban popravak - Dizalo u funkciji">Potreban popravak - Dizalo u funkciji</option>
        <option value="Potreban popravak - Dizalo nije u funkciji">Potreban popravak - Dizalo nije u funkciji</option>
      </select>
      <input type="text" class="tw-input" data-field="comment" placeholder="Komentar (opcionalno)" style="flex: 1; min-width: 220px;" />
      <input type="hidden" data-field="label" value="${label}" />
    `;
    return wrapper;
  };

  const getVisitItems = () => {
    if (!rmsItemsList) return [];
    return Array.from(rmsItemsList.querySelectorAll('[data-label]')).map(row => {
      const status = row.querySelector('[data-field="status"]')?.value;
      const comment = row.querySelector('[data-field="comment"]')?.value?.trim() || '';
      return {
        elevator_label: row.dataset.label,
        status,
        comment
      };
    });
  };

  const loadElevatorsForLocation = async (locationId) => {
    if (!rmsItemsList) return;
    rmsItemsList.innerHTML = '';
    try {
      const res = await fetch(`/api/locations/${locationId}/elevators`, { credentials: 'include' });
      const elevators = await res.json();
      if (!Array.isArray(elevators) || elevators.length === 0) {
        rmsItemsList.innerHTML = '<div class="text-muted">Nema dizala za ovu lokaciju.</div>';
        return;
      }
      elevators.forEach(elevator => {
        rmsItemsList.appendChild(buildItemRow(elevator.label));
      });
    } catch (err) {
      console.error('Greška pri dohvaćanju dizala:', err);
    }
  };

  const resolveLocationId = () => {
    if (selectedLocationId) return selectedLocationId;
    const value = addressInput.value.trim().toLowerCase();
    const selectedLocation = allLocations.find(loc =>
      loc.address.toLowerCase() === value || loc.name.toLowerCase() === value
    );
    return selectedLocation?.id || null;
  };

  const triggerElevatorLoad = () => {
    const locationId = resolveLocationId();
    if (locationId) {
      loadElevatorsForLocation(locationId);
    }
  };

  if (addressInput && rmsItemsList) {
    addressInput.addEventListener('blur', triggerElevatorLoad);
    addressInput.addEventListener('change', triggerElevatorLoad);
  }

  // Submit forme
  if (form.dataset.bound === 'true') return;
  form.dataset.bound = 'true';

  form.addEventListener('submit', (e) => {
    e.preventDefault();

    const formData = new FormData(form);
    const visitItems = getVisitItems();
    const data = {
      technician: mainTechField.value,
      secondTechnician: secondaryTechInput.value || null,
      address: addressInput.value.trim(),
      date: formData.get('date'),
      rms_period: formData.get('rms_period') || '',
      notes: formData.get('notes'),
      status: formData.get('status'),
      checks: []
    };

    // Parsiranje podataka s checklist forme
    document.querySelectorAll('.check-row').forEach(row => {
      const label = row.dataset.label;
      const working = row.querySelector('input[type="radio"]:checked')?.value || '';
      const comment = row.querySelector('input[type="text"]').value.trim();
      data.checks.push({ label, working, comment });
    });

    // Dohvati location_id
    const selectedLocation = allLocations.find(loc => loc.address === data.address);
    if (!selectedLocation) {
      alert("❌ Lokacija nije pronađena.");
      return;
    }

    data.location_id = selectedLocation.id;

    const submitLegacyRms = () => {
      const uploadData = new FormData();
      uploadData.append('json', JSON.stringify(data));

      for (const file of formData.getAll('attachments')) {
        uploadData.append('attachments', file);
      }

      return fetch('/api/rms', {
        method: 'POST',
        body: uploadData,
        credentials: 'include'
      });
    };

    const attributedMonthRaw = formData.get('rms_attributed_month')?.trim() || '';
    const attributedMonthMatch = attributedMonthRaw.match(/^\s*(\d{2})\/(\d{4})\s*$/);
    const rmsMonth = attributedMonthMatch
      ? `${attributedMonthMatch[2]}-${attributedMonthMatch[1]}-01`
      : null;

    const visitPayload = {
      location_id: data.location_id,
      visit_date: data.date,
      rms_month: rmsMonth,
      notes_general: data.notes,
      items: visitItems
    };

    fetch('/api/rms-visits', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(visitPayload),
      credentials: 'include'
    })
      .then(async res => {
        if (res.ok) return res.json();
        const err = await res.json();
        throw new Error(err.error || 'Greška pri spremanju RMS posjeta');
      })
      .then((response) => {
        console.log('RMS VISIT saved:', response);
        const successBanner = document.getElementById('rmsSuccessBanner');
        if (successBanner) {
          successBanner.classList.remove('d-none');
        }
        const modalEl = document.getElementById('rmsModal');
        if (modalEl) {
          if (window.bootstrap?.Modal) {
            const modal = window.bootstrap.Modal.getInstance(modalEl);
            if (modal) {
              modal.hide();
            }
          } else if (typeof closeModal === 'function') {
            closeModal('rmsModal');
          }
        }
        if (typeof showToast === 'function') {
          showToast('RMS zapis je spremljen.', 'success');
        }
        form.reset();
        if (rmsItemsList) {
          rmsItemsList.innerHTML = '';
        }
        if (successBanner) {
          setTimeout(() => successBanner.classList.add('d-none'), 1500);
        }
        if (typeof loadRMS === 'function') {
          loadRMS();
        }
      })
      .catch(err => {
        console.error('Greška:', err);
        if (typeof showToast === 'function') {
          showToast('Greška prilikom slanja RMS zapisa.', 'error');
        }
      });
  });
};

window.initRmsModal = initRmsModal;

document.addEventListener('DOMContentLoaded', initRmsModal);
