document.addEventListener("DOMContentLoaded", () => {
  const existingHeader = document.querySelector("header");
  if (existingHeader) {
    existingHeader.remove();
  }

  const pageTitle = document.body.dataset.pageTitle || document.querySelector('h1')?.textContent || document.title;
  const sessionRole = document.body.dataset.userRole || 'admin';
  const isAdmin = sessionRole === 'admin';

  const appShell = document.createElement('div');
  appShell.className = 'app-shell min-h-screen bg-slate-100 grid grid-cols-[250px_1fr]';
  appShell.innerHTML = `
    <aside class="sidebar bg-slate-900 text-white px-4 py-6">
      <div class="sidebar-brand">
        <a href="/dashboard/stats.html" class="logo text-white text-lg font-semibold">Liftelo</a>
      </div>
      <nav class="sidebar-nav" id="navMenu">
        <div class="sidebar-group">
          <div class="sidebar-group-title">RMS</div>
          <a class="sidebar-link flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-300 hover:text-white hover:bg-slate-800/50" data-route="/dashboard/home.html" href="/dashboard/home.html">
            <i class="bi bi-house"></i>
            <span>Početna</span>
          </a>
          <a class="sidebar-link flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-300 hover:text-white hover:bg-slate-800/50" data-route="/dashboard/rms.html" href="/dashboard/rms.html" data-nav-rms>
            <i class="bi bi-clipboard-check"></i>
            <span>RMS zapisi</span>
            <span class="ml-auto inline-flex items-center rounded-full bg-amber-500 px-2 py-0.5 text-[10px] font-semibold text-white d-none" data-nav-badge="rms">!</span>
          </a>
          <a class="sidebar-link flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-300 hover:text-white hover:bg-slate-800/50" data-route="/dashboard/rms-overview.html" href="/dashboard/rms-overview.html">
            <i class="bi bi-clipboard-data"></i>
            <span>RMS pregled</span>
          </a>
          <a class="sidebar-link flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-300 hover:text-white hover:bg-slate-800/50" data-route="/dashboard/interventions.html" href="/dashboard/interventions.html">
            <i class="bi bi-wrench"></i>
            <span>Intervencije</span>
          </a>
          <a class="sidebar-link flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-300 hover:text-white hover:bg-slate-800/50" data-route="/dashboard/work-orders.html" href="/dashboard/work-orders.html" data-nav-work-orders>
            <i class="bi bi-clipboard"></i>
            <span>Radni nalozi</span>
            <span class="ml-auto inline-flex items-center rounded-full bg-rose-500 px-2 py-0.5 text-[10px] font-semibold text-white d-none" data-nav-badge="work-orders">!</span>
          </a>
        </div>
        <div class="sidebar-group">
          <div class="sidebar-group-title">Users</div>
          <a class="sidebar-link flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-300 hover:text-white hover:bg-slate-800/50" data-route="/dashboard/users.html" href="/dashboard/users.html">
            <i class="bi bi-people"></i>
            <span>Korisnici</span>
          </a>
          ${isAdmin ? `
          <a class="sidebar-link flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-300 hover:text-white hover:bg-slate-800/50" data-route="/dashboard/vehicles.html" href="/dashboard/vehicles.html">
            <i class="bi bi-truck"></i>
            <span>Moja vozila</span>
          </a>
          ` : ''}
          <a class="sidebar-link flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-300 hover:text-white hover:bg-slate-800/50" data-route="/dashboard/company.html" href="/dashboard/company.html">
            <i class="bi bi-building"></i>
            <span>Tvrtka</span>
          </a>
          <a class="sidebar-link flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-300 hover:text-white hover:bg-slate-800/50" data-route="/dashboard/user-profile.html" href="/dashboard/user-profile.html">
            <i class="bi bi-person"></i>
            <span>Profil</span>
          </a>
        </div>
        <div class="sidebar-group">
          <div class="sidebar-group-title">System</div>
          <a class="sidebar-link flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-300 hover:text-white hover:bg-slate-800/50" data-route="/dashboard/projects.html" href="/dashboard/projects.html">
            <i class="bi bi-kanban"></i>
            <span>Projekti</span>
          </a>
          <a class="sidebar-link flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-300 hover:text-white hover:bg-slate-800/50" data-route="/dashboard/locations.html" href="/dashboard/locations.html">
            <i class="bi bi-geo"></i>
            <span>Lokacije</span>
          </a>
          <a class="sidebar-link flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-300 hover:text-white hover:bg-slate-800/50" data-route="/dashboard/stats.html" href="/dashboard/stats.html">
            <i class="bi bi-bar-chart"></i>
            <span>Statistika</span>
          </a>
          <a class="sidebar-link flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-300 hover:text-white hover:bg-slate-800/50" href="/logout">
            <i class="bi bi-box-arrow-right"></i>
            <span>Logout</span>
          </a>
        </div>
      </nav>
    </aside>
    <div class="main-area min-h-screen bg-slate-100">
      <button class="hamburger" type="button" aria-label="Otvori izbornik">☰</button>
      <header class="topbar bg-white border-b border-slate-200 px-6 h-16 flex items-center justify-between">
        <div class="page-title text-lg font-semibold text-slate-900">${pageTitle}</div>
        <div class="user-info text-sm text-slate-500">Administrator</div>
      </header>
      <main class="content p-6 lg:p-8"></main>
    </div>
  `;

  const bodyChildren = Array.from(document.body.children).filter(child => child.tagName !== 'SCRIPT');
  const content = appShell.querySelector('.content');
  bodyChildren.forEach(child => {
    if (!child.classList.contains('floating-btn-wrapper') && child !== appShell) {
      content.appendChild(child);
    }
  });

  document.body.prepend(appShell);

  if (!document.querySelector('link[data-icons="bootstrap-icons"]')) {
    const iconLink = document.createElement('link');
    iconLink.rel = 'stylesheet';
    iconLink.href = 'https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.css';
    iconLink.dataset.icons = 'bootstrap-icons';
    document.head.appendChild(iconLink);
  }

  // Hamburger toggle za mobile
  const burger = document.querySelector('.hamburger');
  const nav = document.getElementById('navMenu');

  if (burger && nav) {
    burger.addEventListener('click', () => {
      nav.classList.toggle('active');
      const sidebar = document.querySelector('.sidebar');
      if (sidebar) {
        sidebar.classList.toggle('active');
      }
    });
  }

  const currentPath = window.location.pathname;
  document.querySelectorAll('.sidebar-link[data-route]').forEach(link => {
    const route = link.getAttribute('data-route');
    if (currentPath === route) {
      link.classList.add('is-active');
    }
  });

  const updateNavBadges = async () => {
    const rmsBadge = document.querySelector('[data-nav-badge="rms"]');
    const workOrdersBadge = document.querySelector('[data-nav-badge="work-orders"]');
    try {
      const res = await fetch('/api/home/summary');
      if (!res.ok) return;
      const data = await res.json();
      const hasRmsAlerts = Boolean(data.notifications?.has_rms_alerts);
      const overdueCount = data.notifications?.overdue_work_orders_count ?? 0;

      if (rmsBadge) {
        rmsBadge.classList.toggle('d-none', !hasRmsAlerts);
      }
      if (workOrdersBadge) {
        workOrdersBadge.classList.toggle('d-none', overdueCount <= 0);
        if (overdueCount > 0) {
          workOrdersBadge.textContent = overdueCount > 9 ? '9+' : String(overdueCount);
        }
      }
    } catch (err) {
      console.warn('Neuspjelo dohvaćanje notifikacija:', err);
    }
  };

  updateNavBadges();

  // ✅ Dodaj floating FAB (jedini)
  const fabWrapper = document.createElement('div');
  fabWrapper.className = 'floating-btn-wrapper';

  fabWrapper.innerHTML = `
    <button class="floating-btn" id="mainFab">＋</button>
    <div class="fab-options" id="fabOptions">
      <a href="#" class="fab-option" data-modal-target="rmsModal">➕ Novi RMS</a>
      <a href="#" class="fab-option" data-modal-target="interventionModal">➕ Nova intervencija</a>
    </div>
  `;

  document.body.appendChild(fabWrapper);

  const mainFab = document.getElementById('mainFab');
  const fabOptions = document.getElementById('fabOptions');

  mainFab.addEventListener('click', () => {
    fabOptions.classList.toggle('show');
  });

  fabOptions.querySelectorAll('[data-modal-target]').forEach((link) => {
    link.addEventListener('click', (event) => {
      event.preventDefault();
      const modalId = link.getAttribute('data-modal-target');
      if (modalId && typeof window.openModal === 'function') {
        window.openModal(modalId);
      }
      fabOptions.classList.remove('show');
    });
  });

  const ensureModal = (id, html) => {
    if (!document.getElementById(id)) {
      document.body.insertAdjacentHTML('beforeend', html);
    }
  };

  const locationModalHtml = `
    <div id="locationModal" class="fixed inset-0 z-50 hidden flex items-center justify-center p-4 sm:p-6" data-modal-open="false">
      <div class="absolute inset-0 bg-black/40" data-modal-overlay="true" data-modal-id="locationModal"></div>
      <div class="relative bg-white w-full max-w-2xl sm:rounded-2xl shadow-xl h-full sm:h-auto sm:max-h-[85vh] overflow-hidden flex flex-col min-h-0">
        <header class="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <h5 class="text-lg font-semibold text-slate-900">Nova lokacija</h5>
          <button type="button" class="text-slate-400 hover:text-slate-600" onclick="closeModal('locationModal')" aria-label="Close">✕</button>
        </header>
        <div class="modal-body p-6">
          <form id="locationCreateForm" class="space-y-3">
            <div>
              <label class="form-label">Naziv lokacije</label>
              <input type="text" name="name" class="tw-input" required />
            </div>
            <div>
              <label class="form-label">Adresa</label>
              <input type="text" name="address" class="tw-input" required />
            </div>
            <div>
              <label class="form-label">Kontakt osoba</label>
              <input type="text" name="contact_person" class="tw-input" />
            </div>
            <div>
              <label class="form-label">Telefon</label>
              <input type="text" name="contact_phone" class="tw-input" />
            </div>
            <div class="flex items-center justify-end gap-2 pt-2">
              <button type="button" class="tw-btn-secondary" onclick="closeModal('locationModal')">Odustani</button>
              <button type="submit" class="tw-btn-primary">Spremi</button>
            </div>
          </form>
        </div>
      </div>
    </div>
  `;

  const rmsModalHtml = `
    <div id="rmsModal" class="fixed inset-0 z-50 hidden flex items-center justify-center p-4 sm:p-6" data-modal-open="false">
      <div class="absolute inset-0 bg-black/40" data-modal-overlay="true" data-modal-id="rmsModal"></div>
      <div class="relative bg-white w-full max-w-2xl sm:rounded-2xl shadow-xl h-full sm:h-auto sm:max-h-[85vh] overflow-hidden flex flex-col min-h-0">
        <header class="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <h5 class="text-lg font-semibold text-slate-900" id="rmsModalLabel">Novi RMS zapis</h5>
          <button type="button" class="text-slate-400 hover:text-slate-600" onclick="closeModal('rmsModal')" aria-label="Close">✕</button>
        </header>
        <div class="modal-body">
          <form id="rmsForm" class="space-y-3">
            <div id="rmsSuccessBanner" class="alert alert-success d-none" role="alert">
              ✅ RMS zapis je uspješno spremljen.
            </div>
            <div class="mb-3">
              <label class="form-label">👤 Serviser (automatski):</label>
              <input type="text" id="technician" name="technician" readonly class="tw-input" />
            </div>

            <div class="mb-3">
              <label class="form-label">👥 Drugi serviser (opcionalno):</label>
              <input type="text" id="secondTechnician" name="secondTechnician" list="techniciansList" class="tw-input" placeholder="Upiši ili odaberi iz liste..." />
              <datalist id="techniciansList"></datalist>
            </div>

            <div class="mb-3">
              <label class="form-label">📍 Adresa (lokacija):</label>
              <input type="text" id="address" name="address" list="locationsList" class="tw-input" placeholder="Upiši ili odaberi iz liste..." />
              <datalist id="locationsList"></datalist>
              <ul id="locationSuggestions" class="list-group mt-2" style="position: absolute; z-index: 1000; max-width: 500px;"></ul>
            </div>

            <div class="mb-3">
              <label class="form-label">📅 RMS Period (npr. 01/26 za siječanj 2026):</label>
              <input type="text" id="rms_period" name="rms_period" class="tw-input" placeholder="01/26" />
              <small class="form-text text-muted">Format: MM/GG (npr. 01/26, 02/26, itd.)</small>
            </div>

            <div class="mb-3">
              <label class="form-label">🗓️ Ovaj RMS pokriva mjesec (opcionalno):</label>
              <input type="text" id="rms_attributed_month" name="rms_attributed_month" class="tw-input" placeholder="MM/GGGG (npr. 01/2026)" />
              <small class="form-text text-muted">Ako je RMS odrađen kasnije, upiši mjesec koji pokriva.</small>
            </div>

            <h3 class="mt-4">✔️ Stanje komponenti</h3>

            <div class="component-check component-header">
              <div>Komponenta</div>
              <div>RADI</div>
              <div>NE RADI</div>
              <div>Komentar</div>
            </div>

            <div class="check-row component-check" data-label="Zabrave">
              <div>Zabrave</div>
              <div><input type="radio" name="Zabrave_status" value="radi"></div>
              <div><input type="radio" name="Zabrave_status" value="ne_radi"></div>
              <div><input type="text" name="Zabrave_comment" placeholder="Komentar" class="tw-input" /></div>
            </div>

            <div class="check-row component-check" data-label="Diktatori">
              <div>Diktatori</div>
              <div><input type="radio" name="Diktatori_status" value="radi"></div>
              <div><input type="radio" name="Diktatori_status" value="ne_radi"></div>
              <div><input type="text" name="Diktatori_comment" placeholder="Komentar" class="tw-input" /></div>
            </div>

            <div class="check-row component-check" data-label="Motor">
              <div>Motor</div>
              <div><input type="radio" name="Motor_status" value="radi"></div>
              <div><input type="radio" name="Motor_status" value="ne_radi"></div>
              <div><input type="text" name="Motor_comment" placeholder="Komentar" class="tw-input" /></div>
            </div>

            <div class="check-row component-check" data-label="Strojarnica">
              <div>Strojarnica</div>
              <div><input type="radio" name="Strojarnica_status" value="radi"></div>
              <div><input type="radio" name="Strojarnica_status" value="ne_radi"></div>
              <div><input type="text" name="Strojarnica_comment" placeholder="Komentar" class="tw-input" /></div>
            </div>

            <div class="check-row component-check" data-label="Osvjetljenje">
              <div>Osvjetljenje</div>
              <div><input type="radio" name="Osvjetljenje_status" value="radi"></div>
              <div><input type="radio" name="Osvjetljenje_status" value="ne_radi"></div>
              <div><input type="text" name="Osvjetljenje_comment" placeholder="Komentar" class="tw-input" /></div>
            </div>

            <div class="check-row component-check" data-label="Vrata kabine">
              <div>Vrata kabine</div>
              <div><input type="radio" name="Vrata kabine_status" value="radi"></div>
              <div><input type="radio" name="Vrata kabine_status" value="ne_radi"></div>
              <div><input type="text" name="Vrata kabine_comment" placeholder="Komentar" class="tw-input" /></div>
            </div>

            <div class="mb-3 mt-4">
              <label class="form-label">📝 Opći komentar:</label>
              <textarea name="notes" rows="4" class="tw-input"></textarea>
            </div>

            <div class="mb-3">
              <label class="form-label">🏢 Dizala u zgradi (stavke):</label>
              <div id="rmsItemsList" class="mt-3 space-y-2"></div>
            </div>

            <div class="mb-3">
              <label class="form-label">📄 Status:</label>
              <select name="status" class="tw-input" required>
                <option value="O.K." selected>O.K.</option>
                <option value="Potreban popravak - Dizalo u funkciji">Potreban popravak - Dizalo u funkciji</option>
                <option value="Potreban popravak - Dizalo nije u funkciji">Potreban popravak - Dizalo nije u funkciji</option>
              </select>
            </div>

            <div class="mb-3">
              <label class="form-label">📸 Priloži fotografije / dokumente:</label>
              <input type="file" name="attachments" multiple class="tw-input" />
            </div>

            <div class="mb-3">
              <label class="form-label">📅 Datum:</label>
              <input type="date" name="date" required class="tw-input" />
            </div>

            <div class="d-flex justify-content-end gap-2">
              <button type="button" class="tw-btn-secondary" onclick="closeModal('rmsModal')">Odustani</button>
              <button type="submit" class="tw-btn-primary">💾 Spremi RMS</button>
            </div>
          </form>
        </div>
        <footer class="p-4 border-t flex justify-end gap-2 sm:hidden">
          <button type="button" class="tw-btn-secondary" onclick="closeModal('rmsModal')">Odustani</button>
          <button type="submit" class="tw-btn-primary" form="rmsForm">💾 Spremi RMS</button>
        </footer>
      </div>
    </div>
  `;

  const interventionModalHtml = `
    <div class="fixed inset-0 z-50 hidden flex items-center justify-center p-4 sm:p-6" id="interventionModal" data-modal-open="false">
      <div class="absolute inset-0 bg-black/40" data-modal-overlay="true" data-modal-id="interventionModal"></div>
      <div class="relative bg-white w-full max-w-2xl sm:rounded-2xl shadow-xl h-full sm:h-auto sm:max-h-[85vh] overflow-hidden flex flex-col min-h-0">
        <header class="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <h5 class="text-lg font-semibold text-slate-900" id="interventionModalLabel">🚨 Nova intervencija</h5>
          <button type="button" class="text-slate-400 hover:text-slate-600" onclick="closeModal('interventionModal')" aria-label="Close">✕</button>
        </header>
        <div class="modal-body">
          <form id="interventionForm" enctype="multipart/form-data" class="space-y-4">
            <div id="interventionSuccessBanner" class="alert alert-success d-none" role="alert">
              ✅ Intervencija je uspješno spremljena.
            </div>
            <div class="row mb-3">
              <div class="col-md-6">
                <label for="technician" class="form-label">👤 Serviser (automatski):</label>
                <input type="text" id="technician" name="technician" class="tw-input" readonly />
              </div>
              <div class="col-md-6">
                <label for="second_technician" class="form-label">👥 Drugi serviser (opcionalno):</label>
                <input type="text" id="second_technician" name="second_technician" list="techniciansList" class="tw-input" placeholder="Upiši ili odaberi iz liste..." />
                <datalist id="techniciansList"></datalist>
              </div>
            </div>

            <div class="mb-3">
              <label for="location" class="form-label">📍 Lokacija (zgrada):</label>
              <input type="text" id="location" name="location" autocomplete="off" list="interventionLocationsList" class="tw-input" />
              <datalist id="interventionLocationsList"></datalist>
              <ul id="locationSuggestions" class="list-group"></ul>
            </div>

            <div class="mb-3">
              <label for="notes" class="form-label">📝 Opis / Komentar:</label>
              <textarea id="notes" name="notes" rows="4" class="tw-input"></textarea>
            </div>

            <div class="mb-3">
              <label class="form-label">🏢 Dizala u zgradi (stavke):</label>
              <div id="interventionItemsList" class="mt-3 space-y-2"></div>
            </div>

            <div class="mb-3">
              <label for="images" class="form-label">📸 Priloži slike (opcionalno):</label>
              <input type="file" name="images" id="images" multiple class="tw-input" />
              <div class="image-preview mt-2" id="imagePreview"></div>
            </div>

            <div class="mb-3">
              <label for="date" class="form-label">📅 Datum intervencije:</label>
              <input type="date" id="date" name="date" class="tw-input" />
            </div>

            <div class="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button type="button" class="tw-btn-secondary" onclick="closeModal('interventionModal')">Odustani</button>
              <button type="submit" class="tw-btn-primary">📤 Pošalji intervenciju</button>
            </div>
          </form>
        </div>
        <footer class="p-4 border-t flex justify-end gap-2 sm:hidden">
          <button type="button" class="tw-btn-secondary" onclick="closeModal('interventionModal')">Odustani</button>
          <button type="submit" class="tw-btn-primary" form="interventionForm">📤 Pošalji intervenciju</button>
        </footer>
      </div>
    </div>
  `;

  ensureModal('locationModal', locationModalHtml);
  ensureModal('rmsModal', rmsModalHtml);
  ensureModal('interventionModal', interventionModalHtml);

  const locationForm = document.getElementById('locationCreateForm');
  if (locationForm) {
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
      } catch (err) {
        console.error('Greška pri spremanju lokacije:', err);
      }
    });
  }

  const ensureScript = (src, onload) => {
    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing) {
      if (onload) onload();
      return;
    }
    const script = document.createElement('script');
    script.src = src;
    if (onload) {
      script.addEventListener('load', onload);
    }
    document.body.appendChild(script);
  };

  ensureScript('/dashboard/js/modal.js');
  ensureScript('/dashboard/rms-create.js', () => {
    if (typeof window.initRmsModal === 'function') {
      window.initRmsModal();
    }
  });
  ensureScript('/dashboard/intervention-create.js', () => {
    if (typeof window.initInterventionModal === 'function') {
      window.initInterventionModal();
    }
  });

  if (typeof window.initRmsModal === 'function') {
    window.initRmsModal();
  }
  if (typeof window.initInterventionModal === 'function') {
    window.initInterventionModal();
  }

  // Zatvori kada klikneš izvan menija
  document.addEventListener('click', (e) => {
    if (!fabWrapper.contains(e.target)) {
      fabOptions.classList.remove('show');
    }
  });
});

function toggleMenu() {
  const nav = document.getElementById("navMenu");
  if (nav) {
    nav.classList.toggle("active");
  }
}
function fetchUserFromSession() {
  fetch('/login/check', {
    method: 'GET',
    credentials: 'include'
  })
    .then(res => {
      if (!res.ok) throw new Error('Nije prijavljen');
      return res.json();
    })
    .then(data => {
      const user = data.user;
      document.querySelector("#username").textContent = user.full_name;
      // ...ili upiši u dropdown, header itd.
    })
    .catch(() => {
      window.location.href = "/login";
    });
}
// Provjera je li korisnik prijavljen
fetch('/login/check', {
  method: 'GET',
  credentials: 'include'
})
.then(res => {
  if (!res.ok) {
    window.location.href = '/login'; // nije prijavljen
  }
});
