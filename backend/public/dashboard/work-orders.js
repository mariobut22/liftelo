document.addEventListener('DOMContentLoaded', () => {
  initWorkOrders();
});

async function initWorkOrders() {
  const session = await fetchSession();
  const isAdmin = session?.user?.role === 'admin';
  applyRoleUI(isAdmin);

  setIssuedDate();
  bindWorkOrderModalOpen();

  await Promise.all([
    loadWorkOrders(),
    loadLocations(),
    loadUsers()
  ]);

  bindWorkOrderForm();
  bindAddItem();
}

function fetchSession() {
  return fetch('/api/users/session')
    .then(res => res.ok ? res.json() : null)
    .catch(() => null);
}

function applyRoleUI(isAdmin) {
  if (isAdmin) return;
  document.querySelectorAll('[data-admin-only]').forEach(el => el.remove());
}

async function loadWorkOrders() {
  try {
    const res = await fetch('/api/work-orders');
    const rows = await res.json();
    if (!Array.isArray(rows)) {
      throw new Error('Invalid response');
    }
    renderWorkOrders(rows);
  } catch (err) {
    console.error('Greška pri dohvaćanju radnih naloga:', err);
  }
}

function renderWorkOrders(rows) {
  const tbody = document.querySelector('#work-orders-table tbody');
  const emptyState = document.getElementById('work-orders-empty-state');
  const tableWrapper = document.querySelector('#work-orders-table')?.closest('.overflow-x-auto');
  if (!tbody) return;

  tbody.innerHTML = '';

  if (rows.length === 0) {
    if (emptyState) emptyState.classList.remove('d-none');
    if (tableWrapper) tableWrapper.classList.add('d-none');
    return;
  }

  if (emptyState) emptyState.classList.add('d-none');
  if (tableWrapper) tableWrapper.classList.remove('d-none');

  rows.forEach(row => {
    const tr = document.createElement('tr');
    tr.className = 'cursor-pointer hover:bg-slate-50';
    tr.dataset.id = row.id;

    tr.innerHTML = `
      <td class="py-3 pr-4">${row.location_name || '—'}</td>
      <td class="py-3 pr-4">${formatDate(row.due_date)}</td>
      <td class="py-3 pr-4">${row.assigned_users || '—'}</td>
      <td class="py-3 pr-4">${formatStatus(row.status)}</td>
      <td class="py-3">
        <a href="/dashboard/work-order-detail.html?id=${row.id}" class="btn btn-sm btn-outline-primary">Prikaži</a>
      </td>
    `;

    tr.addEventListener('click', (event) => {
      if (event.target.closest('a, button')) return;
      window.location.href = `/dashboard/work-order-detail.html?id=${row.id}`;
    });

    tbody.appendChild(tr);
  });
}

function formatDate(value) {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('hr-HR');
}

function formatStatus(value) {
  if (!value) return '—';
  const map = {
    open: 'Otvoren',
    completed: 'Zatvoren',
    cancelled: 'Otkazan'
  };
  return map[value] || value;
}

async function loadLocations() {
  const input = document.getElementById('workOrderLocation');
  const suggestions = document.getElementById('workOrderLocationSuggestions');
  const datalist = document.getElementById('workOrderLocationsList');
  if (!input) return;
  try {
    const res = await fetch('/api/locations');
    const rows = await res.json();
    if (!Array.isArray(rows)) return;
    cachedLocations = rows;
    if (datalist) {
      datalist.innerHTML = '';
      rows.forEach(loc => {
        const option = document.createElement('option');
        option.value = loc.name;
        datalist.appendChild(option);
      });
    }

    input.addEventListener('input', () => {
      const query = input.value.trim().toLowerCase();
      if (!suggestions) return;
      suggestions.innerHTML = '';
      if (!query) return;

      const filtered = cachedLocations.filter(loc =>
        loc.name.toLowerCase().includes(query) ||
        loc.address.toLowerCase().includes(query)
      );

      filtered.slice(0, 5).forEach(loc => {
        const li = document.createElement('li');
        li.className = 'list-group-item list-group-item-action';
        li.style.cursor = 'pointer';
        li.innerHTML = `<strong>${loc.name}</strong><br><small>${loc.address}</small>`;
        li.addEventListener('click', () => {
          input.value = loc.name;
          suggestions.innerHTML = '';
          loadElevators(loc.id);
        });
        suggestions.appendChild(li);
      });
    });

    input.addEventListener('blur', () => {
      const selected = cachedLocations.find(loc => loc.name === input.value.trim());
      if (selected) {
        loadElevators(selected.id);
      }
    });

    document.addEventListener('click', (event) => {
      if (!suggestions) return;
      if (!input.contains(event.target) && !suggestions.contains(event.target)) {
        suggestions.innerHTML = '';
      }
    });
  } catch (err) {
    console.error('Greška pri dohvaćanju lokacija:', err);
  }
}

