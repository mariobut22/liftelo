let map;
let markers = [];
let locationsData = [];
let searchQuery = '';
let activityFilter = 'all';
let sortState = { key: null, direction: null };
let elevatorQuery = '';

const parseActivityDate = (value) => (value ? new Date(value) : null);

const applyFiltersAndSort = (data) => {
  const query = searchQuery.trim().toLowerCase();
  const elevatorTerm = elevatorQuery.trim().toLowerCase();
  let filtered = data.filter(location => {
    const name = (location.name || '').toLowerCase();
    const address = (location.address || '').toLowerCase();
    const matchesSearch = !query || name.includes(query) || address.includes(query);
    const matchesElevators = !elevatorTerm || (location.elevator_search || '').toLowerCase().includes(elevatorTerm);

    const activityDate = parseActivityDate(location.last_activity);
    if (activityFilter === 'none') {
      return matchesSearch && matchesElevators && !activityDate;
    }
    if (activityFilter === '7' || activityFilter === '30') {
      if (!activityDate) return false;
      const days = Number(activityFilter);
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - days);
      return matchesSearch && matchesElevators && activityDate >= cutoff;
    }
    return matchesSearch && matchesElevators;
  });

  if (sortState.key && sortState.direction) {
    const direction = sortState.direction === 'asc' ? 1 : -1;
    filtered = filtered.slice().sort((a, b) => {
      if (sortState.key === 'last_activity') {
        const aDate = parseActivityDate(a.last_activity);
        const bDate = parseActivityDate(b.last_activity);
        if (!aDate && !bDate) return 0;
        if (!aDate) return 1 * direction;
        if (!bDate) return -1 * direction;
        return (aDate - bDate) * direction;
      }

      const aValue = (a[sortState.key] || '').toString().toLowerCase();
      const bValue = (b[sortState.key] || '').toString().toLowerCase();
      if (aValue < bValue) return -1 * direction;
      if (aValue > bValue) return 1 * direction;
      return 0;
    });
  }

  return filtered;
};

const updateSortIndicators = () => {
  document.querySelectorAll('#locations-table th.sortable').forEach((header) => {
    const key = header.dataset.sort;
    let indicator = '';
    if (sortState.key === key) {
      indicator = sortState.direction === 'asc' ? ' ▲' : sortState.direction === 'desc' ? ' ▼' : '';
    }
    header.textContent = `${header.dataset.label || header.textContent.replace(/\s[▲▼]$/, '')}${indicator}`;
  });
};

const renderLocations = (data) => {
  const tableBody = document.querySelector('#locations-table tbody');
  const countEl = document.getElementById('locationsCount');
  const emptyState = document.getElementById('locationsEmptyState');
  const tableWrapper = document.getElementById('locationsTableWrapper');
  const mapWrapper = document.getElementById('locationsMapWrapper');
  if (!tableBody) return;

  const getStatusColor = (status) => {
    if (status === 'O.K.') return 'status-dot-ok';
    if (status === 'Potreban popravak - Dizalo u funkciji') return 'status-dot-warning';
    if (status === 'Potreban popravak - Dizalo nije u funkciji') return 'status-dot-danger';
    return 'status-dot-neutral';
  };

  const buildStatusDots = (statuses = []) => {
    if (!Array.isArray(statuses) || statuses.length === 0) {
      return '<span class="text-muted">—</span>';
    }

    return `
      <div class="flex flex-wrap gap-1" data-status-dots>
        ${statuses.map(item => {
          const label = item.elevator_label || 'Dizalo';
          const status = item.status || 'N/A';
          const color = getStatusColor(status);
          return `
            <button
              type="button"
              class="h-3 w-3 rounded-full ${color} status-dot"
              data-tooltip
              data-tooltip-label="${label}"
              data-tooltip-status="${status}"
              aria-label="${label}: ${status}"
            ></button>
          `;
        }).join('')}
      </div>
    `;
  };

  tableBody.innerHTML = '';
  data.forEach(location => {
    const row = document.createElement('tr');

    row.innerHTML = `
      <td>${location.name}</td>
      <td>${location.address}</td>
      <td>${buildStatusDots(location.elevator_statuses)}</td>
      <td>${location.last_activity ? new Date(location.last_activity).toLocaleDateString('hr-HR') : '—'}</td>
      <td>
        <a href="/dashboard/location-profile.html?id=${location.id}" class="btn btn-sm btn-outline-primary">Prikaži</a>
      </td>
    `;

    tableBody.appendChild(row);
  });

  if (countEl) {
    countEl.textContent = `${data.length} / ${locationsData.length}`;
  }

  if (locationsData.length === 0) {
    if (emptyState) emptyState.classList.remove('d-none');
    if (tableWrapper) tableWrapper.classList.add('d-none');
    if (mapWrapper) mapWrapper.classList.add('d-none');
  } else {
    if (emptyState) emptyState.classList.add('d-none');
    if (tableWrapper) tableWrapper.classList.remove('d-none');
    if (mapWrapper) mapWrapper.classList.remove('d-none');
  }

  if (map) {
    addMarkersToMap(data);
  }
};

