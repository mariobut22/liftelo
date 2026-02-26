document.addEventListener('DOMContentLoaded', () => {
  const params = new URLSearchParams(window.location.search);
  const locationId = params.get('id');

  if (!locationId) {
    alert('Lokacija nije pronađena!');
    return;
  }

  let currentLocation = null;
  let currentUser = null;


  // Dohvati osnovne podatke o lokaciji
  function loadLocationInfo() {
    fetch(`/api/locations/${locationId}`)
      .then(res => res.json())
      .then(location => {
        currentLocation = location;
        document.getElementById('locationName').textContent = location.name;
        document.getElementById('locationAddress').textContent = location.address;
        document.getElementById('contactPerson').textContent = location.contact_person || '—';
        document.getElementById('contactPhone').textContent = location.contact_phone || '—';
        const frequencyLabel = location.rms_frequency === 3
          ? 'Svaka 3 mjeseca'
          : location.rms_frequency === 2
            ? 'Svaka 2 mjeseca'
            : 'Svaki mjesec';
        document.getElementById('locationRmsFrequency').textContent = frequencyLabel;
        document.getElementById('locationNotes').textContent = location.notes || '—';
        
        // Popuni edit formu
        document.getElementById('editName').value = location.name;
        document.getElementById('editAddress').value = location.address;
        document.getElementById('editContactPerson').value = location.contact_person || '';
        document.getElementById('editContactPhone').value = location.contact_phone || '';
        const rmsFrequencySelect = document.getElementById('editRmsFrequency');
        if (rmsFrequencySelect) {
          rmsFrequencySelect.value = String(location.rms_frequency || 1);
        }
        document.getElementById('editNotes').value = location.notes || '';
      })
      .catch(err => {
        console.error('Greška pri dohvaćanju lokacije:', err);
      });
  }

  const loadCurrentUser = () => {
    return fetch('/api/users/session', { credentials: 'include' })
      .then(res => res.json())
      .then(data => {
        if (data.loggedIn) {
          currentUser = data.user;
          const editButton = document.getElementById('editLocationBtn');
          const rmsFrequencyGroup = document.getElementById('rmsFrequencyGroup');
          if (currentUser.role !== 'admin') {
            if (editButton) editButton.classList.add('d-none');
            if (rmsFrequencyGroup) rmsFrequencyGroup.classList.add('d-none');
          } else {
            if (editButton) editButton.classList.remove('d-none');
            if (rmsFrequencyGroup) rmsFrequencyGroup.classList.remove('d-none');
          }
        }
      })
      .catch(err => {
        console.error('Greška pri dohvaćanju korisnika:', err);
      });
  };

  loadLocationInfo();
  loadCurrentUser();

  const getStatusBadge = (status) => {
    if (!status) return '<span class="text-muted">-</span>';
    if (status === 'O.K.') {
      return `<span class="tw-badge-ok">${status}</span>`;
    }
    if (status === 'Potreban popravak - Dizalo u funkciji') {
      return `<span class="tw-badge-warning">${status}</span>`;
    }
    if (status === 'Potreban popravak - Dizalo nije u funkciji') {
      return `<span class="tw-badge-danger">${status}</span>`;
    }
    return `<span class="tw-badge-warning">${status}</span>`;
  };

  // Active status card
  fetch(`/api/locations/${locationId}/active-status`)
    .then(res => res.json())
    .then(data => {
      const badge = document.getElementById('activeStatusBadge');
      const meta = document.getElementById('activeStatusMeta');
      if (badge) {
        badge.innerHTML = getStatusBadge(data.status);
      }
      if (meta) {
        const dateLabel = data.updatedAt ? new Date(data.updatedAt).toLocaleString('hr-HR') : '—';
        const sourceLabel = data.source ? `(${data.source})` : '';
        meta.textContent = `${dateLabel} ${sourceLabel}`.trim();
      }
    })
    .catch(err => {
      console.error('Greška pri dohvaćanju aktivnog statusa:', err);
      const meta = document.getElementById('activeStatusMeta');
      if (meta) meta.textContent = 'Greška pri dohvaćanju statusa.';
    });

  const updateActiveStatusBadge = (status, source, updatedAt) => {
    const badge = document.getElementById('activeStatusBadge');
    const meta = document.getElementById('activeStatusMeta');
    if (badge) {
      badge.innerHTML = getStatusBadge(status);
    }
    if (meta) {
      const dateLabel = updatedAt ? new Date(updatedAt).toLocaleString('hr-HR') : '—';
      const sourceLabel = source ? `(${source})` : '';
      meta.textContent = `${dateLabel} ${sourceLabel}`.trim();
    }
  };

  const getWorstStatus = (items) => {
    if (!items || !items.length) return 'O.K.';
    const hasCritical = items.some(item => item.status === 'Potreban popravak - Dizalo nije u funkciji');
    if (hasCritical) return 'Potreban popravak - Dizalo nije u funkciji';
    const hasWarning = items.some(item => item.status === 'Potreban popravak - Dizalo u funkciji');
    if (hasWarning) return 'Potreban popravak - Dizalo u funkciji';
    return 'O.K.';
  };

  fetch(`/api/locations/${locationId}/rms-visits/latest`)
    .then(res => res.json())
    .then(data => {
      const list = document.getElementById('rmsVisitItems');
      if (!list) return;
      list.innerHTML = '';

      if (!data) {
        list.innerHTML = '<li class="list-group-item">Nema RMS posjeta.</li>';
        return;
      }

      const items = data.items || [];
      if (!items.length) {
        list.innerHTML = '<li class="list-group-item">Nema stavki za dizala.</li>';
      } else {
        items.forEach(item => {
          const li = document.createElement('li');
          li.className = 'list-group-item d-flex justify-content-between align-items-center';
          li.innerHTML = `
            <div>
              <strong>${item.elevator_label}</strong>
              ${item.comment ? `<br><small class="text-muted">${item.comment}</small>` : ''}
            </div>
            ${getStatusBadge(item.status)}
          `;
          list.appendChild(li);
        });
      }

      const worst = getWorstStatus(items);
      updateActiveStatusBadge(worst, 'rms_visit', data.created_at || null);
    })
    .catch(err => {
      console.error('Greška pri dohvaćanju zadnjeg RMS posjeta:', err);
    });

  const renderMonthlyRmsTable = (visits) => {
    const tbody = document.querySelector('#rmsMonthlyTable tbody');
    if (!tbody) return;

    const now = new Date();
    const months = [];
    for (let i = 0; i < 12; i += 1) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push({
        year: date.getFullYear(),
        month: date.getMonth() + 1
      });
    }

    const visitLookup = new Map();
    visits.forEach(visit => {
      const effectiveDateValue = visit.rms_month || visit.visit_date;
      const effectiveDate = new Date(effectiveDateValue);
      if (Number.isNaN(effectiveDate.getTime())) return;
      const key = `${effectiveDate.getFullYear()}-${effectiveDate.getMonth() + 1}`;
      const existing = visitLookup.get(key);
      if (!existing || new Date(existing.visit_date) < new Date(visit.visit_date)) {
        visitLookup.set(key, visit);
      }
    });

    const formatMonth = (year, month) => {
      const monthLabel = String(month).padStart(2, '0');
      return `${monthLabel}/${year}`;
    };

    const formatDate = (dateStr) => {
      if (!dateStr) return '—';
      const parsed = new Date(dateStr);
      if (Number.isNaN(parsed.getTime())) return '—';
      return parsed.toLocaleDateString('hr-HR');
    };

    const getDisplayDate = (visit) => {
      if (!visit) return null;
      return visit.rms_month || visit.visit_date || null;
    };

    const getNextMonthKey = (year, month) => {
      if (month === 12) {
        return `${year + 1}-1`;
      }
      return `${year}-${month + 1}`;
    };

    const getMonthlyStatusBadge = (status) => {
      if (status === 'done') {
        return '<span class="tw-badge-ok">Odrađen</span>';
      }
      if (status === 'late') {
        return '<span class="tw-badge-warning">Zakašnjelo</span>';
      }
      if (status === 'na') {
        return '<span class="tw-badge-na">N/A</span>';
      }
      return '<span class="tw-badge-danger">Nedostaje</span>';
    };

    tbody.innerHTML = '';

    months.forEach(({ year, month }) => {
      const expected = window.isRmsExpected?.(currentLocation, year, month) ?? true;
      const key = `${year}-${month}`;
      const visit = visitLookup.get(key);
      const nextKey = getNextMonthKey(year, month);
      const nextVisit = visitLookup.get(nextKey);
      const status = expected
        ? (visit ? 'done' : (nextVisit ? 'late' : 'missing'))
        : 'na';
      const displayDate = status === 'na' ? null : (getDisplayDate(visit) || getDisplayDate(nextVisit));

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${formatMonth(year, month)}</td>
        <td>${getMonthlyStatusBadge(status)}</td>
        <td>${displayDate ? formatDate(displayDate) : '—'}</td>
      `;
      tbody.appendChild(tr);
    });
  };

  fetch(`/api/locations/${locationId}/rms-visits`) 
    .then(res => res.json())
    .then(visits => {
      if (!Array.isArray(visits)) {
        renderMonthlyRmsTable([]);
        return;
      }
      renderMonthlyRmsTable(visits);
    })
    .catch(err => {
      console.error('Greška pri dohvaćanju RMS posjeta po mjesecima:', err);
      renderMonthlyRmsTable([]);
    });

  // Gumb za uređivanje
  document.getElementById('editLocationBtn').addEventListener('click', () => {
    document.getElementById('locationInfo').style.display = 'none';
    document.getElementById('editLocationForm').style.display = 'block';
  });

  // Gumb za odustajanje
  document.getElementById('cancelEditBtn').addEventListener('click', () => {
    document.getElementById('locationInfo').style.display = 'block';
    document.getElementById('editLocationForm').style.display = 'none';
  });

  // Submit forme za uređivanje
  document.getElementById('updateLocationForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    const updatedData = {
      name: document.getElementById('editName').value,
      address: document.getElementById('editAddress').value,
      contact_person: document.getElementById('editContactPerson').value,
      contact_phone: document.getElementById('editContactPhone').value,
      notes: document.getElementById('editNotes').value
    };

    const rmsFrequencyField = document.getElementById('editRmsFrequency');
    if (currentUser?.role === 'admin' && rmsFrequencyField) {
      updatedData.rms_frequency = Number(rmsFrequencyField.value) || 1;
    }

    try {
      const res = await fetch(`/api/locations/${locationId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedData)
      });

      if (res.ok) {
        alert('✅ Lokacija uspješno ažurirana!');
        document.getElementById('locationInfo').style.display = 'block';
        document.getElementById('editLocationForm').style.display = 'none';
        loadLocationInfo(); // Osvježi prikaz
      } else {
        const data = await res.json();
        alert('Greška: ' + (data.error || 'Neuspjelo ažuriranje.'));
      }
    } catch (err) {
      console.error('Greška:', err);
      alert('Greška prilikom komunikacije sa serverom.');
    }
  });

  // Dizala
  const loadElevators = () => {
    fetch(`/api/locations/${locationId}/elevators`, { credentials: 'include' })
      .then(res => res.json())
      .then(elevators => {
        const query = (document.getElementById('elevatorSearch')?.value || '').trim().toLowerCase();
        const filteredElevators = query
          ? elevators.filter(elevator => [
              elevator.label,
              elevator.serial_number,
              elevator.control_group_type,
              elevator.cabin_door_type,
              elevator.lock_type,
              elevator.machine_room_key,
              elevator.comment
            ].some(value => (value || '').toString().toLowerCase().includes(query)))
          : elevators;
        const list = document.getElementById('elevatorsList');
        const emptyState = document.getElementById('elevatorsEmptyState');
        if (!list) return;
        list.innerHTML = '';
        if (filteredElevators.length === 0) {
          list.innerHTML = '<li class="list-group-item">Nema dizala za ovu lokaciju.</li>';
          if (emptyState) {
            if (elevators.length === 0) {
              emptyState.classList.remove('d-none');
            } else {
              emptyState.classList.add('d-none');
            }
          }
        } else {
          if (emptyState) emptyState.classList.add('d-none');
          filteredElevators.forEach(elevator => {
            const li = document.createElement('li');
            li.className = 'list-group-item';
            li.innerHTML = `
              <div class="d-flex justify-content-between align-items-start gap-3">
                <div>
                  <strong>${elevator.label}</strong>
                  <div class="text-muted text-sm mt-1">
                    <div>Serijski broj: ${elevator.serial_number || '—'}</div>
                    <div>Vrsta upravljanja: ${elevator.control_group_type || '—'}</div>
                    <div>Kabinska vrata: ${elevator.cabin_door_type || '—'}</div>
                    <div>Vrsta zabrava: ${elevator.lock_type || '—'}</div>
                    <div>Ključ strojarnice: ${elevator.machine_room_key || '—'}</div>
                    <div>Komentar: ${elevator.comment || '—'}</div>
                  </div>
                </div>
                ${currentUser?.role === 'admin'
                  ? `<div class="d-flex flex-column gap-2">
                      <button type="button" class="btn btn-sm btn-outline-primary" data-elevator-edit="${elevator.id}">Uredi</button>
                      <button type="button" class="btn btn-sm btn-outline-danger" data-elevator-id="${elevator.id}">✕</button>
                    </div>`
                  : ''}
              </div>
              ${currentUser?.role === 'admin'
                ? `<div class="mt-3 d-none" data-elevator-form="${elevator.id}">
                    <div class="row g-2">
                      <div class="col-md-3"><input class="tw-input" data-field="label" value="${elevator.label || ''}" placeholder="Oznaka" /></div>
                      <div class="col-md-3"><input class="tw-input" data-field="serial_number" value="${elevator.serial_number || ''}" placeholder="Serijski broj" /></div>
                      <div class="col-md-3"><input class="tw-input" data-field="control_group_type" value="${elevator.control_group_type || ''}" placeholder="Vrsta upravljanja" /></div>
                      <div class="col-md-3"><input class="tw-input" data-field="cabin_door_type" value="${elevator.cabin_door_type || ''}" placeholder="Kabinska vrata" /></div>
                      <div class="col-md-3"><input class="tw-input" data-field="lock_type" value="${elevator.lock_type || ''}" placeholder="Vrsta zabrava" /></div>
                      <div class="col-md-3"><input class="tw-input" data-field="machine_room_key" value="${elevator.machine_room_key || ''}" placeholder="Ključ strojarnice" /></div>
                      <div class="col-md-6"><input class="tw-input" data-field="comment" value="${elevator.comment || ''}" placeholder="Komentar" /></div>
                    </div>
                    <div class="mt-2 d-flex gap-2">
                      <button type="button" class="tw-btn-primary" data-elevator-save="${elevator.id}">Spremi</button>
                      <button type="button" class="tw-btn-secondary" data-elevator-cancel="${elevator.id}">Odustani</button>
                    </div>
                  </div>`
                : ''}
            `;
            list.appendChild(li);
          });
        }
      });
  };

  const addElevatorFromEmpty = document.getElementById('addElevatorFromEmpty');
  if (addElevatorFromEmpty) {
    addElevatorFromEmpty.addEventListener('click', () => {
      const adminControls = document.getElementById('elevatorsAdminControls');
      if (adminControls) {
        adminControls.classList.remove('d-none');
        adminControls.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    });
  }

  const adminControls = document.getElementById('elevatorsAdminControls');
  const addElevatorBtn = document.getElementById('addElevatorBtn');
  const newElevatorLabel = document.getElementById('newElevatorLabel');
  const newElevatorSerial = document.getElementById('newElevatorSerial');
  const newElevatorControl = document.getElementById('newElevatorControl');
  const newElevatorDoor = document.getElementById('newElevatorDoor');
  const newElevatorLock = document.getElementById('newElevatorLock');
  const newElevatorKey = document.getElementById('newElevatorKey');
  const newElevatorComment = document.getElementById('newElevatorComment');

  const setupAdminControls = () => {
    const addElevatorFromEmpty = document.getElementById('addElevatorFromEmpty');
    if (currentUser?.role === 'admin' && adminControls) {
      adminControls.classList.remove('d-none');
      if (addElevatorFromEmpty) addElevatorFromEmpty.classList.remove('d-none');
      return;
    }
    if (addElevatorFromEmpty) addElevatorFromEmpty.classList.add('d-none');
  };

  if (addElevatorBtn && newElevatorLabel) {
    addElevatorBtn.addEventListener('click', async () => {
      const label = newElevatorLabel.value.trim();
      if (!label) return;
      try {
        const res = await fetch(`/api/locations/${locationId}/elevators`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            label,
            serial_number: newElevatorSerial?.value.trim() || '',
            control_group_type: newElevatorControl?.value.trim() || '',
            cabin_door_type: newElevatorDoor?.value.trim() || '',
            lock_type: newElevatorLock?.value.trim() || '',
            machine_room_key: newElevatorKey?.value.trim() || '',
            comment: newElevatorComment?.value.trim() || ''
          })
        });
        if (!res.ok) {
          const data = await res.json();
          alert(data.error || 'Greška pri dodavanju dizala');
          return;
        }
        newElevatorLabel.value = '';
        if (newElevatorSerial) newElevatorSerial.value = '';
        if (newElevatorControl) newElevatorControl.value = '';
        if (newElevatorDoor) newElevatorDoor.value = '';
        if (newElevatorLock) newElevatorLock.value = '';
        if (newElevatorKey) newElevatorKey.value = '';
        if (newElevatorComment) newElevatorComment.value = '';
        loadElevators();
      } catch (err) {
        console.error('Greška pri dodavanju dizala:', err);
      }
    });
  }

  const elevatorsList = document.getElementById('elevatorsList');
  if (elevatorsList) {
    elevatorsList.addEventListener('click', async (event) => {
      const target = event.target;
      const editId = target?.dataset?.elevatorEdit;
      const saveId = target?.dataset?.elevatorSave;
      const cancelId = target?.dataset?.elevatorCancel;
      const id = target?.dataset?.elevatorId;
      if (editId) {
        const form = document.querySelector(`[data-elevator-form="${editId}"]`);
        if (form) form.classList.remove('d-none');
        return;
      }
      if (cancelId) {
        const form = document.querySelector(`[data-elevator-form="${cancelId}"]`);
        if (form) form.classList.add('d-none');
        return;
      }
      if (saveId) {
        const form = document.querySelector(`[data-elevator-form="${saveId}"]`);
        if (!form) return;
        const payload = {};
        form.querySelectorAll('[data-field]').forEach((input) => {
          payload[input.dataset.field] = input.value.trim();
        });
        try {
          const res = await fetch(`/api/elevators/${saveId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });
          if (!res.ok) {
            const data = await res.json();
            alert(data.error || 'Greška pri ažuriranju dizala');
            return;
          }
          loadElevators();
        } catch (err) {
          console.error('Greška pri ažuriranju dizala:', err);
        }
        return;
      }
      if (!id) return;
      try {
        const res = await fetch(`/api/elevators/${id}`, { method: 'DELETE' });
        if (!res.ok) {
          const data = await res.json();
          alert(data.error || 'Greška pri brisanju dizala');
          return;
        }
        loadElevators();
      } catch (err) {
        console.error('Greška pri brisanju dizala:', err);
      }
    });
  }

  Promise.resolve(loadCurrentUser()).then(() => {
    setupAdminControls();
    loadElevators();
  });

  const elevatorSearch = document.getElementById('elevatorSearch');
  if (elevatorSearch) {
    elevatorSearch.addEventListener('input', () => {
      loadElevators();
    });
  }

  // RMS pregledi
  fetch(`/api/rms-visits/location/${locationId}`)
    .then(res => res.json())
    .then(rmsList => {
      const list = document.getElementById('rmsList');
      const emptyState = document.getElementById('rmsEmptyState');
      list.innerHTML = '';
      if (rmsList.length === 0) {
        list.innerHTML = '<li class="list-group-item">Nema RMS pregleda za ovu lokaciju.</li>';
        if (emptyState) emptyState.classList.remove('d-none');
      } else {
        if (emptyState) emptyState.classList.add('d-none');
        rmsList.forEach(rms => {
          const li = document.createElement('li');
          li.className = 'list-group-item d-flex justify-content-between align-items-center';
          
          const dateFormatted = new Date(rms.visit_date).toLocaleDateString('hr-HR');
          const timeFormatted = rms.created_at ? new Date(rms.created_at).toLocaleTimeString('hr-HR') : '';
          
          li.innerHTML = `
            <div>
              <strong>${dateFormatted} ${timeFormatted}</strong><br>
              <small>${rms.user_id || 'N/A'}</small>
              ${rms.notes_general ? `<br><small class="text-muted">${rms.notes_general.substring(0, 50)}...</small>` : ''}
            </div>
            <a href="/api/rms/${rms.id}/pdf" target="_blank" class="btn btn-sm btn-danger">📄 PDF</a>
          `;
          list.appendChild(li);
        });
      }
    })
    .catch(err => console.error('Greška pri dohvaćanju RMS zapisa:', err));

  // Intervencije
  fetch(`/api/interventions/by-location/${locationId}`)
    .then(res => res.json())
    .then(interventions => {
      const list = document.getElementById('interventionsList');
      const emptyState = document.getElementById('interventionsEmptyState');
      list.innerHTML = '';
      if (interventions.length === 0) {
        list.innerHTML = '<li class="list-group-item">Nema intervencija za ovu lokaciju.</li>';
        if (emptyState) emptyState.classList.remove('d-none');
      } else {
        if (emptyState) emptyState.classList.add('d-none');
        interventions.forEach(intv => {
          const li = document.createElement('li');
          li.className = 'list-group-item d-flex justify-content-between align-items-center';
          
          const dateFormatted = new Date(intv.date).toLocaleDateString('hr-HR');
          const timeFormatted = intv.created_at ? new Date(intv.created_at).toLocaleTimeString('hr-HR') : '';
          
          li.innerHTML = `
            <div>
              <strong>${dateFormatted} ${timeFormatted}</strong><br>
              <small>${intv.technician || 'N/A'}</small>
              ${intv.notes ? `<br><small class="text-muted">${intv.notes.substring(0, 50)}...</small>` : ''}
            </div>
            <a href="/api/interventions/${intv.id}/pdf" target="_blank" class="btn btn-sm btn-danger">📄 PDF</a>
          `;
          list.appendChild(li);
        });
      }
    })
    .catch(err => console.error('Greška pri dohvaćanju intervencija:', err));
});
