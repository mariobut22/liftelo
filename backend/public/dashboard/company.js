document.addEventListener('DOMContentLoaded', () => {
  Promise.all([
    fetch('/api/company').then(res => {
      if (!res.ok) throw new Error('Greška pri dohvaćanju tvrtke');
      return res.json();
    }),
    fetch('/api/users/session').then(res => res.ok ? res.json() : { loggedIn: false })
  ])
    .then(([company, session]) => {
      const nameEl = document.getElementById('companyName');
      const idEl = document.getElementById('companyId');
      const createdEl = document.getElementById('companyCreated');

      if (nameEl) nameEl.textContent = company.name || '—';
      if (idEl) idEl.textContent = company.id ?? '—';

      if (createdEl) {
        const createdAt = company.created_at ? new Date(company.created_at) : null;
        createdEl.textContent = createdAt
          ? createdAt.toLocaleDateString('hr-HR')
          : '—';
      }

      const isAdmin = session?.user?.role === 'admin';
      const logoForm = document.getElementById('companyLogoForm');
      if (logoForm) {
        logoForm.classList.toggle('d-none', !isAdmin);
      }

      renderLogo(company.logo_path);
      bindLogoUpload();
    })
    .catch(err => {
      console.error('❌ Greška pri dohvaćanju tvrtke:', err);
    });
});

function renderLogo(path) {
  const img = document.getElementById('companyLogoImage');
  const placeholder = document.getElementById('companyLogoPlaceholder');
  if (!img || !placeholder) return;

  if (path) {
    img.src = `${path}?v=${Date.now()}`;
    img.classList.remove('d-none');
    placeholder.classList.add('d-none');
  } else {
    img.classList.add('d-none');
    placeholder.classList.remove('d-none');
  }
}

function bindLogoUpload() {
  const form = document.getElementById('companyLogoForm');
  const input = document.getElementById('companyLogoInput');
  const message = document.getElementById('companyLogoMessage');
  if (!form || !input) return;

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!input.files || !input.files[0]) {
      if (message) {
        message.textContent = 'Odaberi logo datoteku.';
        message.className = 'mt-2 text-sm text-rose-600';
      }
      return;
    }

    const formData = new FormData();
    formData.append('logo', input.files[0]);

    try {
      const res = await fetch('/api/company/logo', {
        method: 'POST',
        body: formData
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || 'Greška pri uploadu logotipa');
      }

      if (message) {
        message.textContent = 'Logo je uspješno spremljen.';
        message.className = 'mt-2 text-sm text-emerald-600';
      }
      input.value = '';
      renderLogo(data.path);
    } catch (err) {
      if (message) {
        message.textContent = err.message || 'Greška pri uploadu logotipa.';
        message.className = 'mt-2 text-sm text-rose-600';
      }
    }
  });
}