// ✅ Popuni tablicu s lokacijama + zadnja aktivnost
function loadLocationsWithActivity() {
  fetch('/api/locations/with-last-activity', { credentials: 'include' })
    .then(res => res.json())
    .then(data => {
      locationsData = data;
      if (locationsData.length === 0) {
        renderLocations([]);
        return;
      }
      renderLocations(applyFiltersAndSort(data));
    })
    .catch(err => {
      console.error('Greška pri dohvaćanju lokacija s aktivnošću:', err);
    });
}

// Dodaj markere na mapu
function addMarkersToMap(locations) {
  // Očisti postojeće markere
  markers.forEach(marker => marker.setMap(null));
  markers = [];

  locations.forEach(location => {
    // Dodaj marker na mapu ako postoje koordinate
    if (location.latitude && location.longitude) {
      const marker = new google.maps.Marker({
        position: { lat: parseFloat(location.latitude), lng: parseFloat(location.longitude) },
        map: map,
        title: location.name,
        animation: google.maps.Animation.DROP
      });

      // Info window s detaljima
      const infoWindow = new google.maps.InfoWindow({
        content: `
          <div style="padding: 10px; max-width: 250px;">
            <h5 style="margin: 0 0 10px 0; color: #0066cc;">${location.name}</h5>
            <p style="margin: 5px 0;"><strong>Adresa:</strong> ${location.address}</p>
            <p style="margin: 5px 0;"><strong>Zadnji unos:</strong> ${location.last_activity ? new Date(location.last_activity).toLocaleDateString('hr-HR') : 'Nema'}</p>
            <a href="/dashboard/location-profile.html?id=${location.id}" class="btn btn-sm btn-primary" style="margin-top: 10px;">Otvori profil</a>
          </div>
        `
      });

      marker.addListener('click', () => {
        infoWindow.open(map, marker);
      });

      markers.push(marker);
    }
  });

  // Prilagodi zoom da prikazuje sve markere
  if (markers.length > 0) {
    const bounds = new google.maps.LatLngBounds();
    markers.forEach(marker => bounds.extend(marker.getPosition()));
    map.fitBounds(bounds);
  }
}

// Inicijaliziraj Google Maps (mora biti globalna funkcija)
function initMap() {
  // Centar mape na Rijeku, Hrvatska
  map = new google.maps.Map(document.getElementById('map'), {
    center: { lat: 45.3271, lng: 14.4422 },
    zoom: 12,
    mapTypeControl: true,
    streetViewControl: true,
    fullscreenControl: true
  });

  // Učitaj lokacije nakon što je mapa spremna
  loadLocationsWithActivity();
}

