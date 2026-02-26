const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const db = require('../db');
const { generatePdfForWorkOrder } = require('../utils/work-order-pdf');
const { createNotification } = require('../utils/createNotification');

const workOrderUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }
});

const uploadWorkOrderFile = (req, res, next) => {
  workOrderUpload.single('file')(req, res, (err) => {
    if (!err) return next();
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'Attachment exceeds 10MB limit' });
    }
    return res.status(400).json({ error: err.message || 'Invalid attachment upload' });
  });
};

const ensureAdmin = async (req, res, next) => {
  const userId = req.session?.user?.id;
  const companyId = req.companyId;
  if (!userId || !companyId) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  try {
    const [[row]] = await require('../db').query(
      'SELECT role FROM user_companies WHERE user_id = ? AND company_id = ? LIMIT 1',
      [userId, companyId]
    );
    if (!row || row.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden' });
    }
    return next();
  } catch (err) {
    console.error('ensureAdmin error:', err);
    return res.status(500).json({ error: 'Database error' });
  }
};

const normalizeArray = (value) => (Array.isArray(value) ? value : []);

router.post('/', ensureAdmin, async (req, res) => {
  const companyId = req.companyId;
  const userId = req.session?.user?.id ?? null;
  const {
    location_id,
    issued_date,
    due_date,
    general_comment
  } = req.body;

  console.log('Incoming work order payload:', req.body);
  console.log('Company ID:', companyId);

  const items = normalizeArray(req.body.items);
  const elevatorIds = normalizeArray(req.body.elevator_ids);
  const assignedUserIds = normalizeArray(req.body.assigned_user_ids);

  if (!location_id) {
    return res.status(400).json({ error: 'Missing location_id' });
  }

  if (!items.length) {
    return res.status(400).json({ error: 'At least one item is required' });
  }

  if (issued_date && Number.isNaN(Date.parse(issued_date))) {
    return res.status(400).json({ error: 'Invalid issued_date format' });
  }

  if (due_date && Number.isNaN(Date.parse(due_date))) {
    return res.status(400).json({ error: 'Invalid due_date format' });
  }

  for (const item of items) {
    if (!item?.description) {
      return res.status(400).json({ error: 'Each item requires description' });
    }
  }

  try {
    const [[locationRow]] = await db.query(
      'SELECT id FROM locations WHERE id = ? AND company_id = ? LIMIT 1',
      [location_id, companyId]
    );

    if (!locationRow) {
      return res.status(403).json({ message: 'Invalid location' });
    }

    if (elevatorIds.length > 0) {
      const uniqueElevatorIds = Array.from(new Set(elevatorIds));
      const [elevatorRows] = await db.query(
        `SELECT id FROM elevators
         WHERE id IN (${uniqueElevatorIds.map(() => '?').join(',')})
           AND company_id = ?
           AND location_id = ?`,
        [...uniqueElevatorIds, companyId, location_id]
      );

      if (elevatorRows.length !== uniqueElevatorIds.length) {
        return res.status(400).json({ error: 'Invalid elevator_ids' });
      }
    }

    if (assignedUserIds.length > 0) {
      const uniqueUserIds = Array.from(new Set(assignedUserIds));
      const [userRows] = await db.query(
        `SELECT id FROM users
         WHERE id IN (${uniqueUserIds.map(() => '?').join(',')})
           AND company_id = ?`,
        [...uniqueUserIds, companyId]
      );

      if (userRows.length !== uniqueUserIds.length) {
        return res.status(400).json({ error: 'Invalid assigned_user_ids' });
      }
    }

    const connection = await db.getConnection();
    try {
      await connection.beginTransaction();

      const [result] = await connection.query(
        `INSERT INTO work_orders
          (company_id, location_id, created_by_user_id, status, issued_date, due_date, general_comment)
         VALUES (?, ?, ?, 'open', ?, ?, ?)`,
        [companyId, location_id, userId, issued_date || new Date().toISOString().slice(0, 10), due_date || null, general_comment || null]
      );

      const workOrderId = result.insertId;

      for (let index = 0; index < items.length; index += 1) {
        const item = items[index];
        const sortOrder = Number.isInteger(item.sort_order) ? item.sort_order : index + 1;
        await connection.query(
          `INSERT INTO work_order_items
            (work_order_id, company_id, description, sort_order)
           VALUES (?, ?, ?, ?)`,
          [workOrderId, companyId, item.description, sortOrder]
        );
      }

      for (const elevatorId of elevatorIds) {
        await connection.query(
          `INSERT INTO work_order_elevators
            (work_order_id, company_id, elevator_id)
           VALUES (?, ?, ?)`,
          [workOrderId, companyId, elevatorId]
        );
      }

      for (const assignedUserId of assignedUserIds) {
        await connection.query(
          `INSERT INTO work_order_users
            (work_order_id, company_id, user_id)
           VALUES (?, ?, ?)`,
          [workOrderId, companyId, assignedUserId]
        );
      }

      await connection.query(
        `INSERT INTO work_order_activity (work_order_id, company_id, user_id, type, meta)
         VALUES (?, ?, ?, 'edited', NULL)`,
        [workOrderId, companyId, userId]
      );

      await connection.commit();

      for (const assignedUserId of assignedUserIds) {
        try {
          await createNotification({
            userId: assignedUserId,
            type: 'work_order',
            title: 'Dodijeljen radni nalog',
            message: `Novi radni nalog #${workOrderId} je dodijeljen.`,
            link: `/dashboard/work-order-detail.html?id=${workOrderId}`
          });
        } catch (notifyErr) {
          console.error('Greška pri notifikaciji radnog naloga:', notifyErr);
        }
      }

      return res.status(201).json({ id: workOrderId });
    } catch (err) {
      await connection.rollback();
      console.error('WORK ORDER CREATE ERROR:', err);
      return res.status(500).json({
        message: 'Internal server error',
        error: process.env.NODE_ENV === 'development' ? err.message : 'Greška pri spremanju radnog naloga'
      });
    } finally {
      connection.release();
    }
  } catch (err) {
    console.error('WORK ORDER CREATE ERROR:', err);
    return res.status(500).json({
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? err.message : 'Greška pri spremanju radnog naloga'
    });
  }
});

