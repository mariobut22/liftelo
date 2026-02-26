document.addEventListener('DOMContentLoaded', () => {
  fetch('/api/users/session')
    .then(res => res.json())
    .then(data => {
      if (!data.loggedIn) {
        alert("Niste prijavljeni.");
        window.location.href = '/login.html';
        return;
      }

      const user = data.user;
      document.getElementById('username').value = user.username;
      document.getElementById('full_name').value = user.full_name;
      document.getElementById('role').value = user.role;
    });

  const form = document.getElementById('password-form');

  form.addEventListener('submit', async e => {
    e.preventDefault();

    const currentPassword = document.getElementById('currentPassword').value.trim();
    const newPassword = document.getElementById('newPassword').value.trim();
    const confirmPassword = document.getElementById('confirmPassword').value.trim();

    if (newPassword !== confirmPassword) {
      return alert("Nove lozinke se ne podudaraju.");
    }

    if (newPassword.length < 8) {
      return alert('Lozinka mora imati najmanje 8 znakova.');
    }

    const res = await fetch('/api/users/me/password', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentPassword, newPassword })
    });

    const result = await res.json();

    if (res.ok) {
      alert("✅ Lozinka je uspješno promijenjena.");
      form.reset();
    } else {
      alert("❌ Greška: " + result.error);
    }
  });
});
