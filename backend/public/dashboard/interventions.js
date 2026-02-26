document.addEventListener("DOMContentLoaded", () => {
  loadInterventions();

  const filterForm = document.getElementById("filter-form");
  if (filterForm) {
    filterForm.addEventListener("submit", (e) => {
      e.preventDefault();
      loadInterventions();
    });
  }

  const interventionForm = document.getElementById("intervention-form");
  if (interventionForm) {
    interventionForm.addEventListener("submit", async (e) => {
      e.preventDefault();

      const formData = new FormData(interventionForm);

      try {
        const res = await fetch("/api/interventions", {
          method: "POST",
          body: formData
        });

        if (res.ok) {
          alert("✅ Intervencija dodana.");
          interventionForm.reset();
          loadInterventions();
        } else {
          const err = await res.json();
          alert("❌ Greška: " + err.error);
        }
      } catch (err) {
        console.error("Greška kod slanja intervencije:", err);
        alert("❌ Greška kod slanja.");
      }
    });
  }
});

// ✅ Dohvat svih intervencija s filtrima
async function loadInterventions() {
  const form = document.getElementById("filter-form");
  if (!form) return;

  const data = {
    type: "intervencija",
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
      alert("Greška kod dohvaćanja intervencija.");
      return;
    }

    const tbody = document.querySelector("#interventions-table tbody");
    tbody.innerHTML = "";

    const emptyState = document.getElementById('interventions-empty-state');
    const tableWrapper = document.querySelector('#interventions-table')?.closest('.table-responsive');

    if (result.length === 0) {
      if (emptyState) emptyState.classList.remove('d-none');
      if (tableWrapper) tableWrapper.classList.add('d-none');

      const hasLocations = await fetch('/api/locations')
        .then(res => res.json())
        .then(rows => Array.isArray(rows) && rows.length > 0)
        .catch(() => false);

      if (emptyState && !hasLocations) {
        emptyState.querySelector('p').textContent = 'Najprije dodaj lokaciju, zatim možeš dodati prvu intervenciju.';
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

    const getStatusBadge = (status) => {
      if (!status) return "-";
      if (status === "O.K.") {
        return `<span class="tw-badge-ok">${status}</span>`;
      }
      if (status === "Potreban popravak - Dizalo u funkciji") {
        return `<span class="tw-badge-warning">${status}</span>`;
      }
      if (status === "Potreban popravak - Dizalo nije u funkciji") {
        return `<span class="tw-badge-danger">${status}</span>`;
      }
      return status;
    };

    const buildStatusSelect = (status, id) => `
      <select class="form-select form-select-sm status-select" data-id="${id}" data-type="interventions">
        <option value="O.K." ${status === 'O.K.' ? 'selected' : ''}>O.K.</option>
        <option value="Potreban popravak - Dizalo u funkciji" ${status === 'Potreban popravak - Dizalo u funkciji' ? 'selected' : ''}>Potreban popravak - Dizalo u funkciji</option>
        <option value="Potreban popravak - Dizalo nije u funkciji" ${status === 'Potreban popravak - Dizalo nije u funkciji' ? 'selected' : ''}>Potreban popravak - Dizalo nije u funkciji</option>
      </select>
    `;

    const buildElevatorCell = (record) => {
      if (Array.isArray(record.items) && record.items.length > 0) {
        return record.items
          .map(item => {
            const label = item.elevator_label || '-';
            const comment = item.comment ? ` – ${item.comment}` : '';
            return `<div>${label}${comment}</div>`;
          })
          .join('');
      }
      return record.elevator_label || '-';
    };

    result.forEach(r => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${r.id}</td>
        <td>${r.date}</td>
        <td><strong>${r.document_name || "-"}</strong></td>
        <td>${r.location_name || "-"}</td>
        <td>${buildElevatorCell(r)}</td>
        <td>${r.technician}</td>
        <td>
          <div class="flex flex-col gap-2">
            ${getStatusBadge(r.status)}
            ${buildStatusSelect(r.status, r.id)}
          </div>
        </td>
        <td>
          <a href="/api/interventions/${r.id}/pdf" target="_blank" class="btn btn-sm btn-outline-primary">View PDF</a>
        </td>
      `;
      tbody.appendChild(tr);
    });

    tbody.querySelectorAll('.status-select').forEach(select => {
      select.addEventListener('change', async (event) => {
        const target = event.currentTarget;
        const id = target.dataset.id;
        const status = target.value;
        try {
          const res = await fetch(`/api/interventions/${id}/status`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status })
          });
          if (!res.ok) {
            const err = await res.json();
            throw new Error(err.error || 'Greška kod ažuriranja statusa');
          }
          const wrapper = target.closest('td');
          if (wrapper) {
            const badge = wrapper.querySelector('.tw-badge-ok, .tw-badge-warning, .tw-badge-danger');
            if (badge) {
              badge.outerHTML = getStatusBadge(status);
            } else {
              wrapper.insertAdjacentHTML('afterbegin', getStatusBadge(status));
            }
          }
        } catch (err) {
          alert(err.message || 'Greška kod ažuriranja statusa');
          console.error(err);
        }
      });
    });
  } catch (err) {
    alert("Greška kod učitavanja intervencija");
    console.error(err);
  }
}

// ✅ CSV export
function exportCSV(type) {
  window.location.href = `/export/${type}`;
}