// Učitaj lokacije odmah ako mapa još nije spremna
document.addEventListener('DOMContentLoaded', () => {
  const bindLocationModal = () => {
    const openAddBtn = document.getElementById('openAddLocation');
    const locationForm = document.getElementById('locationCreateForm');

    if (openAddBtn && !openAddBtn.dataset.bound) {
      openAddBtn.dataset.bound = 'true';
      openAddBtn.addEventListener('click', () => {
        if (typeof window.openModal === 'function') {
          window.openModal('locationModal');
        }
      });
    }

    if (locationForm && !locationForm.dataset.bound) {
      locationForm.dataset.bound = 'true';
      locationForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        const formData = new FormData(locationForm);
        const payload = {
          name: formData.get('name')?.toString().trim(),
          address: formData.get('address')?.toString().trim(),
          contact_person: formData.get('contact_person')?.toString().trim() || null,
          contact_phone: formData.get('contact_phone')?.toString().trim() || null
        };

        try {
          const res = await fetch('/api/locations', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });

          if (!res.ok) {
            const err = await res.json();
            throw new Error(err.error || 'Greška pri spremanju lokacije');
          }

          locationForm.reset();
          if (typeof window.closeModal === 'function') {
            window.closeModal('locationModal');
          }
          loadLocationsWithActivity();
        } catch (err) {
          console.error('Greška pri spremanju lokacije:', err);
        }
      });
    }
  };

  bindLocationModal();
  setTimeout(bindLocationModal, 0);

  const searchInput = document.getElementById('locationsSearch');
  const elevatorInput = document.getElementById('elevatorSearch');
  const filterSelect = document.getElementById('activityFilter');
  const sortableHeaders = document.querySelectorAll('#locations-table th.sortable');
  let activeTooltip = null;

  const removeTooltip = () => {
    if (activeTooltip) {
      activeTooltip.remove();
      activeTooltip = null;
    }
  };

  const showTooltip = (target) => {
    const label = target.getAttribute('data-tooltip-label');
    const status = target.getAttribute('data-tooltip-status');
    if (!label || !status) return;

    removeTooltip();
    const tooltip = document.createElement('div');
    tooltip.className = 'status-tooltip';
    tooltip.innerHTML = `
      <div class="status-tooltip-title">${label}</div>
      <div>${status}</div>
    `;
    document.body.appendChild(tooltip);

    const rect = target.getBoundingClientRect();
    const tooltipRect = tooltip.getBoundingClientRect();
    const top = rect.top + window.scrollY - tooltipRect.height - 8;
    const left = rect.left + window.scrollX + rect.width / 2 - tooltipRect.width / 2;

    tooltip.style.top = `${Math.max(top, window.scrollY + 8)}px`;
    tooltip.style.left = `${Math.max(left, 8)}px`;

    activeTooltip = tooltip;
  };

  if (searchInput) {
    let debounce;
    searchInput.addEventListener('input', (event) => {
      clearTimeout(debounce);
      debounce = setTimeout(() => {
        searchQuery = event.target.value || '';
        renderLocations(applyFiltersAndSort(locationsData));
      }, 250);
    });
  }

  if (elevatorInput) {
    let debounce;
    elevatorInput.addEventListener('input', (event) => {
      clearTimeout(debounce);
      debounce = setTimeout(() => {
        elevatorQuery = event.target.value || '';
        renderLocations(applyFiltersAndSort(locationsData));
      }, 250);
    });
  }

  document.addEventListener('mouseover', (event) => {
    const target = event.target.closest('[data-tooltip]');
    if (!target) return;
    if (window.matchMedia('(hover: hover)').matches) {
      showTooltip(target);
    }
  });

  document.addEventListener('mouseout', (event) => {
    const target = event.target.closest('[data-tooltip]');
    if (!target) return;
    if (window.matchMedia('(hover: hover)').matches) {
      removeTooltip();
    }
  });

  document.addEventListener('click', (event) => {
    const target = event.target.closest('[data-tooltip]');
    if (target) {
      event.preventDefault();
      showTooltip(target);
      return;
    }
    removeTooltip();
  });

  document.addEventListener('scroll', removeTooltip, { passive: true });

  if (filterSelect) {
    filterSelect.addEventListener('change', (event) => {
      activityFilter = event.target.value;
      renderLocations(applyFiltersAndSort(locationsData));
    });
  }

  sortableHeaders.forEach(header => {
    header.dataset.label = header.textContent.trim();
    header.addEventListener('click', () => {
      const key = header.dataset.sort;
      if (sortState.key !== key) {
        sortState = { key, direction: 'asc' };
      } else if (sortState.direction === 'asc') {
        sortState.direction = 'desc';
      } else if (sortState.direction === 'desc') {
        sortState.direction = null;
        sortState.key = null;
      } else {
        sortState.direction = 'asc';
      }
      updateSortIndicators();
      renderLocations(applyFiltersAndSort(locationsData));
    });
  });

  // Ako Google Maps još nije učitan, učitaj samo tablicu
  if (typeof google === 'undefined') {
    loadLocationsWithActivity();
  }
  
  const form = document.querySelector('#addLocationForm');

  // ✅ Ako postoji forma — omogući dodavanje nove lokacije
  if (form) {
    form.addEventListener('submit', (e) => {
      e.preventDefault();

      const name = form.name.value.trim();
      const address = form.address.value.trim();
      const contact_person = form.contact_person?.value.trim();
      const contact_phone = form.contact_phone?.value.trim();

      if (!name || !address) {
        alert('Naziv i adresa su obavezni!');
        return;
      }

      fetch('/api/locations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, address, contact_person, contact_phone })
      })
        .then(res => {
          if (!res.ok) throw new Error('Greška pri dodavanju');
          return res.json();
        })
        .then(data => {
          alert('Lokacija dodana!');
          window.location.href = '/dashboard/locations.html';
        })
        .catch(err => {
          console.error('Greška:', err);
          alert('Greška pri dodavanju lokacije.');
        });
    });
  }
});

// Eksportiraj initMap globalno za Google Maps callback
window.initMap = initMap;
