document.addEventListener('DOMContentLoaded', () => {
  const userName = document.getElementById('homeUserName');
  const userRmsCount = document.getElementById('homeUserRmsCount');
  const userInterventionCount = document.getElementById('homeUserInterventionCount');
  const rmsExpected = document.getElementById('homeRmsExpected');
  const rmsDone = document.getElementById('homeRmsDone');
  const rmsLate = document.getElementById('homeRmsLate');
  const rmsMissing = document.getElementById('homeRmsMissing');
  const rmsCoverageValue = document.getElementById('homeRmsCoverageValue');
  const rmsCoverageFill = document.getElementById('homeRmsCoverageFill');
  const missingCount = document.getElementById('homeMissingCount');
  const missingTableBody = document.querySelector('#homeMissingTable tbody');
  const alertBanner = document.getElementById('homeAlertBanner');
  const emptyState = document.getElementById('homeEmptyState');
  const missingSection = document.getElementById('homeMissingSection');
  const workOrdersSection = document.getElementById('homeWorkOrdersSection');
  const workOrdersCount = document.getElementById('homeWorkOrdersCount');
  const workOrdersTableBody = document.querySelector('#homeWorkOrdersTable tbody');
  const notificationsBanner = document.getElementById('homeNotificationsBanner');
  const notificationsText = document.getElementById('homeNotificationsText');
  const vehiclesBanner = document.getElementById('homeVehiclesBanner');
  const vehiclesBannerTitle = document.getElementById('homeVehiclesBannerTitle');
  const vehiclesBannerText = document.getElementById('homeVehiclesBannerText');
  const vehiclesSection = document.getElementById('homeVehiclesSection');
  const vehiclesTableBody = document.querySelector('#homeVehiclesTable tbody');

  const renderMissingLocations = (locations) => {
    if (!missingTableBody) return;
    if (!locations.length) {
      missingTableBody.innerHTML = '<tr><td class="text-muted">Nema lokacija bez RMS-a za ovaj mjesec.</td></tr>';
      if (missingCount) missingCount.textContent = '0 lokacija';
      return;
    }

    missingTableBody.innerHTML = '';
    locations.forEach(loc => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>
          <a href="/dashboard/location-profile.html?id=${loc.id}" class="text-slate-900 fw-semibold text-decoration-none">
            ${loc.name}
          </a>
        </td>
      `;
      tr.addEventListener('click', (event) => {
        if (event.target.tagName.toLowerCase() === 'a') return;
        window.location.href = `/dashboard/location-profile.html?id=${loc.id}`;
      });
      tr.style.cursor = 'pointer';
      missingTableBody.appendChild(tr);
    });

    if (missingCount) {
      const label = locations.length === 1 ? '1 lokacija' : `${locations.length} lokacija`;
      missingCount.textContent = label;
    }
  };

  const renderWorkOrders = (workOrders, totalCount) => {
    if (!workOrdersSection || !workOrdersTableBody) return;
    if (!Array.isArray(workOrders) || workOrders.length === 0) {
      workOrdersSection.classList.add('d-none');
      return;
    }

    workOrdersSection.classList.remove('d-none');
    workOrdersTableBody.innerHTML = '';

    workOrders.forEach(order => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>
          <a href="/dashboard/work-order-detail.html?id=${order.id}" class="text-slate-900 fw-semibold text-decoration-none">
            ${order.location_name || '—'}
          </a>
        </td>
        <td>${order.due_date ? new Date(order.due_date).toLocaleDateString('hr-HR') : '—'}</td>
      `;
      tr.addEventListener('click', (event) => {
        if (event.target.tagName.toLowerCase() === 'a') return;
        window.location.href = `/dashboard/work-order-detail.html?id=${order.id}`;
      });
      tr.style.cursor = 'pointer';
      workOrdersTableBody.appendChild(tr);
    });

    if (workOrdersCount) {
      const label = totalCount === 1 ? '1 nalog' : `${totalCount} naloga`;
      workOrdersCount.textContent = label;
    }
  };

  const updateNotificationsBanner = (notifications) => {
    if (!notificationsBanner || !notificationsText) return;

    const hasAlerts = Boolean(notifications?.has_rms_alerts);
    const overdueCount = notifications?.overdue_work_orders_count ?? 0;
    const coverageLow = Boolean(notifications?.rms_coverage_low);

    const messages = [];
    let href = '/dashboard/home.html';

    if (hasAlerts) {
      messages.push('RMS alerti zahtijevaju pažnju');
      href = '/dashboard/rms-overview.html';
    }

    if (overdueCount > 0) {
      messages.push(`Prekoračeni radni nalozi: ${overdueCount}`);
      if (!hasAlerts) {
        href = '/dashboard/work-orders.html';
      }
    }

    if (coverageLow) {
      messages.push('RMS pokrivenost je ispod 80%');
      if (!hasAlerts && overdueCount === 0) {
        href = '/dashboard/rms-overview.html';
      }
    }

    if (messages.length === 0) {
      notificationsBanner.classList.add('d-none');
      return;
    }

    notificationsBanner.classList.remove('d-none');
    notificationsBanner.href = href;
    notificationsText.textContent = messages.join(' · ');
  };

  const updateAlertBanner = (count) => {
    if (!alertBanner) return;
    if (count > 0) {
      alertBanner.classList.remove('d-none');
    } else {
      alertBanner.classList.add('d-none');
    }
  };

  const renderVehicles = (vehicles) => {
    if (!vehiclesSection || !vehiclesTableBody) return;
    if (!Array.isArray(vehicles) || vehicles.length === 0) {
      vehiclesSection.classList.add('d-none');
      if (vehiclesBanner) vehiclesBanner.classList.add('d-none');
      return;
    }

    vehiclesSection.classList.remove('d-none');
    vehiclesTableBody.innerHTML = '';

    vehicles.forEach(vehicle => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${vehicle.name || '—'}</td>
        <td>${vehicle.registration_expiry_date ? new Date(vehicle.registration_expiry_date).toLocaleDateString('hr-HR') : '—'}</td>
      `;
      tr.addEventListener('click', () => {
        window.location.href = '/dashboard/vehicles.html';
      });
      tr.style.cursor = 'pointer';
      vehiclesTableBody.appendChild(tr);
    });

    if (vehiclesBanner && vehiclesBannerText) {
      const count = vehicles.length;
      const label = count === 1 ? '1 vozilo' : `${count} vozila`;
      vehiclesBanner.classList.remove('d-none');
      if (vehiclesBannerTitle) {
        vehiclesBannerTitle.textContent = `⚠️ ${label} uskoro ističe registracija`;
      }
      vehiclesBannerText.textContent = vehicles.map(item => item.name).join(' · ');
    }
  };

  const updateEmptyState = (missingCountValue, alertCountValue) => {
    const shouldShowEmpty = missingCountValue === 0 && alertCountValue === 0;
    if (emptyState) {
      emptyState.classList.toggle('d-none', !shouldShowEmpty);
    }
    if (missingSection) {
      missingSection.classList.toggle('d-none', shouldShowEmpty);
    }
  };

  fetch('/api/home/summary')
    .then(res => res.json())
    .then(data => {
      if (userName) userName.textContent = data.user?.name || '—';
      if (userRmsCount) userRmsCount.textContent = data.user_stats?.rms_count ?? 0;
      if (userInterventionCount) userInterventionCount.textContent = data.user_stats?.intervention_count ?? 0;
      const expectedValue = data.rms_summary?.expected ?? 0;
      const doneValue = data.rms_summary?.done ?? 0;
      const lateValue = data.rms_summary?.late ?? 0;
      const missingValue = data.rms_summary?.missing ?? 0;

      if (rmsExpected) rmsExpected.textContent = expectedValue;
      if (rmsDone) rmsDone.textContent = doneValue;
      if (rmsLate) rmsLate.textContent = lateValue;
      if (rmsMissing) rmsMissing.textContent = missingValue;

      const coveragePercent = expectedValue > 0
        ? Math.round((doneValue / expectedValue) * 100)
        : 0;

      if (rmsCoverageValue) rmsCoverageValue.textContent = `${coveragePercent}%`;
      if (rmsCoverageFill) rmsCoverageFill.style.width = `${coveragePercent}%`;

      const missingLocations = Array.isArray(data.rms_missing_locations) ? data.rms_missing_locations : [];
      const missingCountValue = missingValue;
      const alertCountValue = data.alerts?.count ?? 0;
      const workOrders = Array.isArray(data.work_orders?.items) ? data.work_orders.items : [];
      const workOrdersCountValue = data.work_orders?.open_assigned_count ?? 0;
      const vehicles = Array.isArray(data.vehicles?.expiring_soon_list) ? data.vehicles.expiring_soon_list : [];

      renderMissingLocations(missingLocations);
      renderWorkOrders(workOrders, workOrdersCountValue);
      renderVehicles(vehicles);
      updateNotificationsBanner(data.notifications || {});
      updateAlertBanner(alertCountValue);
      updateEmptyState(missingCountValue, alertCountValue);
    })
    .catch(err => {
      console.error('Greška pri dohvaćanju home summary:', err);
      renderMissingLocations([]);
      renderWorkOrders([], 0);
      renderVehicles([]);
      updateNotificationsBanner({});
      updateAlertBanner(0);
      updateEmptyState(0, 0);
      if (rmsCoverageValue) rmsCoverageValue.textContent = '0%';
      if (rmsCoverageFill) rmsCoverageFill.style.width = '0%';
    });
});