router.get('/', async (req, res) => {
  try {
    const companyId = req.companyId;
    const [rows] = await db.query(
      `SELECT w.id,
              w.status,
              w.due_date,
              w.created_at,
              w.general_comment,
              l.name AS location_name,
              l.address AS location_address,
              GROUP_CONCAT(DISTINCT COALESCE(u.full_name, u.username) SEPARATOR ',') AS assigned_user_names
       FROM work_orders w
       LEFT JOIN locations l ON w.location_id = l.id
       LEFT JOIN work_order_users wou ON w.id = wou.work_order_id AND wou.company_id = w.company_id
       LEFT JOIN users u ON wou.user_id = u.id
       WHERE w.company_id = ?
       GROUP BY w.id
       ORDER BY w.created_at DESC`,
      [companyId]
    );

    const payload = rows.map(row => ({
      ...row,
      assigned_users: row.assigned_user_names
        ? row.assigned_user_names.split(',').map(name => name.trim()).filter(Boolean)
        : []
    }));

    res.json(payload);
  } catch (err) {
    console.error('Greška pri dohvaćanju radnih naloga:', err);
    res.status(500).json({ error: 'Greška pri dohvaćanju radnih naloga' });
  }
});

router.patch('/bulk-status', ensureAdmin, async (req, res) => {
  const companyId = req.companyId;
  const { ids, status } = req.body;

  const allowed = ['open', 'in_progress', 'completed', 'cancelled'];
  if (!allowed.includes(status)) {
    return res.status(400).json({ error: 'Invalid status' });
  }

  const normalizedIds = Array.isArray(ids)
    ? Array.from(new Set(ids.map(Number).filter(Number.isInteger)))
    : [];

  if (!normalizedIds.length) {
    return res.status(400).json({ error: 'ids must be a non-empty array' });
  }

  try {
    const [rows] = await db.query(
      `SELECT id FROM work_orders
       WHERE id IN (${normalizedIds.map(() => '?').join(',')})
         AND company_id = ?`,
      [...normalizedIds, companyId]
    );

    if (rows.length !== normalizedIds.length) {
      return res.status(403).json({ error: 'One or more work orders are invalid for this company' });
    }

    const [result] = await db.query(
      `UPDATE work_orders
       SET status = ?
       WHERE id IN (${normalizedIds.map(() => '?').join(',')})
         AND company_id = ?`,
      [status, ...normalizedIds, companyId]
    );

    return res.json({ affected: result.affectedRows });
  } catch (err) {
    console.error('Greška pri masovnoj promjeni statusa radnih naloga:', err);
    return res.status(500).json({ error: 'Greška pri masovnoj promjeni statusa radnih naloga' });
  }
});

