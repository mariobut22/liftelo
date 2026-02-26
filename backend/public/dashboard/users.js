document.addEventListener("DOMContentLoaded", () => {
  initUsersPage();
});

async function initUsersPage() {
  const session = await fetchSession();
  const isAdmin = session?.user?.role === 'admin';
  applyRoleUI(isAdmin);
  loadUsers(isAdmin);
  setupForm(isAdmin);
  setupAddModal(isAdmin);
}

function fetchSession() {
  return fetch('/api/users/session')
    .then(res => res.ok ? res.json() : null)
    .catch(() => null);
}

function applyRoleUI(isAdmin) {
  if (isAdmin) return;
  document.querySelectorAll('[data-admin-only]').forEach(el => {
    el.remove();
  });
}

// 🔄 Dohvati i prikaži korisnike
function loadUsers(isAdmin) {
  fetch('/api/users')
    .then(res => res.json())
    .then(users => {
      const tbody = document.querySelector("#users-table tbody");
      tbody.innerHTML = "";

      users.forEach(user => {
        const isDisabled = Boolean(user.disabled_at);
        const tr = document.createElement("tr");
        const actions = isAdmin
          ? `
              <div class="users-actions">
                <a href="/dashboard/user-profile.html?id=${user.id}" class="btn btn-sm btn-info">Više</a>
                <button class="btn btn-sm btn-warning disable-btn" data-id="${user.id}" ${isDisabled ? 'disabled' : ''}>
                  Deaktiviraj
                </button>
              </div>
            `
          : `
              <div class="users-actions">
                <a href="/dashboard/user-profile.html?id=${user.id}" class="btn btn-sm btn-info">Više</a>
              </div>
            `;

        tr.innerHTML = `
          <td>${user.full_name || ''}</td>
          <td>${user.username}</td>
          <td>${user.role}</td>
          <td>
            <span class="badge ${isDisabled ? 'bg-secondary' : 'bg-success'}">
              ${isDisabled ? 'Disabled' : 'Active'}
            </span>
          </td>
          <td>
            ${actions}
          </td>
        `;

        tbody.appendChild(tr);
      });

      if (isAdmin) {
        setupActions();
      }
    })
    .catch(err => {
      console.error("❌ Greška pri dohvaćanju korisnika:", err);
      alert("Greška pri dohvaćanju korisnika.");
    });
}

// 🧾 Uredi + Obriši funkcije
function setupActions() {
  // Deaktiviraj korisnika
  document.querySelectorAll(".disable-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.id;
      if (confirm("Jeste li sigurni da želite deaktivirati korisnika?")) {
        fetch(`/api/users/${id}/disable`, {
          method: 'POST'
        })
          .then(res => {
            if (!res.ok) throw new Error("Greška pri deaktivaciji");
            loadUsers();
          })
          .catch(err => {
            console.error("❌ Deaktivacija korisnika neuspješna:", err);
            alert("Greška pri deaktivaciji korisnika.");
          });
      }
    });
  });
}

// ➕ Dodaj novog korisnika
function setupForm(isAdmin) {
  if (!isAdmin) return;
  const form = document.querySelector("#newUserForm");
  if (!form) return;
  form.addEventListener("submit", e => {
    e.preventDefault();

    const username = document.querySelector("#username").value;
    const full_name = document.querySelector("#fullname").value;
    const password = document.querySelector("#password").value;
    const role = document.querySelector("#role").value;

    if (password.length < 6) {
      alert("Lozinka mora imati najmanje 6 znakova.");
      return;
    }

    fetch('/api/users', {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, full_name, role })
    })
      .then(res => {
        if (!res.ok) throw new Error("Greška pri dodavanju korisnika");
        return res.json();
      })
      .then((data) => {
        document.querySelector("#newUserForm").reset();
        if (typeof window.closeModal === 'function') {
          window.closeModal('addUserModal');
        }
        if (data?.invite_link) {
          showInviteLink(data.invite_link);
        }
        loadUsers(isAdmin);
      })
      .catch(err => {
        console.error("❌ Greška pri dodavanju korisnika:", err);
        alert("Greška pri dodavanju korisnika.");
      });
  });
}

function setupAddModal(isAdmin) {
  if (!isAdmin) return;
  const addBtn = document.getElementById('openAddUser');
  if (!addBtn) return;
  addBtn.addEventListener('click', () => {
    if (typeof window.openModal === 'function') {
      window.openModal('addUserModal');
    }
  });
}

function showInviteLink(inviteLink) {
  const container = document.getElementById('inviteLinkContainer');
  const input = document.getElementById('inviteLinkInput');
  if (!container || !input) return;
  input.value = `${window.location.origin}${inviteLink}`;
  container.classList.remove('d-none');
  if (typeof window.openModal === 'function') {
    window.openModal('inviteLinkModal');
  } else {
    alert(`Invite link: ${input.value}`);
  }
}
