document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('setPasswordForm');
  const params = new URLSearchParams(window.location.search);
  const token = params.get('token');

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const newPassword = document.getElementById('newPassword').value.trim();
    const confirmPassword = document.getElementById('confirmPassword').value.trim();

    if (!token) {
      alert('Nedostaje token pozivnice.');
      return;
    }

    if (newPassword.length < 8) {
      alert('Lozinka mora imati najmanje 8 znakova.');
      return;
    }

    if (newPassword !== confirmPassword) {
      alert('Lozinke se ne podudaraju.');
      return;
    }

    const res = await fetch('/api/auth/set-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, password: newPassword })
    });

    const result = await res.json();
    if (res.ok) {
      alert('Lozinka je postavljena. Prijavite se.');
      window.location.href = '/login.html';
      return;
    }

    alert(result.error || 'Greška pri postavljanju lozinke.');
  });
});