router.get('/:id', async (req, res) => {
  const workOrderId = req.params.id;
  try {
    const companyId = req.companyId;
    const [orders] = await db.query(
      `SELECT w.id,
              w.location_id,
              w.issued_date,
              w.due_date,
              w.general_comment,
              w.status,
              w.created_at,
              l.id AS location_ref_id,
              l.name AS location_name
       FROM work_orders w
       LEFT JOIN locations l ON w.location_id = l.id
       WHERE w.id = ?
         AND w.company_id = ?`,
      [workOrderId, companyId]
    );

    if (!orders.length) {
      return res.status(404).json({ error: 'Work order not found' });
    }

    const [items] = await db.query(
      `SELECT id, description, sort_order, is_completed
       FROM work_order_items
       WHERE work_order_id = ?
         AND company_id = ?
       ORDER BY sort_order ASC, id ASC`,
      [workOrderId, companyId]
    );

    const [elevators] = await db.query(
      `SELECT e.id, e.label AS name
       FROM work_order_elevators woe
       INNER JOIN elevators e ON woe.elevator_id = e.id
       WHERE woe.work_order_id = ?
         AND woe.company_id = ?
       ORDER BY e.label ASC`,
      [workOrderId, companyId]
    );

    const [users] = await db.query(
      `SELECT u.id, COALESCE(u.full_name, u.username) AS name
       FROM work_order_users wou
       INNER JOIN users u ON wou.user_id = u.id
       WHERE wou.work_order_id = ?
         AND wou.company_id = ?
       ORDER BY u.full_name ASC, u.username ASC`,
      [workOrderId, companyId]
    );

    const responseObject = {
      id: orders[0].id,
      location_id: orders[0].location_id,
      issued_date: orders[0].issued_date,
      due_date: orders[0].due_date,
      general_comment: orders[0].general_comment,
      status: orders[0].status,
      created_at: orders[0].created_at,
      location: orders[0].location_ref_id
        ? { id: orders[0].location_ref_id, name: orders[0].location_name }
        : null,
      items,
      elevators,
      assigned_users: users
    };

    console.log('WORK ORDER DETAIL RESPONSE:', responseObject);
    return res.json(responseObject);
  } catch (err) {
    console.error('Greška pri dohvaćanju radnog naloga:', err);
    return res.status(500).json({ error: 'Greška pri dohvaćanju radnog naloga' });
  }
});

