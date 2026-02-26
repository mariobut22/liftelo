document.addEventListener('DOMContentLoaded', () => {
  const monthSelect = document.getElementById('overviewMonth');
  const yearSelect = document.getElementById('overviewYear');
  const form = document.getElementById('rmsOverviewForm');
  const tableBody = document.querySelector('#rms-overview-table tbody');
  const emptyState = document.getElementById('rmsOverviewEmptyState');
  const loadingState = document.getElementById('rmsOverviewLoading');
  const tableWrapper = document.querySelector('#rms-overview-table')?.closest('.overflow-x-auto');

  if (!monthSelect || !yearSelect || !form || !tableBody) {
    return;
  }

  const months = [
    'Siječanj', 'Veljača', 'Ožujak', 'Travanj', 'Svibanj', 'Lipanj',
    'Srpanj', 'Kolovoz', 'Rujan', 'Listopad', 'Studeni', 'Prosinac'
  ];

  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;

  const yearRange = 5;
  for (let y = currentYear - yearRange; y <= currentYear + yearRange; y += 1) {
    const option = document.createElement('option');
    option.value = String(y);
    option.textContent = String(y);
    if (y === currentYear) {
      option.selected = true;
    }
    yearSelect.appendChild(option);
  }

  months.forEach((label, index) => {
    const option = document.createElement('option');
    const monthValue = index + 1;
    option.value = String(monthValue);
    option.textContent = label;
    if (monthValue === currentMonth) {
      option.selected = true;
    }
    monthSelect.appendChild(option);
  });

  const formatDate = (isoDate) => {
    if (!isoDate) return '—';
    const dateObj = new Date(isoDate);
    if (Number.isNaN(dateObj.getTime())) return '—';
    return dateObj.toLocaleDateString('hr-HR');
  };

  const getStatusBadge = (status) => {
    if (status === 'done') {
      return '<span class="tw-badge-ok">Odrađen</span>';
    }
    if (status === 'late') {
      return '<span class="tw-badge-warning">Zakašnjelo</span>';
    }
    if (status === 'na') {
      return '<span class="tw-badge-na">N/A</span>';
    }
    return '<span class="tw-badge-danger">Nedostaje</span>';
  };

  const renderRows = (rows) => {
    tableBody.innerHTML = '';

    if (!rows.length) {
      if (emptyState) emptyState.classList.remove('d-none');
      if (loadingState) loadingState.classList.add('d-none');
      if (tableWrapper) tableWrapper.classList.add('d-none');
      return;
    }

    if (emptyState) emptyState.classList.add('d-none');
    if (loadingState) loadingState.classList.add('d-none');
    if (tableWrapper) tableWrapper.classList.remove('d-none');

    rows.forEach(row => {
      const tr = document.createElement('tr');
      const status = row.expected
        ? (row.has_rms ? 'done' : (row.next_has_rms ? 'late' : 'missing'))
        : 'na';

      if (status === 'missing') {
        tr.classList.add('bg-red-50');
      }
      if (status === 'late') {
        tr.classList.add('bg-yellow-50');
      }
      if (status === 'na') {
        tr.classList.add('bg-slate-50');
      }

      const statusHtml = getStatusBadge(status);
      const displayDate = status === 'na'
        ? null
        : (row.has_rms ? row.last_rms_visit_date : (row.next_last_rms_visit_date || null));
      const lastDate = formatDate(displayDate);

      tr.innerHTML = `
        <td class="py-3 pr-4">
          <a href="/dashboard/location-profile.html?id=${row.location_id}" class="text-slate-900 font-semibold hover:text-blue-600">
            ${row.location_name}
          </a>
        </td>
        <td class="py-3 pr-4">${statusHtml}</td>
        <td class="py-3">${lastDate}</td>
      `;

      tr.addEventListener('click', (event) => {
        if (event.target.tagName.toLowerCase() === 'a') return;
        window.location.href = `/dashboard/location-profile.html?id=${row.location_id}`;
      });

      tr.style.cursor = 'pointer';
      tableBody.appendChild(tr);
    });
  };

  const loadOverview = async () => {
    const year = Number(yearSelect.value);
    const month = Number(monthSelect.value);

    if (loadingState) loadingState.classList.remove('d-none');
    if (emptyState) emptyState.classList.add('d-none');
    if (tableWrapper) tableWrapper.classList.add('d-none');

    try {
      const res = await fetch(`/api/rms/monthly-overview?year=${year}&month=${month}`);
      if (!res.ok) {
        throw new Error('Failed to fetch overview');
      }
      const data = await res.json();
      if (!Array.isArray(data)) {
        throw new Error('Unexpected response');
      }
      renderRows(data);
    } catch (err) {
      console.error('Greška kod učitavanja RMS pregleda:', err);
      tableBody.innerHTML = '';
      if (loadingState) loadingState.classList.add('d-none');
      if (emptyState) {
        emptyState.classList.remove('d-none');
        emptyState.querySelector('h4').textContent = 'Greška pri dohvaćanju pregleda';
        emptyState.querySelector('p').textContent = 'Pokušaj ponovno ili provjeri vezu.';
      }
    }
  };

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    loadOverview();
  });

  loadOverview();
});
