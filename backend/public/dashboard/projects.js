document.addEventListener('DOMContentLoaded', () => {
  initProjects();
});

async function initProjects() {
  const session = await fetchSession();
  const isAdmin = session?.user?.role === 'admin';
  if (session?.user?.role) {
    document.body.dataset.userRole = session.user.role;
  }
  applyRoleUI(isAdmin);
  await loadLocations();
  await loadProjects();
  bindModalButtons(isAdmin);
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

function bindModalButtons(isAdmin) {
  const addBtn = document.getElementById('addProjectBtn');
  const emptyBtn = document.getElementById('projectsEmptyAdd');
  if (addBtn) addBtn.addEventListener('click', () => openProjectModal());
  if (emptyBtn) emptyBtn.addEventListener('click', () => openProjectModal());

  const form = document.getElementById('projectForm');
  if (form && isAdmin) {
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      await createProject();
    });
  }
}

function openProjectModal() {
  const form = document.getElementById('projectForm');
  if (form) form.reset();
  if (typeof window.openModal === 'function') {
    window.openModal('projectModal');
  }
}

async function loadLocations() {
  const select = document.getElementById('projectLocation');
  if (!select) return;
  try {
    const res = await fetch('/api/locations');
    if (!res.ok) return;
    const locations = await res.json();
    select.innerHTML = '<option value="">Bez lokacije</option>';
    locations.forEach(loc => {
      const option = document.createElement('option');
      option.value = loc.id;
      option.textContent = loc.name || loc.address || `Lokacija #${loc.id}`;
      select.appendChild(option);
    });
  } catch (err) {
    console.warn('Neuspjelo dohvaćanje lokacija:', err);
  }
}

async function loadProjects() {
  try {
    const [projectsRes, locationsRes] = await Promise.all([
      fetch('/api/projects'),
      fetch('/api/locations')
    ]);

    if (!projectsRes.ok) throw new Error('Greška pri dohvaćanju projekata');
    const projects = await projectsRes.json();
    const locations = locationsRes.ok ? await locationsRes.json() : [];
    const locationMap = new Map(locations.map(loc => [loc.id, loc.name || loc.address || `Lokacija #${loc.id}`]));
    renderProjects(projects, locationMap);
  } catch (err) {
    console.error(err);
    alert('Greška pri dohvaćanju projekata.');
  }
}

function renderProjects(projects, locationMap) {
  const list = document.getElementById('projectsList');
  const empty = document.getElementById('projectsEmpty');
  if (!list || !empty) return;

  list.innerHTML = '';
  if (!projects.length) {
    empty.classList.remove('d-none');
    return;
  }
  empty.classList.add('d-none');

  projects.forEach(project => {
    const card = document.createElement('div');
    card.className = 'project-card';
    const locationName = project.location_id ? (locationMap.get(project.location_id) || '—') : 'Bez lokacije';
    const statusLabel = statusLabelMap(project.status);
    card.innerHTML = `
      <div class="project-card-body">
        <div>
          <h4>${escapeHtml(project.name)}</h4>
          <p class="project-meta">Lokacija: ${escapeHtml(locationName)}</p>
          <p class="project-meta">Početak: ${formatDate(project.start_date)}</p>
          <p class="project-meta">Završetak: ${formatDate(project.expected_end_date)}</p>
        </div>
        <span class="project-status ${statusClass(project.status)}">${statusLabel}</span>
      </div>
    `;
    card.addEventListener('click', () => {
      window.location.href = `/dashboard/project-detail.html?id=${project.id}`;
    });
    card.style.cursor = 'pointer';
    list.appendChild(card);
  });
}

async function createProject() {
  const name = document.getElementById('projectName').value.trim();
  const description = document.getElementById('projectDescription').value.trim();
  const locationId = document.getElementById('projectLocation').value;
  const startDate = document.getElementById('projectStartDate').value;
  const expectedEnd = document.getElementById('projectExpectedEnd').value;

  if (!name) {
    alert('Naziv projekta je obavezan.');
    return;
  }

  const payload = {
    name,
    description: description || null,
    location_id: locationId || null,
    start_date: startDate || null,
    expected_end_date: expectedEnd || null
  };

  try {
    const res = await fetch('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Greška pri spremanju projekta');
    }
    if (typeof window.closeModal === 'function') {
      window.closeModal('projectModal');
    }
    await loadProjects();
  } catch (err) {
    console.error(err);
    alert(err.message || 'Greška pri spremanju projekta.');
  }
}

function formatDate(value) {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('hr-HR');
}

function statusLabelMap(status) {
  const map = {
    active: 'Aktivan',
    completed: 'Završen',
    archived: 'Arhiviran'
  };
  return map[status] || status || '—';
}

function statusClass(status) {
  const map = {
    active: 'project-status-active',
    completed: 'project-status-completed',
    archived: 'project-status-archived'
  };
  return map[status] || 'project-status-active';
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