router.patch('/items/:itemId/toggle', async (req, res) => {
  const itemId = req.params.itemId;
  const companyId = req.companyId;
  const userId = req.session?.user?.id ?? null;
  const userRole = req.session?.user?.role ?? null;

  try {
    const [[itemRow]] = await db.query(
      `SELECT woi.id,
              woi.is_completed,
              woi.work_order_id,
              wo.company_id
       FROM work_order_items woi
       INNER JOIN work_orders wo ON woi.work_order_id = wo.id
       WHERE woi.id = ?
         AND wo.company_id = ?
       LIMIT 1`,
      [itemId, companyId]
    );

    if (!itemRow) {
      return res.status(404).json({ error: 'Work order item not found' });
    }

    const isAdmin = userRole === 'admin';
    if (!isAdmin) {
      const [assignedRows] = await db.query(
        `SELECT 1
         FROM work_order_users
         WHERE work_order_id = ?
           AND company_id = ?
           AND user_id = ?
         LIMIT 1`,
        [itemRow.work_order_id, companyId, userId]
      );

      if (!assignedRows.length) {
        return res.status(403).json({ error: 'Forbidden' });
      }
    }

    await db.query(
      'UPDATE work_order_items SET is_completed = NOT is_completed WHERE id = ?'
      , [itemId]
    );

    const [[updatedRow]] = await db.query(
      `SELECT id, description, sort_order, is_completed
       FROM work_order_items
       WHERE id = ?
       LIMIT 1`,
      [itemId]
    );

    await db.query(
      `INSERT INTO work_order_activity (work_order_id, company_id, user_id, type, meta)
       VALUES (?, ?, ?, 'item_toggled', ?)`,
      [itemRow.work_order_id, companyId, userId, JSON.stringify({ item_id: updatedRow.id, is_completed: Boolean(updatedRow.is_completed) })]
    );

    const [[countRow]] = await db.query(
      `SELECT COUNT(*) AS total, COALESCE(SUM(is_completed), 0) AS completed
       FROM work_order_items
       WHERE work_order_id = ?
         AND company_id = ?`,
      [itemRow.work_order_id, companyId]
    );

    let updatedStatus = null;
    if (countRow?.total > 0 && Number(countRow.total) === Number(countRow.completed)) {
      const [[currentOrderRow]] = await db.query(
        `SELECT status
         FROM work_orders
         WHERE id = ? AND company_id = ?`,
        [itemRow.work_order_id, companyId]
      );

      if (currentOrderRow && currentOrderRow.status !== 'completed') {
        await db.query(
          `UPDATE work_orders
           SET status = 'completed'
           WHERE id = ? AND company_id = ?`,
          [itemRow.work_order_id, companyId]
        );

        await db.query(
          `INSERT INTO work_order_activity (work_order_id, company_id, user_id, type, meta)
           VALUES (?, ?, ?, 'status_changed', ?)`,
          [itemRow.work_order_id, companyId, userId, JSON.stringify({ from: currentOrderRow.status, to: 'completed' })]
        );

        updatedStatus = 'completed';
      } else {
        updatedStatus = currentOrderRow?.status || null;
      }
    } else {
      const [[currentOrderRow]] = await db.query(
        `SELECT status
         FROM work_orders
         WHERE id = ? AND company_id = ?`,
        [itemRow.work_order_id, companyId]
      );
      updatedStatus = currentOrderRow?.status || null;
    }

    return res.json({
      ...updatedRow,
      work_order_status: updatedStatus
    });
  } catch (err) {
    console.error('Greška pri ažuriranju stavke radnog naloga:', err);
    return res.status(500).json({ error: 'Greška pri ažuriranju stavke radnog naloga' });
  }
});

