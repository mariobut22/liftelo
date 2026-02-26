document.addEventListener('DOMContentLoaded', () => {
  initProjectDetail();
});

let projectUsers = [];
let isAdminUser = false;
let currentProjectId = null;
let currentSections = [];
let currentTasks = [];

async function initProjectDetail() {
  const params = new URLSearchParams(window.location.search);
  const projectId = params.get('id');
  const backBtn = document.getElementById('backToProjects');
  if (backBtn) {
    backBtn.addEventListener('click', () => {
      window.location.href = '/dashboard/projects.html';
    });
  }

  if (!projectId) {
    alert('Nedostaje ID projekta.');
    return;
  }

  currentProjectId = projectId;
  const session = await fetchSession();
  isAdminUser = session?.user?.role === 'admin';
  if (session?.user?.role) {
    document.body.dataset.userRole = session.user.role;
  }
  applyRoleUI(isAdminUser);
  await loadUsers();
  bindSectionModal();
  bindTaskModal();
  bindAddSectionButton();

  await loadProject(projectId);
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

async function loadUsers() {
  try {
    const res = await fetch('/api/users?include_disabled=1');
    if (!res.ok) return;
    projectUsers = await res.json();
    populateAssigneeOptions();
  } catch (err) {
    console.warn('Neuspjelo dohvaćanje korisnika:', err);
  }
}

function populateAssigneeOptions(selectedIds = []) {
  const container = document.getElementById('projectTaskAssignees');
  if (!container) return;
  const activeUsers = projectUsers.filter(user => !user.disabled_at);
  container.innerHTML = '';
  if (!activeUsers.length) {
    container.innerHTML = '<div class="text-sm text-slate-500">Nema dostupnih korisnika.</div>';
    return;
  }
  activeUsers.forEach(user => {
    const wrapper = document.createElement('label');
    wrapper.className = 'project-assignee-item';
    const checked = selectedIds.includes(user.id);
    wrapper.innerHTML = `
      <input type="checkbox" value="${user.id}" ${checked ? 'checked' : ''} />
      <span>${escapeHtml(user.full_name || user.username)}</span>
    `;
    container.appendChild(wrapper);
  });
}

function bindAddSectionButton() {
  const addSectionBtn = document.getElementById('addSectionBtn');
  if (!addSectionBtn) return;
  addSectionBtn.addEventListener('click', () => {
    if (typeof window.openModal === 'function') {
      window.openModal('projectSectionModal');
    }
  });
}

function bindSectionModal() {
  const form = document.getElementById('projectSectionForm');
  if (!form) return;
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    await createSection();
  });
}

function bindTaskModal() {
  const form = document.getElementById('projectTaskForm');
  if (!form) return;
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    await createTask();
  });
}

async function loadProject(projectId) {
  try {
    const res = await fetch(`/api/projects/${projectId}`);
    if (!res.ok) throw new Error('Projekt nije pronađen');
    const data = await res.json();
    currentSections = data.sections || [];
    currentTasks = data.tasks || [];
    renderProject(data.project);
    renderSections(currentSections, currentTasks);
    updateProjectProgress(currentTasks);
  } catch (err) {
    console.error(err);
    alert('Greška pri dohvaćanju projekta.');
  }
}

function updateProjectProgress(tasks) {
  const totalTasks = tasks.length;
  const completedTasks = tasks.filter(task => task.is_completed).length;
  const progressPercent = totalTasks > 0
    ? Math.round((completedTasks / totalTasks) * 100)
    : 0;

  const badgeEl = document.getElementById('project-progress-badge');
  const barEl = document.getElementById('project-progress-bar');
  if (badgeEl) {
    badgeEl.textContent = `${progressPercent}%`;
    badgeEl.classList.remove('bg-gray-200', 'text-gray-700', 'bg-blue-100', 'text-blue-700', 'bg-indigo-100', 'text-indigo-700', 'bg-green-100', 'text-green-700');
    if (progressPercent === 0) {
      badgeEl.classList.add('bg-gray-200', 'text-gray-700');
    } else if (progressPercent < 50) {
      badgeEl.classList.add('bg-blue-100', 'text-blue-700');
    } else if (progressPercent < 100) {
      badgeEl.classList.add('bg-indigo-100', 'text-indigo-700');
    } else {
      badgeEl.classList.add('bg-green-100', 'text-green-700');
    }
  }
  if (barEl) {
    barEl.style.width = `${progressPercent}%`;
    barEl.classList.remove('bg-gray-400', 'bg-blue-500', 'bg-indigo-600', 'bg-green-600');
    if (progressPercent === 0) {
      barEl.classList.add('bg-gray-400');
    } else if (progressPercent < 50) {
      barEl.classList.add('bg-blue-500');
    } else if (progressPercent < 100) {
      barEl.classList.add('bg-indigo-600');
    } else {
      barEl.classList.add('bg-green-600');
    }
  }
}

