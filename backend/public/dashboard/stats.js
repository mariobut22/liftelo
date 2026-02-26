const spinner = document.getElementById('spinner');
const hideSpinner = () => {
  if (spinner) {
    spinner.style.display = 'none';
  }
};

const rmsStatsMonth = document.getElementById('rmsStatsMonth');
const rmsStatsYear = document.getElementById('rmsStatsYear');
const rmsTotalLocations = document.getElementById('rmsTotalLocations');
const rmsDoneCount = document.getElementById('rmsDoneCount');
const rmsLateCount = document.getElementById('rmsLateCount');
const rmsMissingCount = document.getElementById('rmsMissingCount');
const rmsCoveragePercent = document.getElementById('rmsCoveragePercent');
const rmsAlertCount = document.getElementById('rmsAlertCount');
const rmsAlertsTableBody = document.querySelector('#rmsAlertsTable tbody');
const monthlyReportBtn = document.getElementById('monthlyReportBtn');

const months = [
  'Siječanj', 'Veljača', 'Ožujak', 'Travanj', 'Svibanj', 'Lipanj',
  'Srpanj', 'Kolovoz', 'Rujan', 'Listopad', 'Studeni', 'Prosinac'
];

const now = new Date();
const currentYear = now.getFullYear();
const currentMonth = now.getMonth() + 1;

const initRmsSelectors = () => {
  if (!rmsStatsMonth || !rmsStatsYear) return;

  months.forEach((label, index) => {
    const option = document.createElement('option');
    const monthValue = index + 1;
    option.value = String(monthValue);
    option.textContent = label;
    if (monthValue === currentMonth) option.selected = true;
    rmsStatsMonth.appendChild(option);
  });

  const range = 5;
  for (let year = currentYear - range; year <= currentYear + range; year += 1) {
    const option = document.createElement('option');
    option.value = String(year);
    option.textContent = String(year);
    if (year === currentYear) option.selected = true;
    rmsStatsYear.appendChild(option);
  }
};

const updateRmsStatsUI = (stats) => {
  if (!stats) return;
  if (rmsTotalLocations) rmsTotalLocations.textContent = stats.total_locations ?? 0;
  if (rmsDoneCount) rmsDoneCount.textContent = stats.done_count ?? 0;
  if (rmsLateCount) rmsLateCount.textContent = stats.late_count ?? 0;
  if (rmsMissingCount) rmsMissingCount.textContent = stats.missing_count ?? 0;
  if (rmsCoveragePercent) rmsCoveragePercent.textContent = `${stats.coverage_percent ?? 0}%`;
};

const formatDate = (dateStr) => {
  if (!dateStr) return '—';
  const parsed = new Date(dateStr);
  if (Number.isNaN(parsed.getTime())) return '—';
  return parsed.toLocaleDateString('hr-HR');
};