router.put('/:id', ensureAdmin, async (req, res) => {
  const workOrderId = req.params.id;
  const companyId = req.companyId;
  const {
    issued_date,
    due_date,
    general_comment,
    assigned_user_ids,
    elevator_ids,
    items
  } = req.body;

  const normalizedAssignedIds = Array.isArray(assigned_user_ids)
    ? Array.from(new Set(assigned_user_ids.map(Number).filter(Number.isInteger)))
    : [];
  const normalizedElevatorIds = Array.isArray(elevator_ids)
    ? Array.from(new Set(elevator_ids.map(Number).filter(Number.isInteger)))
    : [];
  const normalizedItems = Array.isArray(items) ? items : [];

  if (normalizedItems.length === 0) {
    return res.status(400).json({ error: 'At least one item is required' });
  }

  for (const item of normalizedItems) {
    if (!item?.description) {
      return res.status(400).json({ error: 'Each item requires description' });
    }
  }

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    const [[orderRow]] = await connection.query(
      'SELECT id, location_id FROM work_orders WHERE id = ? AND company_id = ? LIMIT 1',
      [workOrderId, companyId]
    );

    if (!orderRow) {
      await connection.rollback();
      return res.status(404).json({ error: 'Work order not found' });
    }

    if (normalizedElevatorIds.length > 0) {
      const [elevatorRows] = await connection.query(
        `SELECT id FROM elevators
         WHERE id IN (${normalizedElevatorIds.map(() => '?').join(',')})
           AND company_id = ?
           AND location_id = ?`,
        [...normalizedElevatorIds, companyId, orderRow.location_id]
      );
      if (elevatorRows.length !== normalizedElevatorIds.length) {
        await connection.rollback();
        return res.status(400).json({ error: 'Invalid elevator_ids' });
      }
    }

    if (normalizedAssignedIds.length > 0) {
      const [userRows] = await connection.query(
        `SELECT id FROM users
         WHERE id IN (${normalizedAssignedIds.map(() => '?').join(',')})
           AND company_id = ?`,
        [...normalizedAssignedIds, companyId]
      );
      if (userRows.length !== normalizedAssignedIds.length) {
        await connection.rollback();
        return res.status(400).json({ error: 'Invalid assigned_user_ids' });
      }
    }

    await connection.query(
      `UPDATE work_orders
       SET issued_date = ?,
           due_date = ?,
           general_comment = ?
       WHERE id = ? AND company_id = ?`,
      [issued_date || null, due_date || null, general_comment || null, workOrderId, companyId]
    );

    await connection.query(
      'DELETE FROM work_order_users WHERE work_order_id = ? AND company_id = ?',
      [workOrderId, companyId]
    );
    for (const assignedUserId of normalizedAssignedIds) {
      await connection.query(
        `INSERT INTO work_order_users
          (work_order_id, company_id, user_id)
         VALUES (?, ?, ?)`,
        [workOrderId, companyId, assignedUserId]
      );
    }

    await connection.query(
      'DELETE FROM work_order_elevators WHERE work_order_id = ? AND company_id = ?',
      [workOrderId, companyId]
    );
    for (const elevatorId of normalizedElevatorIds) {
      await connection.query(
        `INSERT INTO work_order_elevators
          (work_order_id, company_id, elevator_id)
         VALUES (?, ?, ?)`,
        [workOrderId, companyId, elevatorId]
      );
    }

    const [existingItems] = await connection.query(
      `SELECT id FROM work_order_items
       WHERE work_order_id = ?
         AND company_id = ?`,
      [workOrderId, companyId]
    );
    const existingIds = existingItems.map(row => row.id);
    const payloadIds = normalizedItems
      .map(item => Number(item.id))
      .filter(Number.isInteger);

    const idsToDelete = existingIds.filter(id => !payloadIds.includes(id));
    if (idsToDelete.length) {
      await connection.query(
        `DELETE FROM work_order_items
         WHERE id IN (${idsToDelete.map(() => '?').join(',')})
           AND company_id = ?`,
        [...idsToDelete, companyId]
      );
    }

    for (let index = 0; index < normalizedItems.length; index += 1) {
      const item = normalizedItems[index];
      const sortOrder = Number.isInteger(item.sort_order) ? item.sort_order : index + 1;
      const description = item.description;

      if (item.id && existingIds.includes(Number(item.id))) {
        await connection.query(
          `UPDATE work_order_items
           SET description = ?, sort_order = ?
           WHERE id = ? AND company_id = ?`,
          [description, sortOrder, Number(item.id), companyId]
        );
      } else {
        await connection.query(
          `INSERT INTO work_order_items
            (work_order_id, company_id, description, sort_order)
           VALUES (?, ?, ?, ?)`,
          [workOrderId, companyId, description, sortOrder]
        );
      }
    }

    await connection.query(
      `INSERT INTO work_order_activity (work_order_id, company_id, user_id, type, meta)
       VALUES (?, ?, ?, 'edited', NULL)`,
      [workOrderId, companyId, req.session?.user?.id ?? null]
    );

    await connection.commit();
  } catch (err) {
    await connection.rollback();
    console.error('Greška pri ažuriranju radnog naloga:', err);
    return res.status(500).json({ error: 'Greška pri ažuriranju radnog naloga' });
  } finally {
    connection.release();
  }

  try {
    const [orders] = await db.query(
      `SELECT w.id,
              w.location_id,
              w.issued_date,
              w.due_date,
              w.general_comment,
              w.status,
              w.created_at,
              l.id AS location_ref_id,
              l.name AS location_name
       FROM work_orders w
       LEFT JOIN locations l ON w.location_id = l.id
       WHERE w.id = ?
         AND w.company_id = ?`,
      [workOrderId, companyId]
    );

    if (!orders.length) {
      return res.status(404).json({ error: 'Work order not found' });
    }

    const [detailItems] = await db.query(
      `SELECT id, description, sort_order, is_completed
       FROM work_order_items
       WHERE work_order_id = ?
         AND company_id = ?
       ORDER BY sort_order ASC, id ASC`,
      [workOrderId, companyId]
    );

    const [detailElevators] = await db.query(
      `SELECT e.id, e.label AS name
       FROM work_order_elevators woe
       INNER JOIN elevators e ON woe.elevator_id = e.id
       WHERE woe.work_order_id = ?
         AND woe.company_id = ?
       ORDER BY e.label ASC`,
      [workOrderId, companyId]
    );

    const [detailUsers] = await db.query(
      `SELECT u.id, COALESCE(u.full_name, u.username) AS name
       FROM work_order_users wou
       INNER JOIN users u ON wou.user_id = u.id
       WHERE wou.work_order_id = ?
         AND wou.company_id = ?
       ORDER BY u.full_name ASC, u.username ASC`,
      [workOrderId, companyId]
    );

    return res.json({
      id: orders[0].id,
      location_id: orders[0].location_id,
      issued_date: orders[0].issued_date,
      due_date: orders[0].due_date,
      general_comment: orders[0].general_comment,
      status: orders[0].status,
      created_at: orders[0].created_at,
      location: orders[0].location_ref_id
        ? { id: orders[0].location_ref_id, name: orders[0].location_name }
        : null,
      items: detailItems,
      elevators: detailElevators,
      assigned_users: detailUsers
    });
  } catch (err) {
    console.error('Greška pri dohvaćanju radnog naloga:', err);
    return res.status(500).json({ error: 'Greška pri dohvaćanju radnog naloga' });
  }
});

