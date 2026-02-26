const express = require('express');
const router = express.Router();
const db = require('../db');
const { geocodeAddress } = require('../utils/geocoding');
const { isRmsExpected } = require('../utils/rms-expectations');

// Dohvati sve lokacije
router.get('/', async (req, res) => {
  try {
    const companyId = req.companyId;
    const [results] = await db.query(
      `SELECT id, name, address, latitude, longitude, contact_person, contact_phone, notes,
              rms_frequency, company_id, upravitelj, kljuc_strojarnice
       FROM locations
       WHERE company_id = ?`,
      [companyId]
    );
    res.json(results);
  } catch (err) {
    console.error('Greška pri dohvaćanju lokacija:', err);
    res.status(500).json({ error: 'Greška pri dohvaćanju lokacija' });
  }
});

// ✅ Nova ruta: Lokacije s posljednjom aktivnošću (RMS ili Intervencija)
// VAŽNO: Ova ruta mora biti PRIJE /:id rute
router.get('/with-last-activity', async (req, res) => {
  const companyId = req.companyId;
  const sql = `
    SELECT l.id,
           l.name,
           l.address,
           l.latitude,
           l.longitude,
           MAX(activity.date) AS last_activity,
           GROUP_CONCAT(
             DISTINCT CONCAT_WS(' ',
               e.label,
               e.serial_number,
               e.control_group_type,
               e.cabin_door_type,
               e.lock_type,
               e.machine_room_key,
               e.comment
             ) SEPARATOR ' | '
           ) AS elevator_search
    FROM locations l
    LEFT JOIN elevators e
      ON e.location_id = l.id
     AND e.company_id = ?
    LEFT JOIN (
      SELECT location_id, visit_date AS date
      FROM rms_visits
      WHERE company_id = ?
      UNION ALL
      SELECT location_id, date
      FROM interventions
      WHERE company_id = ?
    ) AS activity ON l.id = activity.location_id
    WHERE l.company_id = ?
    GROUP BY l.id
    ORDER BY l.address ASC
  `;

  try {
    const [results] = await db.query(sql, [companyId, companyId, companyId, companyId]);
    if (!results.length) {
      return res.json([]);
    }

    const locationIds = results.map(row => row.id);
    // NOTE:
    // Current elevator status is derived by merging
    // the latest RMS visit per location and the latest
    // intervention per location. Intervention overwrites RMS.
    // This is a UI-only summary and does NOT strictly compare
    // created_at across sources.
    const [latestVisits] = await db.query(
      `SELECT v.id, v.location_id
       FROM rms_visits v
       INNER JOIN (
          SELECT location_id, MAX(created_at) AS max_created_at
          FROM rms_visits
          WHERE company_id = ?
          GROUP BY location_id
        ) latest
          ON latest.location_id = v.location_id
         AND latest.max_created_at = v.created_at
       WHERE v.location_id IN (${locationIds.map(() => '?').join(',')})
         AND v.company_id = ?`,
      [companyId, ...locationIds, companyId]
    );

    const visitByLocation = latestVisits.reduce((acc, row) => {
      if (!acc[row.location_id]) {
        acc[row.location_id] = row.id;
      }
      return acc;
    }, {});

    const rmsVisitIds = Object.values(visitByLocation);
    let rmsItemsByVisit = {};

    if (rmsVisitIds.length) {
      const [items] = await db.query(
        `SELECT visit_id, elevator_label, status
         FROM rms_visit_items
         WHERE visit_id IN (${rmsVisitIds.map(() => '?').join(',')})
           AND company_id = ?`,
        [...rmsVisitIds, companyId]
      );

      rmsItemsByVisit = items.reduce((acc, item) => {
        acc[item.visit_id] = acc[item.visit_id] || [];
        acc[item.visit_id].push({
          elevator_label: item.elevator_label,
          status: item.status,
          source: 'rms'
        });
        return acc;
      }, {});
    }

    const [latestInterventions] = await db.query(
      `SELECT i.id, i.location_id
       FROM interventions i
       INNER JOIN (
          SELECT location_id, MAX(created_at) AS max_created_at
          FROM interventions
          WHERE company_id = ?
          GROUP BY location_id
        ) latest
          ON latest.location_id = i.location_id
         AND latest.max_created_at = i.created_at
       WHERE i.location_id IN (${locationIds.map(() => '?').join(',')})
         AND i.company_id = ?`,
      [companyId, ...locationIds, companyId]
    );

    const interventionByLocation = latestInterventions.reduce((acc, row) => {
      if (!acc[row.location_id]) {
        acc[row.location_id] = row.id;
      }
      return acc;
    }, {});

    const interventionIds = Object.values(interventionByLocation);
    let interventionItemsByIntervention = {};

    if (interventionIds.length) {
      const [items] = await db.query(
        `SELECT intervention_id, elevator_label, status
         FROM intervention_items
         WHERE intervention_id IN (${interventionIds.map(() => '?').join(',')})
           AND company_id = ?`,
        [...interventionIds, companyId]
      );

      interventionItemsByIntervention = items.reduce((acc, item) => {
        acc[item.intervention_id] = acc[item.intervention_id] || [];
        acc[item.intervention_id].push({
          elevator_label: item.elevator_label,
          status: item.status,
          source: 'intervention'
        });
        return acc;
      }, {});
    }

    const payload = results.map(row => {
      const rmsItems = rmsItemsByVisit[visitByLocation[row.id]] || [];
      const interventionItems = interventionItemsByIntervention[interventionByLocation[row.id]] || [];

      const combined = new Map();
      rmsItems.forEach(item => {
        combined.set(item.elevator_label, item);
      });
      interventionItems.forEach(item => {
        combined.set(item.elevator_label, item);
      });

      return {
        ...row,
        elevator_statuses: Array.from(combined.values())
      };
    });

    res.json(payload);
  } catch (err) {
    console.error('Greška u dohvaćanju lokacija s aktivnostima:', err);
    res.status(500).json({ error: 'Greška u dohvaćanju aktivnosti' });
  }
});

