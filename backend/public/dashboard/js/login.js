document.getElementById('login-form').addEventListener('submit', async function (e) {
  e.preventDefault();

  const username = document.getElementById('username').value.trim();
  const password = document.getElementById('password').value.trim();

  if (!username || !password) {
    alert("Molimo unesite korisničko ime i lozinku.");
    return;
  }

  try {
    const response = await fetch('/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ username, password })
    });

    const data = await response.json();

    if (response.ok) {
      window.location.href = data.redirect;
    } else {
      alert(data.error || "Greška pri prijavi.");
    }
  } catch (err) {
    console.error("Greška:", err);
    alert("Dogodila se greška pri spajanju na server.");
  }
});
