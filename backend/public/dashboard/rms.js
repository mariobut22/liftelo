document.addEventListener("DOMContentLoaded", () => {
  loadRMS();

  const filterForm = document.getElementById("filter-form");
  if (filterForm) {
    filterForm.addEventListener("submit", (e) => {
      e.preventDefault();
      loadRMS();
    });
  }

  const rmsForm = document.getElementById("rms-form");
  if (rmsForm) {
    rmsForm.addEventListener("submit", async (e) => {
      e.preventDefault();

      const formData = new FormData(rmsForm);

      try {
        const res = await fetch("/api/rms", {
          method: "POST",
          body: formData
        });

        if (res.ok) {
          alert("✅ RMS zapis uspješno dodan.");
          rmsForm.reset();
          loadRMS();
        } else {
          const err = await res.json();
          alert("❌ Greška: " + err.error);
        }
      } catch (err) {
        console.error("Greška kod slanja RMS zapisa:", err);
        alert("❌ Greška kod slanja RMS zapisa.");
      }
    });
  }
});

// ✅ Dohvat RMS zapisa s filterom
async function loadRMS() {
  const form = document.getElementById("filter-form");
  if (!form) return;

  const data = {
    type: "rms",
    date_from: form.date_from.value,
    date_to: form.date_to.value,
    technician: form.technician.value,
    status: form.status.value
  };

  try {
    const res = await fetch("/api/records/filter", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(data)
    });

    const result = await res.json();

    if (!Array.isArray(result)) {
      console.error("Neočekivan odgovor od servera:", result);
      alert("Greška kod dohvaćanja RMS zapisa.");
      return;
    }

    const tbody = document.querySelector("#rms-table tbody");
    tbody.innerHTML = "";

    const emptyState = document.getElementById('rms-empty-state');
    const tableWrapper = document.querySelector('#rms-table')?.closest('.table-responsive');

    if (result.length === 0) {
      if (emptyState) emptyState.classList.remove('d-none');
      if (tableWrapper) tableWrapper.classList.add('d-none');

      const hasLocations = await fetch('/api/locations')
        .then(res => res.json())
        .then(rows => Array.isArray(rows) && rows.length > 0)
        .catch(() => false);

      if (emptyState && !hasLocations) {
        emptyState.querySelector('p').textContent = 'Najprije dodaj lokaciju, zatim možeš dodati prvi RMS zapis.';
        const button = emptyState.querySelector('button');
        if (button) {
          button.textContent = '➕ Dodaj prvu lokaciju';
          button.setAttribute('data-modal-target', 'locationModal');
        }
      }
      return;
    }

    if (emptyState) emptyState.classList.add('d-none');
    if (tableWrapper) tableWrapper.classList.remove('d-none');

    result.forEach(r => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${r.id}</td>
        <td>${r.date}</td>
        <td><strong>${r.document_name || "-"}</strong></td>
        <td>${r.location_name || "-"}</td>
        <td>${r.elevator_label || "-"}</td>
        <td>${r.technician || '-'}</td>
        <td>-</td>
        <td>
          <a href="/api/rms/${r.id}/pdf" target="_blank" class="btn btn-sm btn-outline-primary">View PDF</a>
        </td>
      `;
      tbody.appendChild(tr);
    });
  } catch (err) {
    alert("Greška kod učitavanja RMS zapisa");
    console.error(err);
  }
}

// ✅ Export u CSV
function exportCSV(type) {
  window.location.href = `/export/${type}`;
}
