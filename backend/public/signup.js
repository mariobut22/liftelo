document.getElementById('signup-form')?.addEventListener('submit', async (event) => {
  event.preventDefault();

  const company_name = document.getElementById('company_name')?.value.trim();
  const full_name = document.getElementById('full_name')?.value.trim();
  const username = document.getElementById('username')?.value.trim();
  const password = document.getElementById('password')?.value;
  const messageEl = document.getElementById('poruka');

  if (messageEl) messageEl.textContent = '';

  try {
    const res = await fetch('/api/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ company_name, full_name, username, password })
    });

    const data = await res.json();

    if (!res.ok) {
      if (messageEl) messageEl.textContent = data.error || 'Greška pri registraciji.';
      return;
    }

    window.location.href = data.redirect || '/dashboard/stats.html';
  } catch (err) {
    if (messageEl) messageEl.textContent = 'Greška pri spajanju na server.';
  }
});