async function loadElevators(locationId) {
  const container = document.getElementById('workOrderElevators');
  if (!container || !locationId) return;
  try {
    const res = await fetch(`/api/locations/${locationId}/elevators`);
    const rows = await res.json();
    if (!Array.isArray(rows)) return;
    if (rows.length === 0) {
      container.innerHTML = '<div class="text-sm text-slate-500">Nema dizala za lokaciju.</div>';
      return;
    }
    container.innerHTML = rows.map(row => `
      <label class="flex items-center gap-2 text-sm text-slate-700">
        <input type="checkbox" class="form-check-input" value="${row.id}" />
        <span>${row.label}</span>
      </label>
    `).join('');
  } catch (err) {
    console.error('Greška pri dohvaćanju dizala:', err);
  }
}

async function loadUsers() {
  const container = document.getElementById('workOrderUsers');
  if (!container) return;
  try {
    const res = await fetch('/api/users');
    const rows = await res.json();
    if (!Array.isArray(rows)) return;
    if (rows.length === 0) {
      container.innerHTML = '<div class="text-sm text-slate-500">Nema korisnika.</div>';
      return;
    }
    container.innerHTML = rows.map(user => `
      <label class="flex items-center gap-2 text-sm text-slate-700">
        <input type="checkbox" class="form-check-input" value="${user.id}" />
        <span>${user.full_name || user.username}</span>
      </label>
    `).join('');
  } catch (err) {
    console.error('Greška pri dohvaćanju korisnika:', err);
  }
}

function bindAddItem() {
  const addButton = document.getElementById('addWorkOrderItem');
  const itemsContainer = document.getElementById('workOrderItems');
  if (!addButton || !itemsContainer) return;

  addButton.addEventListener('click', () => {
    itemsContainer.appendChild(buildItemRow());
  });

  if (!itemsContainer.children.length) {
    itemsContainer.appendChild(buildItemRow());
  }
}

function buildItemRow() {
  const wrapper = document.createElement('div');
  wrapper.className = 'flex flex-col gap-2 sm:flex-row sm:items-center';
  wrapper.innerHTML = `
    <input type="text" class="tw-input flex-1" placeholder="Opis stavke" />
    <button type="button" class="tw-btn-secondary">Ukloni</button>
  `;
  const removeButton = wrapper.querySelector('button');
  removeButton.addEventListener('click', () => {
    wrapper.remove();
  });
  return wrapper;
}

function bindWorkOrderForm() {
  const form = document.getElementById('workOrderForm');
  if (!form) return;

  form.addEventListener('submit', async (event) => {
    event.preventDefault();

    const locationInput = document.getElementById('workOrderLocation');
    const issuedDate = document.getElementById('workOrderIssuedDate')?.value || null;
    const locationName = locationInput?.value?.trim() || '';
    const dueDate = document.getElementById('workOrderDueDate')?.value || null;
    const comment = document.getElementById('workOrderComment')?.value?.trim() || null;
    const items = Array.from(document.querySelectorAll('#workOrderItems input')).map((input, index) => ({
      description: input.value.trim(),
      sort_order: index + 1
    })).filter(item => item.description);
    const elevatorIds = Array.from(document.querySelectorAll('#workOrderElevators input[type="checkbox"]:checked'))
      .map(input => Number(input.value));
    const assignedUserIds = Array.from(document.querySelectorAll('#workOrderUsers input[type="checkbox"]:checked'))
      .map(input => Number(input.value));

    const locationId = await resolveLocationId(locationName);
    if (!locationId) {
      alert('Odaberi lokaciju.');
      return;
    }

    if (items.length === 0) {
      alert('Dodaj barem jednu stavku.');
      return;
    }

    try {
      const res = await fetch('/api/work-orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          location_id: Number(locationId),
          issued_date: issuedDate,
          due_date: dueDate,
          general_comment: comment,
          items,
          elevator_ids: elevatorIds,
          assigned_user_ids: assignedUserIds
        })
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Greška pri spremanju naloga');
      }

      form.reset();
      document.getElementById('workOrderItems').innerHTML = '';
      bindAddItem();
      Array.from(document.querySelectorAll('#workOrderElevators input[type="checkbox"]')).forEach(input => { input.checked = false; });
      Array.from(document.querySelectorAll('#workOrderUsers input[type="checkbox"]')).forEach(input => { input.checked = false; });

      if (typeof window.closeModal === 'function') {
        window.closeModal('workOrderModal');
      }
      loadWorkOrders();
    } catch (err) {
      alert(err.message || 'Greška pri spremanju naloga');
    }
  });
}

let cachedLocations = [];

function setIssuedDate() {
  const issuedDate = document.getElementById('workOrderIssuedDate');
  if (!issuedDate) return;
  if (!issuedDate.value) {
    issuedDate.valueAsDate = new Date();
  }
}

function bindWorkOrderModalOpen() {
  document.querySelectorAll('[data-modal-target="workOrderModal"]').forEach((trigger) => {
    trigger.addEventListener('click', () => {
      setIssuedDate();
    });
  });
}

async function resolveLocationId(name) {
  if (!name) return null;
  if (!cachedLocations.length) {
    try {
      const res = await fetch('/api/locations');
      cachedLocations = await res.json();
    } catch (err) {
      return null;
    }
  }
  const selected = cachedLocations.find(loc => loc.name === name.trim());
  return selected?.id || null;
}