// ✅ Dohvati dizala za lokaciju
router.get('/:id/elevators', async (req, res) => {
  const locationId = req.params.id;
  try {
    const companyId = req.companyId;
    const [rows] = await db.query(
      'SELECT * FROM elevators WHERE location_id = ? AND company_id = ? ORDER BY label ASC',
      [locationId, companyId]
    );
    res.json(rows);
  } catch (err) {
    console.error('Greška pri dohvaćanju dizala:', err);
    res.status(500).json({ error: 'Greška pri dohvaćanju dizala' });
  }
});

// ✅ Dodaj dizalo za lokaciju
router.post('/:id/elevators', async (req, res) => {
  const locationId = req.params.id;
  const {
    label,
    serial_number,
    control_group_type,
    cabin_door_type,
    lock_type,
    machine_room_key,
    comment
  } = req.body;
  if (!label) return res.status(400).json({ error: 'Label je obavezna' });
  try {
    const companyId = req.companyId;
    await db.query(
      `INSERT INTO elevators (
        location_id,
        company_id,
        label,
        serial_number,
        control_group_type,
        cabin_door_type,
        lock_type,
        machine_room_key,
        comment
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ,
      [
        locationId,
        companyId,
        label,
        serial_number || null,
        control_group_type || null,
        cabin_door_type || null,
        lock_type || null,
        machine_room_key || null,
        comment || null
      ]
    );
    res.status(201).json({ message: 'Dizalo dodano' });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'Dizalo s tim labelom već postoji' });
    }
    console.error('Greška pri dodavanju dizala:', err);
    res.status(500).json({ error: 'Greška pri dodavanju dizala' });
  }
});

// Dodaj novu lokaciju
router.post('/', async (req, res) => {
  const { name, address, contact_person, contact_phone, upravitelj, kljuc_strojarnice } = req.body;

  try {
    let latitude = null;
    let longitude = null;

    const trimmedUpravitelj = typeof upravitelj === 'string' ? upravitelj.trim() : null;
    const trimmedKljuc = typeof kljuc_strojarnice === 'string' ? kljuc_strojarnice.trim() : null;

    // Pokušaj geocodirati adresu
    if (address) {
      try {
        const coords = await geocodeAddress(address);
        latitude = coords.lat;
        longitude = coords.lng;
        console.log(`✅ Geocoded: ${address} -> ${latitude}, ${longitude}`);
      } catch (geocodeErr) {
        console.warn('⚠️ Geocoding nije uspio:', geocodeErr.message);
        // Nastavi bez koordinata
      }
    }

    const companyId = req.companyId;
    const [result] = await db.query(
      'INSERT INTO locations (name, address, latitude, longitude, contact_person, contact_phone, company_id, upravitelj, kljuc_strojarnice) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [
        name,
        address,
        latitude,
        longitude,
        contact_person,
        contact_phone,
        companyId,
        trimmedUpravitelj || null,
        trimmedKljuc || null
      ]
    );
    res.status(201).json({ id: result.insertId, latitude, longitude });
  } catch (err) {
    console.error('Greška pri dodavanju lokacije:', err);
    res.status(500).json({ error: 'Greška pri dodavanju lokacije' });
  }
});

// Ažuriraj lokaciju
router.put('/:id', async (req, res) => {
  const { name, address, contact_person, contact_phone, notes, rms_frequency, upravitelj, kljuc_strojarnice } = req.body;

  const parsedFrequency = Number(rms_frequency);
  if (rms_frequency !== undefined && (![1, 2, 3].includes(parsedFrequency))) {
    return res.status(400).json({ error: 'Invalid rms_frequency' });
  }

  const trimmedUpravitelj = typeof upravitelj === 'string' ? upravitelj.trim() : null;
  const trimmedKljuc = typeof kljuc_strojarnice === 'string' ? kljuc_strojarnice.trim() : null;

  try {
    // Ako se adresa promijenila, pokušaj geocodirati novu adresu
    let latitude = null;
    let longitude = null;

    if (address) {
      try {
        const coords = await geocodeAddress(address);
        latitude = coords.lat;
        longitude = coords.lng;
        console.log(`✅ Geocoded updated address: ${address} -> ${latitude}, ${longitude}`);
      } catch (geocodeErr) {
        console.warn('⚠️ Geocoding nije uspio za novu adresu:', geocodeErr.message);
      }
    }

    await db.query(
      'UPDATE locations SET name = ?, address = ?, latitude = ?, longitude = ?, contact_person = ?, contact_phone = ?, notes = ?, rms_frequency = COALESCE(?, rms_frequency), upravitelj = ?, kljuc_strojarnice = ? WHERE id = ? AND company_id = ?',
      [
        name,
        address,
        latitude,
        longitude,
        contact_person,
        contact_phone,
        notes,
        rms_frequency ?? null,
        trimmedUpravitelj || null,
        trimmedKljuc || null,
        req.params.id,
        req.companyId
      ]
    );
    res.json({ message: 'Lokacija ažurirana' });
  } catch (err) {
    console.error('Greška pri ažuriranju lokacije:', err);
    res.status(500).json({ error: 'Greška pri ažuriranju lokacije' });
  }
});

// Obriši lokaciju
router.delete('/:id', async (req, res) => {
  try {
    await db.query('DELETE FROM locations WHERE id = ?', [req.params.id]);
    res.json({ message: 'Lokacija obrisana' });
  } catch (err) {
    console.error('Greška pri brisanju lokacije:', err);
    res.status(500).json({ error: 'Greška pri brisanju lokacije' });
  }
});

// Dohvati profil lokacije (info, dizala, RMS, intervencije)
router.get('/:id/profile', async (req, res) => {
  const locationId = req.params.id;

  try {
    const companyId = req.companyId;
    const [locResults] = await db.query(
      'SELECT * FROM locations WHERE id = ? AND company_id = ?',
      [locationId, companyId]
    );
    if (locResults.length === 0) return res.sendStatus(404);

    const [elevResults] = await db.query(
      'SELECT * FROM elevators WHERE location_id = ? AND company_id = ?',
      [locationId, companyId]
    );

    const [rmsResults] = await db.query(`
      SELECT v.*
      FROM rms_visits v
      WHERE v.location_id = ?
        AND v.company_id = ?
      ORDER BY v.visit_date DESC, v.created_at DESC
      LIMIT 5
    `, [locationId, companyId]);

    const [intResults] = await db.query(`
      SELECT i.*, e.label AS elevator_label
      FROM interventions i
      LEFT JOIN elevators e ON i.elevator_id = e.id
      WHERE i.location_id = ?
        AND i.company_id = ?
      ORDER BY i.date DESC
      LIMIT 5
    `, [locationId, companyId]);

    res.json({
      location: locResults[0],
      elevators: elevResults,
      rms: rmsResults,
      interventions: intResults
    });
  } catch (err) {
    console.error('Greška pri dohvaćanju profila lokacije:', err);
    res.status(500).json({ error: 'Greška pri dohvaćanju profila' });
  }
});

// ✅ Trenutni aktivni status lokacije
router.get('/:id/active-status', async (req, res) => {
  const locationId = req.params.id;

  try {
    const companyId = req.companyId;
    const [interventions] = await db.query(
      `SELECT status, date, created_at
       FROM interventions
       WHERE location_id = ?
         AND company_id = ?
       ORDER BY date DESC, created_at DESC
       LIMIT 1`,
      [locationId, companyId]
    );

    const [rms] = await db.query(
      `SELECT status, visit_date AS date, created_at
       FROM rms_visits
       WHERE location_id = ?
         AND company_id = ?
       ORDER BY visit_date DESC, created_at DESC
       LIMIT 1`,
      [locationId, companyId]
    );

    const latestIntervention = interventions[0] || null;
    const latestRms = rms[0] || null;

    const redStatus = 'Potreban popravak - Dizalo nije u funkciji';
    const yellowStatus = 'Potreban popravak - Dizalo u funkciji';

    if (latestIntervention?.status === redStatus) {
      return res.json({
        status: redStatus,
        source: 'intervention',
        updatedAt: latestIntervention.created_at || latestIntervention.date
      });
    }

    const getTimestamp = (record) => {
      if (!record) return 0;
      return new Date(record.created_at || record.date).getTime();
    };

    const latestRecord = getTimestamp(latestIntervention) >= getTimestamp(latestRms)
      ? { ...latestIntervention, source: 'intervention' }
      : { ...latestRms, source: 'rms' };

    if (latestRecord?.status === yellowStatus) {
      return res.json({
        status: yellowStatus,
        source: latestRecord.source,
        updatedAt: latestRecord.created_at || latestRecord.date
      });
    }

    return res.json({
      status: 'O.K.',
      source: latestRecord?.source || null,
      updatedAt: latestRecord?.created_at || latestRecord?.date || null
    });
  } catch (err) {
    console.error('Greška pri dohvaćanju aktivnog statusa:', err);
    res.status(500).json({ error: 'Greška pri dohvaćanju aktivnog statusa' });
  }
});

// ✅ RMS posjeti po lokaciji (za mjesečni pregled)
router.get('/:id/rms-visits', async (req, res) => {
  const locationId = req.params.id;
  try {
    const companyId = req.companyId;
    const [visits] = await db.query(
      `SELECT id, location_id, visit_date, rms_month, created_at
       FROM rms_visits
       WHERE location_id = ?
         AND company_id = ?
       ORDER BY visit_date DESC, created_at DESC`,
      [locationId, companyId]
    );

    res.json(visits);
  } catch (err) {
    console.error('Greška pri dohvaćanju RMS posjeta:', err);
    res.status(500).json({ error: 'Greška pri dohvaćanju RMS posjeta' });
  }
});

// ✅ Zadnji RMS posjet + stavke po dizalu
router.get('/:id/rms-visits/latest', async (req, res) => {
  const locationId = req.params.id;
  try {
    const companyId = req.companyId;
    const [visits] = await db.query(
      `SELECT * FROM rms_visits
       WHERE location_id = ?
         AND company_id = ?
       ORDER BY visit_date DESC, created_at DESC
       LIMIT 1`,
      [locationId, companyId]
    );

    if (!visits.length) {
      return res.json(null);
    }

    const visit = visits[0];
    const [items] = await db.query(
      `SELECT * FROM rms_visit_items
       WHERE visit_id = ?
         AND company_id = ?
       ORDER BY elevator_label ASC`,
      [visit.id, companyId]
    );

    res.json({
      ...visit,
      items
    });
  } catch (err) {
    console.error('Greška pri dohvaćanju zadnjeg RMS posjeta:', err);
    res.status(500).json({ error: 'Greška pri dohvaćanju zadnjeg RMS posjeta' });
  }
});

// Dohvati pojedinačnu lokaciju (mora biti na kraju zbog /:id matching-a)
router.get('/:id', async (req, res) => {
  try {
    const companyId = req.companyId;
    const [results] = await db.query(
      `SELECT id, name, address, latitude, longitude, contact_person, contact_phone, notes,
              rms_frequency, company_id, upravitelj, kljuc_strojarnice
       FROM locations
       WHERE id = ? AND company_id = ?`,
      [req.params.id, companyId]
    );
    if (results.length === 0) {
      return res.status(404).json({ error: 'Lokacija nije pronađena' });
    }
    res.json(results[0]);
  } catch (err) {
    console.error('Greška pri dohvaćanju lokacije:', err);
    res.status(500).json({ error: 'Greška pri dohvaćanju lokacije' });
  }
});

module.exports = router;
