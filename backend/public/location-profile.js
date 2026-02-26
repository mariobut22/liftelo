document.addEventListener('DOMContentLoaded', () => {
  const params = new URLSearchParams(window.location.search);
  const locationId = params.get('id');

  if (!locationId) {
    alert('Lokacija nije pronađena!');
    return;
  }

  // Dohvati osnovne podatke o lokaciji
  fetch(`/api/locations/${locationId}`)
    .then(res => res.json())
    .then(location => {
      document.getElementById('locationName').textContent = location.name;
      document.getElementById('locationAddress').textContent = location.address;
      document.getElementById('contactPerson').textContent = location.contact_person || '—';
      document.getElementById('contactPhone').textContent = location.contact_phone || '—';
    })
    .catch(err => {
      console.error('Greška pri dohvaćanju lokacije:', err);
    });

  // Dizala
  fetch(`/api/elevators/by-location/${locationId}`)
    .then(res => res.json())
    .then(elevators => {
      const list = document.getElementById('elevatorsList');
      list.innerHTML = '';
      if (elevators.length === 0) {
        list.innerHTML = '<li>Nema dizala za ovu lokaciju.</li>';
      } else {
        elevators.forEach(elevator => {
          const li = document.createElement('li');
          li.textContent = `${elevator.label} (${elevator.serial_number}) – ${elevator.status}`;
          list.appendChild(li);
        });
      }
    });

  // RMS zapisi
  fetch(`/api/rms-visits/location/${locationId}`)
    .then(res => res.json())
    .then(rmsList => {
      const list = document.getElementById('rmsList');
      list.innerHTML = '';
      if (rmsList.length === 0) {
        list.innerHTML = '<li>Nema RMS zapisa za ovu lokaciju.</li>';
      } else {
        rmsList.forEach(rms => {
          const li = document.createElement('li');
          li.innerHTML = `
            📅 ${rms.visit_date || rms.date} – ${rms.user_id || rms.technician || 'Nepoznato'}<br/>
            📝 ${rms.notes_general || rms.notes || 'Bez napomene'}<br/>
            <a href="/api/rms/${rms.id}/pdf" target="_blank">📄 Pregledaj PDF</a>
          `;
          list.appendChild(li);
        });
      }
    });

  // Intervencije
  fetch(`/api/interventions/by-location/${locationId}`)
    .then(res => res.json())
    .then(interventions => {
      const list = document.getElementById('interventionsList');
      list.innerHTML = '';
      if (interventions.length === 0) {
        list.innerHTML = '<li>Nema intervencija za ovu lokaciju.</li>';
      } else {
        interventions.forEach(intv => {
          const li = document.createElement('li');
          li.innerHTML = `
            📅 ${intv.date} – ${intv.technician || 'Nepoznato'}<br/>
            📝 ${intv.notes || 'Bez napomene'}<br/>
            <a href="${intv.pdf_path}" target="_blank">📄 Pregledaj PDF</a>
          `;
          list.appendChild(li);
        });
      }
    });
});