router.post('/:id/attachments', uploadWorkOrderFile, async (req, res) => {
  const workOrderId = req.params.id;
  const companyId = req.companyId;
  const userId = req.session?.user?.id ?? null;

  if (!req.file) {
    return res.status(400).json({ error: 'Attachment file is required' });
  }

  try {
    const [[orderRow]] = await db.query(
      'SELECT id FROM work_orders WHERE id = ? AND company_id = ? LIMIT 1',
      [workOrderId, companyId]
    );

    if (!orderRow) {
      return res.status(404).json({ error: 'Work order not found' });
    }

    const uploadsDir = path.join(__dirname, '..', 'uploads', 'work-orders');
    fs.mkdirSync(uploadsDir, { recursive: true });

    const timestamp = Date.now();
    const ext = path.extname(req.file.originalname || '').toLowerCase() || '.bin';
    const filename = `${companyId}-${workOrderId}-${timestamp}${ext}`;
    const filePath = path.join(uploadsDir, filename);
    fs.writeFileSync(filePath, req.file.buffer);

    const storedPath = `/uploads/work-orders/${filename}`;
    await db.query(
      `INSERT INTO work_order_attachments
        (work_order_id, company_id, file_path, uploaded_by)
       VALUES (?, ?, ?, ?)`,
      [workOrderId, companyId, storedPath, userId]
    );

    await db.query(
      `INSERT INTO work_order_activity (work_order_id, company_id, user_id, type, meta)
       VALUES (?, ?, ?, 'attachment_added', ?)`,
      [workOrderId, companyId, userId, JSON.stringify({ file_path: storedPath })]
    );

    return res.status(201).json({ file_path: storedPath });
  } catch (err) {
    console.error('Greška pri spremanju priloga radnog naloga:', err);
    return res.status(500).json({ error: 'Greška pri spremanju priloga radnog naloga' });
  }
});

router.get('/:id/attachments', async (req, res) => {
  const workOrderId = req.params.id;
  const companyId = req.companyId;

  try {
    const [[orderRow]] = await db.query(
      'SELECT id FROM work_orders WHERE id = ? AND company_id = ? LIMIT 1',
      [workOrderId, companyId]
    );

    if (!orderRow) {
      return res.status(404).json({ error: 'Work order not found' });
    }

    const [rows] = await db.query(
      `SELECT id, file_path, uploaded_by, created_at
       FROM work_order_attachments
       WHERE work_order_id = ?
         AND company_id = ?
       ORDER BY created_at DESC, id DESC`,
      [workOrderId, companyId]
    );

    return res.json(rows);
  } catch (err) {
    console.error('Greška pri dohvaćanju priloga radnog naloga:', err);
    return res.status(500).json({ error: 'Greška pri dohvaćanju priloga radnog naloga' });
  }
});

