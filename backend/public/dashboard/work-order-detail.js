document.addEventListener('DOMContentLoaded', () => {
  initDetail();
});

async function initDetail() {
  const session = await fetchSession();
  const isAdmin = session?.user?.role === 'admin';
  applyRoleUI(isAdmin);

  const workOrderId = new URLSearchParams(window.location.search).get('id');
  if (!workOrderId) {
    alert('Nedostaje ID radnog naloga.');
    return;
  }

  await loadWorkOrder(workOrderId, isAdmin);
  bindClose(workOrderId, isAdmin);
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

async function loadWorkOrder(id, isAdmin) {
  try {
    const res = await fetch(`/api/work-orders/${id}`);
    if (!res.ok) {
      throw new Error('Work order not found');
    }
    const data = await res.json();
    renderWorkOrder(data, isAdmin);
  } catch (err) {
    alert('Greška pri dohvaćanju radnog naloga.');
    console.error(err);
  }
}

function renderWorkOrder(data, isAdmin) {
  const title = document.getElementById('workOrderTitle');
  const meta = document.getElementById('workOrderMeta');
  const location = document.getElementById('workOrderLocation');
  const address = document.getElementById('workOrderAddress');
  const contact = document.getElementById('workOrderContact');
  const status = document.getElementById('workOrderStatus');
  const issuedDate = document.getElementById('workOrderIssuedDate');
  const due = document.getElementById('workOrderDue');
  const created = document.getElementById('workOrderCreated');
  const usersList = document.getElementById('workOrderUsers');
  const elevatorsList = document.getElementById('workOrderElevators');
  const itemsList = document.getElementById('workOrderItems');
  const comment = document.getElementById('workOrderComment');
  const pdfLink = document.getElementById('workOrderPdf');
  const closeButton = document.getElementById('closeWorkOrder');

  if (title) title.textContent = `Radni nalog #${data.id}`;
  if (meta) meta.textContent = `Kreiran: ${formatDate(data.created_at)} ${formatTime(data.created_at)}`;
  if (location) location.textContent = data.location_name || '—';
  if (address) address.textContent = data.location_address || '—';
  if (contact) contact.textContent = [data.contact_person, data.contact_phone].filter(Boolean).join(' • ') || '—';
  if (status) status.textContent = formatStatus(data.status);
  if (issuedDate) issuedDate.textContent = formatDate(data.issued_date);
  if (due) due.textContent = formatDate(data.due_date);
  if (created) created.textContent = `${formatDate(data.created_at)} ${formatTime(data.created_at)}`;
  if (comment) comment.textContent = data.general_comment || '—';
  if (pdfLink) pdfLink.href = `/api/work-orders/${data.id}/pdf`;

  if (usersList) {
    usersList.innerHTML = '';
    if (Array.isArray(data.users) && data.users.length) {
      data.users.forEach(user => {
        const li = document.createElement('li');
        li.textContent = user.full_name || user.username || '—';
        usersList.appendChild(li);
      });
    } else {
      usersList.innerHTML = '<li>—</li>';
    }
  }

  if (elevatorsList) {
    elevatorsList.innerHTML = '';
    if (Array.isArray(data.elevators) && data.elevators.length) {
      data.elevators.forEach(elevator => {
        const li = document.createElement('li');
        li.textContent = elevator.label || '—';
        elevatorsList.appendChild(li);
      });
    } else {
      elevatorsList.innerHTML = '<li>—</li>';
    }
  }

  if (itemsList) {
    itemsList.innerHTML = '';
    if (Array.isArray(data.items) && data.items.length) {
      data.items.forEach(item => {
        const li = document.createElement('li');
        li.textContent = item.description || '—';
        itemsList.appendChild(li);
      });
    } else {
      itemsList.innerHTML = '<li>—</li>';
    }
  }

  if (closeButton) {
    if (!isAdmin || data.status === 'completed') {
      closeButton.disabled = true;
      closeButton.classList.add('opacity-50', 'cursor-not-allowed');
    }
  }
}

function bindClose(id, isAdmin) {
  const closeButton = document.getElementById('closeWorkOrder');
  if (!closeButton || !isAdmin) return;
  closeButton.addEventListener('click', async () => {
    if (!confirm('Zatvoriti radni nalog?')) return;
    try {
      const res = await fetch(`/api/work-orders/${id}/close`, { method: 'PUT' });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Greška pri zatvaranju naloga');
      }
      await loadWorkOrder(id, isAdmin);
    } catch (err) {
      alert(err.message || 'Greška pri zatvaranju naloga');
    }
  });
}

function formatDate(value) {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('hr-HR');
}

function formatTime(value) {
  if (!value) return '—';
  return new Date(value).toLocaleTimeString('hr-HR');
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