function renderProject(project) {
  if (!project) return;
  const title = document.getElementById('projectTitle');
  const status = document.getElementById('projectStatus');
  const name = document.getElementById('projectName');
  const description = document.getElementById('projectDescription');
  const location = document.getElementById('projectLocation');
  const statusValue = document.getElementById('projectStatusValue');
  const startDate = document.getElementById('projectStartDate');
  const expectedEnd = document.getElementById('projectExpectedEnd');
  const createdBy = document.getElementById('projectCreatedBy');
  const createdAt = document.getElementById('projectCreatedAt');

  if (title) title.textContent = project.name || 'Projekt';
  if (status) status.textContent = statusLabel(project.status);
  if (name) name.textContent = project.name || '—';
  if (description) description.textContent = project.description || '—';
  if (location) location.textContent = project.location_id ? `Lokacija #${project.location_id}` : 'Bez lokacije';
  if (statusValue) statusValue.textContent = statusLabel(project.status);
  if (startDate) startDate.textContent = formatDate(project.start_date);
  if (expectedEnd) expectedEnd.textContent = formatDate(project.expected_end_date);
  if (createdBy) createdBy.textContent = project.created_by ? `Korisnik #${project.created_by}` : '—';
  if (createdAt) createdAt.textContent = formatDateTime(project.created_at);
}

function renderSections(sections, tasks) {
  const container = document.getElementById('projectSections');
  const emptyState = document.getElementById('projectSectionsEmpty');
  if (!container || !emptyState) return;

  container.innerHTML = '';
  container.classList.add('space-y-6');
  if (!sections.length) {
    emptyState.classList.remove('d-none');
    emptyState.textContent = 'Projekt još nema sekcija. Dodaj prvu sekciju.';
    return;
  }
  emptyState.classList.add('d-none');

  sections.forEach(section => {
    const sectionTasks = tasks.filter(task => task.project_section_id === section.id);
    const sectionEl = document.createElement('div');
    sectionEl.className = 'project-section bg-white rounded-xl border border-gray-200 shadow-sm';
    const sectionTotal = sectionTasks.length;
    const sectionCompleted = sectionTasks.filter(task => task.is_completed).length;
    const sectionPercent = sectionTotal > 0
      ? Math.round((sectionCompleted / sectionTotal) * 100)
      : 0;
    sectionEl.innerHTML = `
      <div class="project-section-header">
        <div>
          <h4 class="text-base font-semibold text-gray-800">${escapeHtml(section.title)}</h4>
          <div class="mt-2">
            <div class="w-full bg-gray-200 rounded-full h-[3px]">
              <div class="bg-blue-500 h-[3px] rounded-full" style="width: ${sectionPercent}%"></div>
            </div>
          </div>
        </div>
        ${isAdminUser ? `<button class="tw-btn-secondary" data-action="add-task" data-section-id="${section.id}">+ Dodaj task</button>` : ''}
      </div>
      <div class="project-task-list"></div>
    `;
    const taskList = sectionEl.querySelector('.project-task-list');
    if (sectionTasks.length === 0) {
      taskList.innerHTML = '<div class="text-sm text-slate-500">Nema taskova u ovoj sekciji.</div>';
    } else {
      sectionTasks.forEach(task => {
        taskList.appendChild(buildTaskRow(task));
      });
    }

    const addTaskBtn = sectionEl.querySelector('[data-action="add-task"]');
    if (addTaskBtn) {
      addTaskBtn.addEventListener('click', () => openTaskModal(section.id));
    }
    container.appendChild(sectionEl);
  });
}

