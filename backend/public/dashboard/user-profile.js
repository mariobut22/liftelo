document.addEventListener("DOMContentLoaded", () => {
  const params = new URLSearchParams(window.location.search);
  const userId = params.get("id");

  if (!userId) {
    alert("Nedostaje ID korisnika u URL-u.");
    return;
  }

  loadUserProfile(userId);
  loadUserStats(userId);
  loadLatestRMS(userId);
  loadLatestInterventions(userId);

  // Povratak
  document.getElementById("back-btn").addEventListener("click", () => {
    window.location.href = "/dashboard/users.html";
  });

  // Reset lozinke
  const resetForm = document.getElementById("reset-password-form");
  if (resetForm) {
    resetForm.addEventListener("submit", async (e) => {
      e.preventDefault();

      const newPassword = document.getElementById("new-password").value;
      if (newPassword.length < 6) {
        alert("Lozinka mora imati barem 6 znakova.");
        return;
      }

      try {
        const response = await fetch(`/api/users/${userId}/password`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ password: newPassword }),
        });

        if (!response.ok) throw new Error("Greška u zahtjevu");

        alert("Lozinka uspješno ažurirana.");
        resetForm.reset();
      } catch (err) {
        console.error("Greška pri resetiranju lozinke", err);
        alert("Greška pri resetiranju lozinke.");
      }
    });
  }

  // Uređivanje korisnika
  const editForm = document.getElementById("edit-user-form");
  if (editForm) {
    editForm.addEventListener("submit", async (e) => {
      e.preventDefault();

      const updatedUser = {
        username: document.getElementById("edit-username").value.trim(),
        full_name: document.getElementById("edit-fullname").value.trim(),
        role: document.getElementById("edit-role").value,
      };

      try {
        const res = await fetch(`/api/users/${userId}`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(updatedUser),
        });

        if (!res.ok) throw new Error("Greška kod uređivanja");

        alert("Korisnik uspješno ažuriran.");
        loadUserProfile(userId); // refresh prikaza
      } catch (err) {
        console.error("Greška pri uređivanju korisnika", err);
        alert("Greška pri uređivanju korisnika.");
      }
    });
  }
});

async function loadUserProfile(id) {
  try {
    const res = await fetch(`/api/users/${id}`);
    if (!res.ok) throw new Error("Korisnik nije pronađen");
    const user = await res.json();

    document.getElementById("profile-name").textContent = user.full_name;
    document.getElementById("profile-username").textContent = user.username;
    document.getElementById("profile-role").textContent = user.role;

    // Ispuni i edit form
    document.getElementById("edit-username").value = user.username;
    document.getElementById("edit-fullname").value = user.full_name;
    document.getElementById("edit-role").value = user.role;
  } catch (err) {
    console.error("Greška pri dohvaćanju korisnika", err);
    alert("Greška pri dohvaćanju korisnika.");
  }
}

async function loadUserStats(id) {
  try {
    const res = await fetch(`/api/users/${id}/stats`);
    if (!res.ok) throw new Error("Greška kod dohvaćanja statistike");
    const stats = await res.json();

    document.getElementById("rms-7").textContent = stats.rms_last_7_days || 0;
    document.getElementById("rms-30").textContent = stats.rms_last_30_days || 0;
    document.getElementById("int-7").textContent = stats.interventions_last_7_days || 0;
    document.getElementById("int-30").textContent = stats.interventions_last_30_days || 0;
  } catch (err) {
    console.error("Greška pri dohvaćanju statistika", err);
    alert("Greška pri dohvaćanju statistika.");
  }
}

async function loadLatestRMS(id) {
  try {
    const res = await fetch(`/api/users/${id}/rms-latest`);
    if (!res.ok) throw new Error("Greška kod RMS");
    const rms = await res.json();

    const rmsList = document.getElementById("rmsList");
    rmsList.innerHTML = "";

    if (!rms || rms.length === 0) {
      rmsList.innerHTML = `<li class="list-group-item text-muted">Nema RMS zapisa.</li>`;
    } else {
      rms.forEach((item) => {
        const li = document.createElement("li");
        li.classList.add("list-group-item");
        li.innerHTML = `📄 RMS #${item.id} | Lift ID: ${item.lift_id} | Datum: ${new Date(item.created_at).toLocaleDateString()}`;
        rmsList.appendChild(li);
      });
    }
  } catch (err) {
    console.error("Greška pri dohvaćanju RMS liste", err);
  }
}

async function loadLatestInterventions(id) {
  try {
    const res = await fetch(`/api/users/${id}/interventions-latest`);
    if (!res.ok) throw new Error("Greška kod intervencija");
    const interventions = await res.json();

    const intList = document.getElementById("interventionList");
    intList.innerHTML = "";

    if (!interventions || interventions.length === 0) {
      intList.innerHTML = `<li class="list-group-item text-muted">Nema intervencija.</li>`;
    } else {
      interventions.forEach((item) => {
        const li = document.createElement("li");
        li.classList.add("list-group-item");
        li.innerHTML = `🛠 Intervencija #${item.id} | Lokacija ID: ${item.location_id} | Datum: ${new Date(item.created_at).toLocaleDateString()}`;
        intList.appendChild(li);
      });
    }
  } catch (err) {
    console.error("Greška pri dohvaćanju intervencija", err);
  }
}