router.patch('/:id/status', async (req, res) => {
  const workOrderId = req.params.id;
  const companyId = req.companyId;
  const userId = req.session?.user?.id ?? null;
  const { status } = req.body;

  const allowed = ['open', 'in_progress', 'completed', 'cancelled'];
  if (!allowed.includes(status)) {
    return res.status(400).json({ error: 'Invalid status' });
  }

  try {
    const [[currentRow]] = await db.query(
      `SELECT status
       FROM work_orders
       WHERE id = ? AND company_id = ?`,
      [workOrderId, companyId]
    );

    if (!currentRow) {
      return res.status(404).json({ error: 'Work order not found' });
    }

    const [result] = await db.query(
      `UPDATE work_orders
       SET status = ?
       WHERE id = ?
         AND company_id = ?`,
      [status, workOrderId, companyId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Work order not found' });
    }

    const [[row]] = await db.query(
      `SELECT id, location_id, issued_date, due_date, general_comment, status, created_at
       FROM work_orders
       WHERE id = ? AND company_id = ?`,
      [workOrderId, companyId]
    );

    await db.query(
      `INSERT INTO work_order_activity (work_order_id, company_id, user_id, type, meta)
       VALUES (?, ?, ?, 'status_changed', ?)`,
      [workOrderId, companyId, userId, JSON.stringify({ from: currentRow.status, to: status })]
    );

    return res.json(row || null);
  } catch (err) {
    console.error('Greška pri ažuriranju statusa radnog naloga:', err);
    return res.status(500).json({ error: 'Greška pri ažuriranju statusa radnog naloga' });
  }
});

router.put('/:id/close', ensureAdmin, async (req, res) => {
  const workOrderId = req.params.id;
  const companyId = req.companyId;
  const userId = req.session?.user?.id ?? null;

  try {
    const [[currentRow]] = await db.query(
      `SELECT status
       FROM work_orders
       WHERE id = ? AND company_id = ?`,
      [workOrderId, companyId]
    );

    if (!currentRow) {
      return res.status(404).json({ error: 'Work order not found' });
    }

    const [result] = await db.query(
      `UPDATE work_orders
       SET status = 'completed',
           closed_at = NOW(),
           closed_by_user_id = ?
       WHERE id = ?
         AND company_id = ?
         AND status <> 'completed'`,
      [userId, workOrderId, companyId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Work order not found' });
    }

    await db.query(
      `INSERT INTO work_order_activity (work_order_id, company_id, user_id, type, meta)
       VALUES (?, ?, ?, 'status_changed', ?)`,
      [workOrderId, companyId, userId, JSON.stringify({ from: currentRow.status, to: 'completed' })]
    );

    return res.json({ message: 'Work order closed' });
  } catch (err) {
    console.error('Greška pri zatvaranju radnog naloga:', err);
    return res.status(500).json({ error: 'Greška pri zatvaranju radnog naloga' });
  }
});

router.get('/:id/activity', async (req, res) => {
  const workOrderId = req.params.id;
  const companyId = req.companyId;

  try {
    const [[orderRow]] = await db.query(
      'SELECT id FROM work_orders WHERE id = ? AND company_id = ? LIMIT 1',
      [workOrderId, companyId]
    );

    if (!orderRow) {
      return res.status(404).json({ error: 'Work order not found' });
    }

    const [rows] = await db.query(
      `SELECT a.id,
              a.type,
              a.meta,
              a.created_at,
              u.id AS user_id,
              COALESCE(u.full_name, u.username) AS user_name
       FROM work_order_activity a
       INNER JOIN users u ON a.user_id = u.id
       WHERE a.work_order_id = ?
         AND a.company_id = ?
       ORDER BY a.created_at DESC, a.id DESC`,
      [workOrderId, companyId]
    );

    const payload = rows.map(row => ({
      id: row.id,
      type: row.type,
      meta: row.meta,
      created_at: row.created_at,
      user: {
        id: row.user_id,
        name: row.user_name
      }
    }));

    return res.json(payload);
  } catch (err) {
    console.error('Greška pri dohvaćanju aktivnosti radnog naloga:', err);
    return res.status(500).json({ error: 'Greška pri dohvaćanju aktivnosti radnog naloga' });
  }
});

router.get('/:id/pdf', async (req, res) => {
  const workOrderId = req.params.id;
  const companyId = req.companyId ?? null;

  if (!companyId) {
    return res.sendStatus(404);
  }

  try {
    const [rows] = await db.query(
      'SELECT id FROM work_orders WHERE id = ? AND company_id = ?',
      [workOrderId, companyId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Work order not found' });
    }

    const result = await generatePdfForWorkOrder(workOrderId, companyId);
    if (fs.existsSync(result.filePath)) {
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename=work-order-${workOrderId}.pdf`);
      return res.sendFile(result.filePath);
    }
    return res.status(404).json({ error: 'PDF datoteka nije pronađena' });
  } catch (err) {
    console.error('Greška pri generiranju PDF-a radnog naloga:', err);
    return res.status(500).json({ error: 'Greška pri generiranju PDF-a' });
  }
});

module.exports = router;