function buildTaskRow(task) {
  const row = document.createElement('div');
  row.className = `project-task ${task.is_completed ? 'is-completed opacity-60' : ''} border-b border-gray-100 hover:bg-gray-50 hover:shadow-sm transition-colors duration-150`;
  const assignedUsers = Array.isArray(task.assigned_users) ? task.assigned_users : [];
  const assignedLabel = assignedUsers.length
    ? assignedUsers.map(user => user.full_name || user.username).join(', ')
    : '—';
  const completedText = task.completed_at ? `Završeno: ${formatDateTime(task.completed_at)}` : '';
  row.innerHTML = `
    <label class="project-task-check">
      <input type="checkbox" data-task-id="${task.id}" class="w-4 h-4" ${task.is_completed ? 'checked' : ''} />
    </label>
    <div class="project-task-main">
      <div class="project-task-title text-sm font-medium ${task.is_completed ? 'line-through text-gray-400' : 'text-gray-800'}">
        ${escapeHtml(task.title)}${task.is_completed ? '<span class="ml-2 text-green-500">✓</span>' : ''}
      </div>
      <div class="project-task-meta">
        <span>Dodijeljeno: ${escapeHtml(assignedLabel)}</span>
        ${completedText ? `<span>${completedText}</span>` : ''}
      </div>
    </div>
    <div class="project-task-actions">
      ${isAdminUser ? `
        <button class="icon-btn" title="Uredi dodjele" data-action="edit-assignees">👥</button>
      ` : ''}
    </div>
  `;

  const checkbox = row.querySelector('input[type="checkbox"]');
  checkbox.addEventListener('change', async () => {
    await toggleTaskCompletion(task.id, checkbox.checked);
  });

  const editAssigneesBtn = row.querySelector('[data-action="edit-assignees"]');
  if (editAssigneesBtn) {
    editAssigneesBtn.addEventListener('click', () => {
      openTaskModal(task.project_section_id, task.assigned_users || [], task.id);
    });
  }

  const comments = document.createElement('div');
  comments.className = 'project-task-comments';
  comments.innerHTML = `
    <button type="button" class="project-task-comments-toggle text-slate-500 hover:text-slate-700">💬 Komentari</button>
    <div class="project-task-comments-body d-none">
      <div class="project-task-comments-list"></div>
      <form class="project-task-comment-form">
        <input type="text" class="tw-input" placeholder="Dodaj komentar..." required />
        <button type="submit" class="tw-btn-secondary">Pošalji</button>
      </form>
    </div>
  `;

  const toggleBtn = comments.querySelector('.project-task-comments-toggle');
  const commentsBody = comments.querySelector('.project-task-comments-body');
  const commentsList = comments.querySelector('.project-task-comments-list');
  const commentForm = comments.querySelector('.project-task-comment-form');
  toggleBtn.addEventListener('click', () => {
    commentsBody.classList.toggle('d-none');
  });

  commentForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const input = commentForm.querySelector('input');
    const commentValue = input.value.trim();
    if (!commentValue) return;
    const created = await addComment(task.id, commentValue);
    if (created) {
      appendComment(commentsList, created);
      input.value = '';
    }
  });

  row.appendChild(comments);
  const list = commentsList;
  list.innerHTML = '';
  if (Array.isArray(task.comments) && task.comments.length) {
    task.comments.forEach(comment => appendComment(list, comment));
  } else {
    list.innerHTML = '<div class="text-sm text-slate-500">Nema komentara.</div>';
  }

  return row;
}

function appendComment(container, comment) {
  const item = document.createElement('div');
  item.className = 'project-task-comment';
  const author = comment.user?.full_name || comment.user?.username || 'Korisnik';
  item.innerHTML = `
    <div class="project-task-comment-author">${escapeHtml(author)}</div>
    <div class="project-task-comment-text">${escapeHtml(comment.comment)}</div>
  `;
  container.appendChild(item);
}

async function createSection() {
  const title = document.getElementById('projectSectionTitle').value.trim();
  if (!title) {
    alert('Naziv sekcije je obavezan.');
    return;
  }

  try {
    const res = await fetch(`/api/projects/${currentProjectId}/sections`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Greška pri spremanju sekcije');
    }
    if (typeof window.closeModal === 'function') {
      window.closeModal('projectSectionModal');
    }
    document.getElementById('projectSectionForm').reset();
    await loadProject(currentProjectId);
  } catch (err) {
    console.error(err);
    alert(err.message || 'Greška pri spremanju sekcije.');
  }
}