const renderRmsAlerts = (alerts) => {
  if (rmsAlertCount) rmsAlertCount.textContent = alerts.length;
  if (!rmsAlertsTableBody) return;

  if (!alerts.length) {
    rmsAlertsTableBody.innerHTML = `
      <tr>
        <td colspan="3" class="text-muted">Nema alert lokacija za odabrani period.</td>
      </tr>
    `;
    return;
  }

  rmsAlertsTableBody.innerHTML = '';
  alerts.forEach(alert => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>
        <a href="/dashboard/location-profile.html?id=${alert.location_id}" class="text-slate-900 fw-semibold text-decoration-none">
          ${alert.location_name}
        </a>
      </td>
      <td>${alert.consecutive_missing_months}</td>
      <td>${alert.last_rms_visit_date ? formatDate(alert.last_rms_visit_date) : '—'}</td>
    `;

    tr.addEventListener('click', (event) => {
      if (event.target.tagName.toLowerCase() === 'a') return;
      window.location.href = `/dashboard/location-profile.html?id=${alert.location_id}`;
    });

    tr.style.cursor = 'pointer';
    rmsAlertsTableBody.appendChild(tr);
  });
};

const fetchRmsAlerts = () => {
  if (!rmsStatsMonth || !rmsStatsYear) return Promise.resolve();
  const year = Number(rmsStatsYear.value);
  const month = Number(rmsStatsMonth.value);

  return fetch(`/api/stats/rms-alerts?year=${year}&month=${month}`)
    .then(res => res.json())
    .then(data => {
      if (!Array.isArray(data)) {
        renderRmsAlerts([]);
        return;
      }
      renderRmsAlerts(data);
    })
    .catch(err => {
      console.error('Greška pri dohvaćanju RMS alerta:', err);
      renderRmsAlerts([]);
    });
};

const fetchRmsStats = () => {
  if (!rmsStatsMonth || !rmsStatsYear) return Promise.resolve();
  const year = Number(rmsStatsYear.value);
  const month = Number(rmsStatsMonth.value);

  return fetch(`/api/stats/rms?year=${year}&month=${month}`)
    .then(res => res.json())
    .then(updateRmsStatsUI)
    .catch(err => {
      console.error('Greška pri dohvaćanju RMS statistike:', err);
      updateRmsStatsUI({
        total_locations: 0,
        done_count: 0,
        late_count: 0,
        missing_count: 0,
        coverage_percent: 0
      });
    });
};

if (rmsStatsMonth && rmsStatsYear) {
  initRmsSelectors();
  rmsStatsMonth.addEventListener('change', () => {
    fetchRmsStats();
    fetchRmsAlerts();
  });
  rmsStatsYear.addEventListener('change', () => {
    fetchRmsStats();
    fetchRmsAlerts();
  });
}

if (monthlyReportBtn && rmsStatsMonth && rmsStatsYear) {
  monthlyReportBtn.addEventListener('click', () => {
    const year = rmsStatsYear.value;
    const month = rmsStatsMonth.value;
    window.location.href = `/api/export/monthly-report.pdf?year=${year}&month=${month}`;
  });
}

// Dohvati ukupnu statistiku i prikaži brojeve
const statsRequest = fetch('/api/stats')
  .then(res => res.json())
  .then(data => {
    document.getElementById('userCount').innerText = data.users ?? 0;
    document.getElementById('locationCount').innerText = data.locations ?? 0;
    document.getElementById('rmsCount').innerText = data.rms ?? 0;
    document.getElementById('interventionCount').innerText = data.interventions ?? 0;
  })
  .catch(err => {
    console.error('Greška pri dohvaćanju statistike:', err);
  });

fetch('/api/users/session')
  .then(res => res.ok ? res.json() : null)
  .then(session => {
    const isAdmin = session?.user?.role === 'admin';
    if (isAdmin) return;
    document.querySelectorAll('[data-admin-only]').forEach(el => el.remove());
  })
  .catch(() => {
    document.querySelectorAll('[data-admin-only]').forEach(el => el.remove());
  });

const rmsStatsRequest = fetchRmsStats();
const rmsAlertsRequest = fetchRmsAlerts();

// Dohvati dnevne statistike i prikaži graf
const dailyRequest = fetch('/api/stats/daily')
  .then(res => res.json())
  .then(data => {
    const ctx = document.getElementById('activityChart').getContext('2d');
    new Chart(ctx, {
      type: 'bar',
      data: {
        labels: data.map(row => row.date),
        datasets: [
          {
            label: 'RMS',
            data: data.map(row => row.rms_count),
            backgroundColor: 'rgba(54, 162, 235, 0.7)',
          },
          {
            label: 'Intervencije',
            data: data.map(row => row.intervention_count),
            backgroundColor: 'rgba(255, 99, 132, 0.7)',
          }
        ]
      },
      options: {
        responsive: true,
        plugins: {
          legend: {
            position: 'top'
          }
        },
        scales: {
          x: {
            stacked: true
          },
          y: {
            beginAtZero: true,
            stacked: true
          }
        }
      }
    });
  })
  .catch(err => {
    console.error('Greška pri dohvaćanju podataka za graf:', err);
  });

Promise.allSettled([statsRequest, rmsStatsRequest, rmsAlertsRequest, dailyRequest]).then(hideSpinner);