function openTaskModal(sectionId, assignedUsers = [], taskId = null) {
  const form = document.getElementById('projectTaskForm');
  if (form) form.reset();
  const sectionField = document.getElementById('projectTaskSectionId');
  sectionField.value = sectionId;
  const taskField = document.getElementById('projectTaskId');
  if (taskField) {
    taskField.value = taskId || '';
  }
  const titleInput = document.getElementById('projectTaskTitle');
  const descriptionInput = document.getElementById('projectTaskDescription');
  if (taskId && titleInput && descriptionInput) {
    titleInput.value = '';
    descriptionInput.value = '';
    titleInput.setAttribute('disabled', 'disabled');
    descriptionInput.setAttribute('disabled', 'disabled');
  } else if (titleInput && descriptionInput) {
    titleInput.removeAttribute('disabled');
    descriptionInput.removeAttribute('disabled');
  }
  populateAssigneeOptions(assignedUsers.map(user => user.id));
  if (typeof window.openModal === 'function') {
    window.openModal('projectTaskModal');
  }
}

async function createTask() {
  const sectionId = document.getElementById('projectTaskSectionId').value;
  const title = document.getElementById('projectTaskTitle').value.trim();
  const description = document.getElementById('projectTaskDescription').value.trim();
  const taskId = document.getElementById('projectTaskId')?.value;
  const assignedUserIds = Array.from(document.querySelectorAll('#projectTaskAssignees input[type="checkbox"]:checked'))
    .map(input => Number(input.value))
    .filter(value => Number.isInteger(value));

  if (!title && !taskId) {
    alert('Naziv taska je obavezan.');
    return;
  }

  try {
    console.log('Creating task with payload:', {
      title,
      description: description || null,
      assigned_user_ids: assignedUserIds
    });
    const res = await fetch(taskId ? `/api/projects/project-tasks/${taskId}/assignees` : `/api/projects/project-sections/${sectionId}/tasks`, {
      method: taskId ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(taskId ? {
        assigned_user_ids: assignedUserIds
      } : {
        title,
        description: description || null,
        assigned_user_ids: assignedUserIds
      })
    });
    if (!res.ok) {
      let errMsg = 'Greška pri spremanju taska';
      try {
        const err = await res.json();
        if (err?.error) errMsg = err.error;
      } catch (e) {}
      console.error('Backend response not OK:', res.status);
      throw new Error(errMsg);
    }
    if (typeof window.closeModal === 'function') {
      window.closeModal('projectTaskModal');
    }
    document.getElementById('projectTaskForm').reset();
    const titleInput = document.getElementById('projectTaskTitle');
    const descriptionInput = document.getElementById('projectTaskDescription');
    if (titleInput && descriptionInput) {
      titleInput.removeAttribute('disabled');
      descriptionInput.removeAttribute('disabled');
    }
    await loadProject(currentProjectId);
  } catch (err) {
    console.error(err);
    alert(err.message || 'Greška pri spremanju taska.');
  }
}

async function toggleTaskCompletion(taskId, isCompleted) {
  try {
    const res = await fetch(`/api/projects/project-tasks/${taskId}/complete`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_completed: isCompleted })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Greška pri ažuriranju taska');
    }
    const updated = await res.json().catch(() => null);
    const resolvedCompleted = Boolean(updated?.is_completed ?? isCompleted);
    const resolvedCompletedAt = updated?.completed_at ?? (resolvedCompleted ? new Date().toISOString() : null);

    currentTasks = currentTasks.map(task => (
      task.id === Number(taskId)
        ? { ...task, is_completed: resolvedCompleted, completed_at: resolvedCompletedAt }
        : task
    ));

    renderSections(currentSections, currentTasks);
    updateProjectProgress(currentTasks);
  } catch (err) {
    console.error(err);
    alert(err.message || 'Greška pri ažuriranju taska.');
  }
}

async function addComment(taskId, comment) {
  try {
    const res = await fetch(`/api/projects/project-tasks/${taskId}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ comment })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Greška pri dodavanju komentara');
    }
    const created = await res.json();
    return {
      comment,
      user: projectUsers.find(user => user.id === created.user_id) || null
    };
  } catch (err) {
    console.error(err);
    alert(err.message || 'Greška pri dodavanju komentara.');
    return null;
  }
}

function statusLabel(status) {
  const map = {
    active: 'Aktivan',
    completed: 'Završen',
    archived: 'Arhiviran'
  };
  return map[status] || status || '—';
}

function formatDate(value) {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('hr-HR');
}

function formatDateTime(value) {
  if (!value) return '—';
  const date = new Date(value);
  return `${date.toLocaleDateString('hr-HR')} ${date.toLocaleTimeString('hr-HR')}`;
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
