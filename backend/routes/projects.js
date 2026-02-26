const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const db = require('../db');

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

const projectUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }
});

const uploadProjectFile = (req, res, next) => {
  projectUpload.single('file')(req, res, (err) => {
    if (!err) return next();
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'Attachment exceeds 10MB limit' });
    }
    return res.status(400).json({ error: err.message || 'Invalid attachment upload' });
  });
};

router.get('/', async (req, res) => {
  try {
    const companyId = req.companyId;
    const [rows] = await db.query(
      `SELECT p.id, p.name, p.description, p.location_id, p.status, p.start_date,
              p.expected_end_date, p.created_by, p.created_at,
              ou.id AS owner_id, COALESCE(ou.full_name, ou.username) AS owner_name,
              COALESCE(t.total_tasks, 0) AS total_tasks,
              COALESCE(t.completed_tasks, 0) AS completed_tasks
       FROM projects p
       LEFT JOIN users ou ON p.owner_user_id = ou.id
       LEFT JOIN (
         SELECT s.project_id,
                COUNT(tsk.id) AS total_tasks,
                SUM(CASE WHEN tsk.is_completed = 1 THEN 1 ELSE 0 END) AS completed_tasks
         FROM project_sections s
         LEFT JOIN project_tasks tsk ON tsk.project_section_id = s.id
         GROUP BY s.project_id
       ) t ON t.project_id = p.id
       WHERE p.company_id = ?
       ORDER BY p.created_at DESC`,
      [companyId]
    );

    const projectIds = rows.map(row => row.id);
    const assignedByProject = new Map();

    if (projectIds.length) {
      const [assignedRows] = await db.query(
        `SELECT pu.project_id, u.id, COALESCE(u.full_name, u.username) AS name
         FROM project_users pu
         INNER JOIN users u ON pu.user_id = u.id
         WHERE pu.project_id IN (${projectIds.map(() => '?').join(',')})
           AND u.company_id = ?
         ORDER BY u.full_name ASC, u.username ASC`,
        [...projectIds, companyId]
      );

      assignedRows.forEach(row => {
        if (!assignedByProject.has(row.project_id)) {
          assignedByProject.set(row.project_id, []);
        }
        assignedByProject.get(row.project_id).push({ id: row.id, name: row.name });
      });
    }

    const payload = rows.map(row => ({
      ...row,
      owner: row.owner_id ? { id: row.owner_id, name: row.owner_name } : null,
      assigned_users: assignedByProject.get(row.id) || [],
      progress: {
        total_tasks: Number(row.total_tasks) || 0,
        completed_tasks: Number(row.completed_tasks) || 0,
        percent: row.total_tasks > 0
          ? Math.round((Number(row.completed_tasks) / Number(row.total_tasks)) * 100)
          : 0
      }
    }));
    res.json(payload);
  } catch (err) {
    console.error('Greška pri dohvaćanju projekata:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

router.post('/', ensureAdmin, async (req, res) => {
  const { name, description, location_id, status, start_date, expected_end_date, due_date, sections } = req.body;
  const companyId = req.companyId;
  const userId = req.session?.user?.id;

  console.log('PROJECT CREATE sections:', req.body.sections);

  if (!name) {
    return res.status(400).json({ error: 'Project name is required' });
  }

  try {
    if (location_id) {
      const [[locationRow]] = await db.query(
        'SELECT id FROM locations WHERE id = ? AND company_id = ? LIMIT 1',
        [location_id, companyId]
      );
      if (!locationRow) {
        return res.status(400).json({ error: 'Invalid location' });
      }
    }

    const connection = await db.getConnection();
    try {
      await connection.beginTransaction();
      const [result] = await connection.query(
        `INSERT INTO projects
          (company_id, name, description, location_id, status, start_date, expected_end_date, due_date, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          companyId,
          name,
          description || null,
          location_id || null,
          status || 'open',
          start_date || null,
          expected_end_date || null,
          due_date || null,
          userId
        ]
      );

      const projectId = result.insertId;

      if (Array.isArray(sections)) {
        for (let sectionIndex = 0; sectionIndex < sections.length; sectionIndex += 1) {
          const section = sections[sectionIndex] || {};
          if (!section.title) {
            await connection.rollback();
            return res.status(400).json({ error: 'Section title is required' });
          }
          const sortOrder = Number.isInteger(section.sort_order) ? section.sort_order : sectionIndex + 1;
          const [sectionResult] = await connection.query(
            `INSERT INTO project_sections (project_id, title, sort_order)
             VALUES (?, ?, ?)`,
            [projectId, section.title, sortOrder]
          );

          const sectionId = sectionResult.insertId;
          const sectionTasks = Array.isArray(section.tasks) ? section.tasks : [];
          for (let taskIndex = 0; taskIndex < sectionTasks.length; taskIndex += 1) {
            const task = sectionTasks[taskIndex] || {};
            const taskTitle = task.title || task.description;
            if (!taskTitle) {
              await connection.rollback();
              return res.status(400).json({ error: 'Task description is required' });
            }
            const taskSortOrder = Number.isInteger(task.sort_order) ? task.sort_order : taskIndex + 1;
            const taskDescription = task.description || null;
            await connection.query(
              `INSERT INTO project_tasks (project_section_id, title, description, sort_order)
               VALUES (?, ?, ?, ?)`,
              [sectionId, taskTitle, taskDescription, taskSortOrder]
            );
          }
        }
      }

      await connection.commit();
      res.status(201).json({ id: projectId });
    } catch (err) {
      await connection.rollback();
      console.error('Greška pri dodavanju projekta:', err);
      return res.status(500).json({ error: 'Database error' });
    } finally {
      connection.release();
    }
  } catch (err) {
    console.error('Greška pri dodavanju projekta:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

router.get('/:id', async (req, res) => {
  const companyId = req.companyId;
  const projectId = req.params.id;
  try {
    const [[project]] = await db.query(
      `SELECT p.id, p.name, p.description, p.status, p.due_date, p.created_at,
              ou.id AS owner_id, COALESCE(ou.full_name, ou.username) AS owner_name
       FROM projects p
       LEFT JOIN users ou ON p.owner_user_id = ou.id
       WHERE p.id = ? AND p.company_id = ?
       LIMIT 1`,
      [projectId, companyId]
    );

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const [assignedUsers] = await db.query(
      `SELECT u.id, COALESCE(u.full_name, u.username) AS name
       FROM project_users pu
       INNER JOIN projects p ON pu.project_id = p.id
       INNER JOIN users u ON pu.user_id = u.id
       WHERE pu.project_id = ? AND p.company_id = ?
       ORDER BY u.full_name ASC, u.username ASC`,
      [projectId, companyId]
    );

    const [sections] = await db.query(
      `SELECT id, title, sort_order
       FROM project_sections
       WHERE project_id = ?
       ORDER BY sort_order ASC, id ASC`,
      [projectId]
    );

    const sectionById = new Map();
    sections.forEach(section => {
      section.tasks = [];
      sectionById.set(section.id, section);
    });

    const sectionIds = sections.map(section => section.id);
    let totalTasks = 0;
    let completedTasks = 0;

    if (sectionIds.length) {
      const [taskRows] = await db.query(
        `SELECT id, project_section_id, title, description, is_completed, sort_order
         FROM project_tasks
         WHERE project_section_id IN (${sectionIds.map(() => '?').join(',')})
         ORDER BY sort_order ASC, id ASC`,
        sectionIds
      );

      const taskIds = taskRows.map(row => row.id);
      const assigneesByTask = new Map();
      const commentsByTask = new Map();

      if (taskIds.length) {
        const [assigneeRows] = await db.query(
          `SELECT ptu.task_id, u.id, COALESCE(u.full_name, u.username) AS name
           FROM project_task_users ptu
           INNER JOIN project_tasks pt ON ptu.task_id = pt.id
           INNER JOIN project_sections ps ON pt.project_section_id = ps.id
           INNER JOIN projects p ON ps.project_id = p.id
           INNER JOIN users u ON ptu.user_id = u.id
           WHERE p.company_id = ?
             AND pt.id IN (${taskIds.map(() => '?').join(',')})
           ORDER BY u.full_name ASC, u.username ASC`,
          [companyId, ...taskIds]
        );

        assigneeRows.forEach(row => {
          if (!assigneesByTask.has(row.task_id)) {
            assigneesByTask.set(row.task_id, []);
          }
          assigneesByTask.get(row.task_id).push({
            id: row.id,
            name: row.name
          });
        });

        const [commentRows] = await db.query(
          `SELECT c.id, c.task_id, c.comment, c.created_at,
                  u.id AS user_id, COALESCE(u.full_name, u.username) AS user_name
           FROM project_task_comments c
           INNER JOIN project_tasks pt ON c.task_id = pt.id
           INNER JOIN project_sections ps ON pt.project_section_id = ps.id
           INNER JOIN projects p ON ps.project_id = p.id
           LEFT JOIN users u ON c.user_id = u.id
           WHERE p.company_id = ?
             AND pt.id IN (${taskIds.map(() => '?').join(',')})
           ORDER BY c.created_at ASC, c.id ASC`,
          [companyId, ...taskIds]
        );

        commentRows.forEach(row => {
          if (!commentsByTask.has(row.task_id)) {
            commentsByTask.set(row.task_id, []);
          }
          commentsByTask.get(row.task_id).push({
            id: row.id,
            comment: row.comment,
            created_at: row.created_at,
            user: row.user_id ? {
              id: row.user_id,
              name: row.user_name
            } : null
          });
        });
      }

      taskRows.forEach(row => {
        totalTasks += 1;
        if (row.is_completed) {
          completedTasks += 1;
        }
        const section = sectionById.get(row.project_section_id);
        if (!section) {
          return;
        }
        section.tasks.push({
          id: row.id,
          description: row.description || row.title,
          sort_order: row.sort_order,
          is_completed: Boolean(row.is_completed),
          assigned_users: assigneesByTask.get(row.id) || [],
          comments: commentsByTask.get(row.id) || []
        });
      });
    }

    const progressPercent = totalTasks > 0
      ? Math.round((completedTasks / totalTasks) * 100)
      : 0;

    const projectResponse = {
      id: project.id,
      name: project.name,
      description: project.description,
      status: project.status,
      due_date: project.due_date,
      created_at: project.created_at,
      owner: project.owner_id ? { id: project.owner_id, name: project.owner_name } : null,
      assigned_users: assignedUsers,
      sections: sections || [],
      progress: {
        total_tasks: totalTasks,
        completed_tasks: completedTasks,
        percent: progressPercent
      }
    };

    console.log('PROJECT DETAIL FINAL RESPONSE:', JSON.stringify(projectResponse, null, 2));
    return res.json(projectResponse);
  } catch (err) {
    console.error('Greška pri dohvaćanju projekta:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

router.post('/:id/sections', ensureAdmin, async (req, res) => {
  const companyId = req.companyId;
  const projectId = req.params.id;
  const { title } = req.body;

  console.log('[HIT] POST sections', req.method, req.originalUrl, req.body);
  console.log('PROJECT SECTION CREATE params:', req.params);
  console.log('PROJECT SECTION CREATE companyId:', companyId);
  console.log('PROJECT SECTION CREATE body:', req.body);

  if (!title) {
    return res.status(400).json({ error: 'Section title is required' });
  }

  try {
    const [[project]] = await db.query(
      'SELECT id FROM projects WHERE id = ? AND company_id = ? LIMIT 1',
      [projectId, companyId]
    );
    console.log('VALIDATION RESULT:', project || null);
    if (!project) {
      console.log('VALIDATION FAILED');
      return res.status(404).json({ error: 'Project not found' });
    }

    const [[orderRow]] = await db.query(
      'SELECT COALESCE(MAX(sort_order), 0) + 1 AS next_order FROM project_sections WHERE project_id = ?',
      [projectId]
    );

    const [result] = await db.query(
      `INSERT INTO project_sections (project_id, title, sort_order)
       VALUES (?, ?, ?)`,
      [projectId, title, orderRow?.next_order || 1]
    );

    console.log('INSERT RESULT:', result);
    const [sectionRows] = await db.query(
      'SELECT * FROM project_sections WHERE id = ?',
      [result.insertId]
    );
    console.log('PROJECT SECTION AFTER INSERT:', sectionRows);
    console.log('PROJECT SECTION CREATE insertId:', result.insertId);
    res.status(201).json({ id: result.insertId, title, sort_order: orderRow?.next_order || 1 });
  } catch (err) {
    console.error('Greška pri dodavanju sekcije:', err);
    console.error('PROJECT SECTION CREATE error details:', {
      params: req.params,
      companyId,
      body: req.body
    });
    res.status(500).json({ error: 'Database error' });
  }
});

router.post('/sections/:sectionId/tasks', ensureAdmin, async (req, res) => {
  const companyId = req.companyId;
  const sectionId = req.params.sectionId;
  const { description } = req.body;

  console.log('[HIT] POST tasks', req.method, req.originalUrl, req.body);
  console.log('PROJECT TASK CREATE params:', req.params);
  console.log('PROJECT TASK CREATE companyId:', companyId);
  console.log('PROJECT TASK CREATE body:', req.body);

  if (!description || typeof description !== 'string') {
    return res.status(400).json({ error: 'Task description is required' });
  }

  try {
    const [[sectionRow]] = await db.query(
      `SELECT ps.id
       FROM project_sections ps
       INNER JOIN projects p ON ps.project_id = p.id
       WHERE ps.id = ? AND p.company_id = ?
       LIMIT 1`,
      [sectionId, companyId]
    );
    console.log('VALIDATION RESULT:', sectionRow || null);

    if (!sectionRow) {
      console.log('VALIDATION FAILED');
      return res.status(404).json({ error: 'Project section not found' });
    }

    const [[orderRow]] = await db.query(
      'SELECT COALESCE(MAX(sort_order), 0) + 1 AS next_order FROM project_tasks WHERE project_section_id = ?',
      [sectionId]
    );

    const [result] = await db.query(
      `INSERT INTO project_tasks
        (project_section_id, title, description, sort_order)
       VALUES (?, ?, ?, ?)`,
      [sectionId, description, description, orderRow?.next_order || 1]
    );

    console.log('INSERT RESULT:', result);
    const [taskRows] = await db.query(
      'SELECT * FROM project_tasks WHERE id = ?',
      [result.insertId]
    );
    console.log('PROJECT TASK AFTER INSERT:', taskRows);
    console.log('PROJECT TASK CREATE insertId:', result.insertId);
    return res.status(201).json({
      id: result.insertId,
      description,
      sort_order: orderRow?.next_order || 1,
      is_completed: false
    });
  } catch (err) {
    console.error('Greška pri dodavanju zadatka projekta:', err);
    console.error('PROJECT TASK CREATE error details:', {
      params: req.params,
      companyId,
      body: req.body
    });
    return res.status(500).json({ error: 'Database error' });
  }
});

router.delete('/tasks/:taskId', ensureAdmin, async (req, res) => {
  const companyId = req.companyId;
  const taskId = req.params.taskId;

  try {
    const [[taskRow]] = await db.query(
      `SELECT pt.id
       FROM project_tasks pt
       INNER JOIN project_sections ps ON pt.project_section_id = ps.id
       INNER JOIN projects p ON ps.project_id = p.id
       WHERE pt.id = ? AND p.company_id = ?
       LIMIT 1`,
      [taskId, companyId]
    );

    if (!taskRow) {
      return res.status(404).json({ error: 'Task not found' });
    }

    await db.query('DELETE FROM project_tasks WHERE id = ?', [taskId]);
    return res.json({ success: true });
  } catch (err) {
    console.error('Greška pri brisanju zadatka projekta:', err);
    return res.status(500).json({ error: 'Database error' });
  }
});

router.delete('/sections/:sectionId', ensureAdmin, async (req, res) => {
  const companyId = req.companyId;
  const sectionId = req.params.sectionId;

  try {
    const [[sectionRow]] = await db.query(
      `SELECT ps.id
       FROM project_sections ps
       INNER JOIN projects p ON ps.project_id = p.id
       WHERE ps.id = ? AND p.company_id = ?
       LIMIT 1`,
      [sectionId, companyId]
    );

    if (!sectionRow) {
      return res.status(404).json({ error: 'Project section not found' });
    }

    await db.query('DELETE FROM project_tasks WHERE project_section_id = ?', [sectionId]);
    await db.query('DELETE FROM project_sections WHERE id = ?', [sectionId]);
    return res.json({ success: true });
  } catch (err) {
    console.error('Greška pri brisanju sekcije projekta:', err);
    return res.status(500).json({ error: 'Database error' });
  }
});

router.get('/debug/project/:id/db', async (req, res) => {
  const companyId = req.companyId;
  const projectId = req.params.id;

  try {
    const [[projectRow]] = await db.query(
      'SELECT id FROM projects WHERE id = ? AND company_id = ? LIMIT 1',
      [projectId, companyId]
    );

    if (!projectRow) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const [sections] = await db.query(
      'SELECT * FROM project_sections WHERE project_id = ?',
      [projectId]
    );

    const sectionIds = sections.map(section => section.id);
    let tasks = [];
    if (sectionIds.length) {
      const [taskRows] = await db.query(
        `SELECT * FROM project_tasks WHERE project_section_id IN (${sectionIds.map(() => '?').join(',')})`,
        sectionIds
      );
      tasks = taskRows;
    }

    return res.json({ sections, tasks });
  } catch (err) {
    console.error('Greška pri debug dohvaćanju projekta:', err);
    return res.status(500).json({ error: 'Database error' });
  }
});

router.put('/project-tasks/:id/complete', async (req, res) => {
  const companyId = req.companyId;
  const taskId = req.params.id;
  const { is_completed } = req.body;

  try {
    const [[taskRow]] = await db.query(
      `SELECT pt.id
       FROM project_tasks pt
       INNER JOIN project_sections ps ON pt.project_section_id = ps.id
       INNER JOIN projects p ON ps.project_id = p.id
       WHERE pt.id = ? AND p.company_id = ?
       LIMIT 1`,
      [taskId, companyId]
    );

    if (!taskRow) {
      return res.status(404).json({ error: 'Task not found' });
    }

    const completed = Boolean(is_completed);
    const completedAt = completed ? new Date() : null;

    await db.query(
      'UPDATE project_tasks SET is_completed = ?, completed_at = ? WHERE id = ?',
      [completed, completedAt, taskId]
    );

    res.json({ success: true, is_completed: completed, completed_at: completedAt });
  } catch (err) {
    console.error('Greška pri ažuriranju zadatka:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

router.patch('/tasks/:taskId/toggle', async (req, res) => {
  const companyId = req.companyId;
  const taskId = req.params.taskId;
  const userId = req.session?.user?.id ?? null;
  const userRole = req.session?.user?.role ?? null;

  try {
    const [[taskRow]] = await db.query(
      `SELECT pt.id,
              pt.is_completed,
              ps.project_id,
              p.company_id
       FROM project_tasks pt
       INNER JOIN project_sections ps ON pt.project_section_id = ps.id
       INNER JOIN projects p ON ps.project_id = p.id
       WHERE pt.id = ? AND p.company_id = ?
       LIMIT 1`,
      [taskId, companyId]
    );

    if (!taskRow) {
      return res.status(404).json({ error: 'Task not found' });
    }

    const isAdmin = userRole === 'admin';
    if (!isAdmin) {
      const [assignedRows] = await db.query(
        `SELECT 1
         FROM project_users
         WHERE project_id = ? AND user_id = ?
         LIMIT 1`,
        [taskRow.project_id, userId]
      );

      if (!assignedRows.length) {
        return res.status(403).json({ error: 'Forbidden' });
      }
    }

    await db.query(
      'UPDATE project_tasks SET is_completed = NOT is_completed WHERE id = ?',
      [taskId]
    );

    const [[updatedRow]] = await db.query(
      `SELECT id, title, description, is_completed, sort_order
       FROM project_tasks
       WHERE id = ?
       LIMIT 1`,
      [taskId]
    );

    await db.query(
      `INSERT INTO project_activity (project_id, company_id, user_id, type, meta)
       VALUES (?, ?, ?, 'task_toggled', ?)`,
      [
        taskRow.project_id,
        companyId,
        userId,
        JSON.stringify({ task_id: updatedRow.id, is_completed: Boolean(updatedRow.is_completed) })
      ]
    );

    const [[countRow]] = await db.query(
      `SELECT COUNT(*) AS total, COALESCE(SUM(pt.is_completed), 0) AS completed
       FROM project_tasks pt
       INNER JOIN project_sections ps ON pt.project_section_id = ps.id
       INNER JOIN projects p ON ps.project_id = p.id
       WHERE p.id = ? AND p.company_id = ?`,
      [taskRow.project_id, companyId]
    );

    let updatedStatus = null;
    if (countRow?.total > 0 && Number(countRow.total) === Number(countRow.completed)) {
      const [[currentRow]] = await db.query(
        `SELECT status
         FROM projects
         WHERE id = ? AND company_id = ?`,
        [taskRow.project_id, companyId]
      );

      if (currentRow && currentRow.status !== 'completed') {
        await db.query(
          `UPDATE projects
           SET status = 'completed'
           WHERE id = ? AND company_id = ?`,
          [taskRow.project_id, companyId]
        );

        await db.query(
          `INSERT INTO project_activity (project_id, company_id, user_id, type, meta)
           VALUES (?, ?, ?, 'status_changed', ?)`,
          [taskRow.project_id, companyId, userId, JSON.stringify({ from: currentRow.status, to: 'completed' })]
        );

        updatedStatus = 'completed';
      } else {
        updatedStatus = currentRow?.status || null;
      }
    } else {
      const [[currentRow]] = await db.query(
        `SELECT status
         FROM projects
         WHERE id = ? AND company_id = ?`,
        [taskRow.project_id, companyId]
      );
      updatedStatus = currentRow?.status || null;
    }

    return res.json({
      id: updatedRow.id,
      description: updatedRow.description || updatedRow.title,
      is_completed: Boolean(updatedRow.is_completed),
      sort_order: updatedRow.sort_order,
      project_status: updatedStatus
    });
  } catch (err) {
    console.error('Greška pri ažuriranju zadatka projekta:', err);
    return res.status(500).json({ error: 'Greška pri ažuriranju zadatka projekta' });
  }
});

router.patch('/:id/status', async (req, res) => {
  const projectId = req.params.id;
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
       FROM projects
       WHERE id = ? AND company_id = ?`,
      [projectId, companyId]
    );

    if (!currentRow) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const [result] = await db.query(
      `UPDATE projects
       SET status = ?
       WHERE id = ? AND company_id = ?`,
      [status, projectId, companyId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Project not found' });
    }

    await db.query(
      `INSERT INTO project_activity (project_id, company_id, user_id, type, meta)
       VALUES (?, ?, ?, 'status_changed', ?)`,
      [projectId, companyId, userId, JSON.stringify({ from: currentRow.status, to: status })]
    );

    const [[row]] = await db.query(
      `SELECT id, name, description, status, due_date, created_at
       FROM projects
       WHERE id = ? AND company_id = ?`,
      [projectId, companyId]
    );

    return res.json(row || null);
  } catch (err) {
    console.error('Greška pri ažuriranju statusa projekta:', err);
    return res.status(500).json({ error: 'Greška pri ažuriranju statusa projekta' });
  }
});

router.put('/:id', ensureAdmin, async (req, res) => {
  const projectId = req.params.id;
  const companyId = req.companyId;
  const userId = req.session?.user?.id ?? null;
  const {
    name,
    description,
    status,
    due_date,
    owner_user_id,
    assigned_user_ids,
    sections
  } = req.body;

  console.log('PROJECT PUT payload keys:', Object.keys(req.body));
  console.log('sections provided?', Array.isArray(req.body.sections), 'len:', req.body.sections?.length);

  if (!name) {
    return res.status(400).json({ error: 'Project name is required' });
  }

  const allowed = ['open', 'in_progress', 'completed', 'cancelled'];
  const statusProvided = Object.prototype.hasOwnProperty.call(req.body, 'status');
  if (statusProvided && status && !allowed.includes(status)) {
    return res.status(400).json({ error: 'Invalid status' });
  }

  const assignedUsersProvided = Array.isArray(assigned_user_ids);
  const sectionsProvided = Array.isArray(sections);
  const normalizedAssignedIds = assignedUsersProvided
    ? Array.from(new Set(assigned_user_ids.map(Number).filter(Number.isInteger)))
    : [];
  const normalizedSections = sectionsProvided ? sections : [];
  const ownerProvided = Object.prototype.hasOwnProperty.call(req.body, 'owner_user_id');
  const dueDateProvided = Object.prototype.hasOwnProperty.call(req.body, 'due_date');

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    const [[projectRow]] = await connection.query(
      'SELECT id FROM projects WHERE id = ? AND company_id = ? LIMIT 1',
      [projectId, companyId]
    );

    if (!projectRow) {
      await connection.rollback();
      return res.status(404).json({ error: 'Project not found' });
    }

    if (assignedUsersProvided && normalizedAssignedIds.length) {
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

    if (ownerProvided && owner_user_id !== null) {
      const [[ownerRow]] = await connection.query(
        'SELECT id FROM users WHERE id = ? AND company_id = ? LIMIT 1',
        [owner_user_id, companyId]
      );
      if (!ownerRow) {
        await connection.rollback();
        return res.status(400).json({ error: 'Invalid owner_user_id' });
      }
    }

    await connection.query(
      `UPDATE projects
       SET name = ?,
           description = ?,
           status = CASE WHEN ? THEN ? ELSE status END,
           due_date = CASE WHEN ? THEN ? ELSE due_date END,
           owner_user_id = CASE WHEN ? THEN ? ELSE owner_user_id END
       WHERE id = ? AND company_id = ?`,
      [
        name,
        description || null,
        statusProvided,
        status || null,
        dueDateProvided,
        due_date || null,
        ownerProvided,
        owner_user_id ?? null,
        projectId,
        companyId
      ]
    );

    if (assignedUsersProvided && normalizedAssignedIds.length > 0) {
      await connection.query(
        'DELETE FROM project_users WHERE project_id = ?',
        [projectId]
      );
      for (const assignedUserId of normalizedAssignedIds) {
        await connection.query(
          'INSERT INTO project_users (project_id, user_id) VALUES (?, ?)',
          [projectId, assignedUserId]
        );
      }
    }

    if (sectionsProvided && normalizedSections.length > 0) {
      const [existingSections] = await connection.query(
        'SELECT id FROM project_sections WHERE project_id = ?',
        [projectId]
      );
      const existingSectionIds = existingSections.map(row => row.id);
      const payloadSectionIds = normalizedSections
        .map(section => Number(section.id))
        .filter(Number.isInteger);

      const sectionsToDelete = existingSectionIds.filter(id => !payloadSectionIds.includes(id));
      if (sectionsToDelete.length) {
        await connection.query(
          `DELETE FROM project_sections
           WHERE id IN (${sectionsToDelete.map(() => '?').join(',')})
             AND project_id = ?`,
          [...sectionsToDelete, projectId]
        );
      }

      for (let sectionIndex = 0; sectionIndex < normalizedSections.length; sectionIndex += 1) {
        const section = normalizedSections[sectionIndex] || {};
        if (!section.title) {
          await connection.rollback();
          return res.status(400).json({ error: 'Section title is required' });
        }
        const sortOrder = Number.isInteger(section.sort_order) ? section.sort_order : sectionIndex + 1;
        let sectionId = Number(section.id);

        if (Number.isInteger(sectionId) && existingSectionIds.includes(sectionId)) {
          await connection.query(
            `UPDATE project_sections
             SET title = ?, sort_order = ?
             WHERE id = ? AND project_id = ?`,
            [section.title, sortOrder, sectionId, projectId]
          );
        } else {
          const [insertResult] = await connection.query(
            `INSERT INTO project_sections (project_id, title, sort_order)
             VALUES (?, ?, ?)`,
            [projectId, section.title, sortOrder]
          );
          sectionId = insertResult.insertId;
        }

        const sectionTasks = Array.isArray(section.tasks) ? section.tasks : [];
        const [existingTasks] = await connection.query(
          `SELECT id, is_completed
           FROM project_tasks
           WHERE project_section_id = ?`,
          [sectionId]
        );
        const existingTaskIds = existingTasks.map(row => row.id);
        const payloadTaskIds = sectionTasks
          .map(task => Number(task.id))
          .filter(Number.isInteger);

        const tasksToDelete = existingTaskIds.filter(id => !payloadTaskIds.includes(id));
        if (tasksToDelete.length) {
          await connection.query(
            `DELETE FROM project_tasks
             WHERE id IN (${tasksToDelete.map(() => '?').join(',')})
               AND project_section_id = ?`,
            [...tasksToDelete, sectionId]
          );
        }

        for (let taskIndex = 0; taskIndex < sectionTasks.length; taskIndex += 1) {
          const task = sectionTasks[taskIndex] || {};
          const taskTitle = task.title || task.description;
          if (!taskTitle) {
            await connection.rollback();
            return res.status(400).json({ error: 'Task description is required' });
          }
          const taskSortOrder = Number.isInteger(task.sort_order) ? task.sort_order : taskIndex + 1;
          const taskDescription = task.description || null;
          const taskId = Number(task.id);

          if (Number.isInteger(taskId) && existingTaskIds.includes(taskId)) {
            await connection.query(
              `UPDATE project_tasks
               SET title = ?, description = ?, sort_order = ?
               WHERE id = ? AND project_section_id = ?`,
              [taskTitle, taskDescription, taskSortOrder, taskId, sectionId]
            );
          } else {
            await connection.query(
              `INSERT INTO project_tasks (project_section_id, title, description, sort_order)
               VALUES (?, ?, ?, ?)`,
              [sectionId, taskTitle, taskDescription, taskSortOrder]
            );
          }
        }
      }
    }

    await connection.query(
      `INSERT INTO project_activity (project_id, company_id, user_id, type, meta)
       VALUES (?, ?, ?, 'edited', NULL)`,
      [projectId, companyId, userId]
    );

    await connection.commit();
  } catch (err) {
    await connection.rollback();
    console.error('Greška pri ažuriranju projekta:', err);
    return res.status(500).json({ error: 'Greška pri ažuriranju projekta' });
  } finally {
    connection.release();
  }

  try {
    const [[project]] = await db.query(
      `SELECT p.id, p.name, p.description, p.status, p.due_date, p.created_at,
              ou.id AS owner_id, COALESCE(ou.full_name, ou.username) AS owner_name
       FROM projects p
       LEFT JOIN users ou ON p.owner_user_id = ou.id
       WHERE p.id = ? AND p.company_id = ?
       LIMIT 1`,
      [projectId, companyId]
    );

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const [assignedUsers] = await db.query(
      `SELECT u.id, COALESCE(u.full_name, u.username) AS name
       FROM project_users pu
       INNER JOIN projects p ON pu.project_id = p.id
       INNER JOIN users u ON pu.user_id = u.id
       WHERE pu.project_id = ? AND p.company_id = ?
       ORDER BY u.full_name ASC, u.username ASC`,
      [projectId, companyId]
    );

    const [sections] = await db.query(
      `SELECT id, title, sort_order
       FROM project_sections
       WHERE project_id = ?
       ORDER BY sort_order ASC, id ASC`,
      [projectId]
    );

    const sectionIds = sections.map(section => section.id);
    const tasksBySection = new Map();
    let totalTasks = 0;
    let completedTasks = 0;

    if (sectionIds.length) {
      const [taskRows] = await db.query(
        `SELECT id, project_section_id, title, description, is_completed, sort_order
         FROM project_tasks
         WHERE project_section_id IN (${sectionIds.map(() => '?').join(',')})
         ORDER BY sort_order ASC, id ASC`,
        sectionIds
      );

      taskRows.forEach(row => {
        totalTasks += 1;
        if (row.is_completed) {
          completedTasks += 1;
        }
        if (!tasksBySection.has(row.project_section_id)) {
          tasksBySection.set(row.project_section_id, []);
        }
        tasksBySection.get(row.project_section_id).push({
          id: row.id,
          description: row.description || row.title,
          is_completed: Boolean(row.is_completed),
          sort_order: row.sort_order
        });
      });
    }

    const payloadSections = sections.map(section => ({
      id: section.id,
      title: section.title,
      sort_order: section.sort_order,
      tasks: tasksBySection.get(section.id) || []
    }));

    const progressPercent = totalTasks > 0
      ? Math.round((completedTasks / totalTasks) * 100)
      : 0;

    return res.json({
      id: project.id,
      name: project.name,
      description: project.description,
      status: project.status,
      due_date: project.due_date,
      created_at: project.created_at,
      owner: project.owner_id ? { id: project.owner_id, name: project.owner_name } : null,
      assigned_users: assignedUsers,
      sections: payloadSections,
      progress: {
        total_tasks: totalTasks,
        completed_tasks: completedTasks,
        percent: progressPercent
      }
    });
  } catch (err) {
    console.error('Greška pri dohvaćanju projekta:', err);
    return res.status(500).json({ error: 'Database error' });
  }
});

router.put('/project-tasks/:id/assignees', ensureAdmin, async (req, res) => {
  const companyId = req.companyId;
  const taskId = req.params.id;
  const { assigned_user_ids } = req.body;

  try {
    const [[taskRow]] = await db.query(
      `SELECT pt.id
       FROM project_tasks pt
       INNER JOIN project_sections ps ON pt.project_section_id = ps.id
       INNER JOIN projects p ON ps.project_id = p.id
       WHERE pt.id = ? AND p.company_id = ?
       LIMIT 1`,
      [taskId, companyId]
    );

    if (!taskRow) {
      return res.status(404).json({ error: 'Task not found' });
    }

    const rawAssignedIds = Array.isArray(assigned_user_ids) ? assigned_user_ids : [];
    const normalizedAssignedIds = Array.from(
      new Set(
        rawAssignedIds
          .map(value => Number(value))
          .filter(value => Number.isInteger(value))
      )
    );

    if (normalizedAssignedIds.length) {
      const [userRows] = await db.query(
        `SELECT id
         FROM users
         WHERE id IN (${normalizedAssignedIds.map(() => '?').join(',')})
           AND company_id = ?`,
        [...normalizedAssignedIds, companyId]
      );
      if (userRows.length !== normalizedAssignedIds.length) {
        return res.status(400).json({ error: 'Invalid assigned users' });
      }
    }

    const connection = await db.getConnection();
    try {
      await connection.beginTransaction();
      await connection.query('DELETE FROM project_task_users WHERE project_task_id = ?', [taskId]);
      if (normalizedAssignedIds.length) {
        const values = normalizedAssignedIds.map(userId => [taskId, userId]);
        await connection.query(
          'INSERT INTO project_task_users (project_task_id, user_id) VALUES ? ',
          [values]
        );
      }
      await connection.commit();
      res.json({ success: true });
    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }
  } catch (err) {
    console.error('Greška pri ažuriranju dodjela:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

router.post('/project-tasks/:id/comments', async (req, res) => {
  console.log('COMMENT ROUTE HIT');
  console.log('Params:', req.params);
  console.log('Body:', req.body);
  console.log('Company:', req.companyId);
  console.log('User:', req.session?.user?.id);

  const companyId = req.companyId;
  const taskId = req.params.id;
  const userId = req.session?.user?.id;
  const { comment } = req.body;

  if (!comment || !comment.trim()) {
    return res.status(400).json({ error: 'Comment is required' });
  }

  try {
    const [[taskRow]] = await db.query(
      `SELECT pt.id
       FROM project_tasks pt
       INNER JOIN project_sections ps ON pt.project_section_id = ps.id
       INNER JOIN projects p ON ps.project_id = p.id
       WHERE pt.id = ? AND p.company_id = ?
       LIMIT 1`,
      [taskId, companyId]
    );

    if (!taskRow) {
      return res.status(404).json({ error: 'Task not found' });
    }

    const [result] = await db.query(
      `INSERT INTO project_task_comments (project_task_id, user_id, comment)
       VALUES (?, ?, ?)`,
      [taskId, userId, comment]
    );

    console.log('COMMENT INSERT RESULT:', result);
    const [commentRows] = await db.query(
      'SELECT * FROM project_task_comments WHERE id = ?',
      [result.insertId]
    );
    console.log('COMMENT ROW AFTER INSERT:', commentRows);

    return res.status(201).json({
      id: result.insertId,
      comment,
      user_id: userId,
      created_at: new Date()
    });
  } catch (err) {
    console.error('COMMENT CREATE ERROR:', err);
    return res.status(500).json({ error: 'Failed to create comment' });
  }
});

router.post('/:id/attachments', ensureAdmin, uploadProjectFile, async (req, res) => {
  const projectId = req.params.id;
  const companyId = req.companyId;
  const userId = req.session?.user?.id ?? null;

  if (!req.file) {
    return res.status(400).json({ error: 'Attachment file is required' });
  }

  try {
    const [[projectRow]] = await db.query(
      'SELECT id FROM projects WHERE id = ? AND company_id = ? LIMIT 1',
      [projectId, companyId]
    );

    if (!projectRow) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const uploadsDir = path.join(__dirname, '..', 'uploads', 'projects');
    fs.mkdirSync(uploadsDir, { recursive: true });

    const timestamp = Date.now();
    const ext = path.extname(req.file.originalname || '').toLowerCase() || '.bin';
    const filename = `${companyId}-${projectId}-${timestamp}${ext}`;
    const filePath = path.join(uploadsDir, filename);
    fs.writeFileSync(filePath, req.file.buffer);

    const storedPath = `/uploads/projects/${filename}`;
    await db.query(
      `INSERT INTO project_attachments
        (project_id, company_id, file_path, uploaded_by)
       VALUES (?, ?, ?, ?)`,
      [projectId, companyId, storedPath, userId]
    );

    await db.query(
      `INSERT INTO project_activity (project_id, company_id, user_id, type, meta)
       VALUES (?, ?, ?, 'attachment_added', ?)`,
      [projectId, companyId, userId, JSON.stringify({ file_path: storedPath })]
    );

    const [[project]] = await db.query(
      `SELECT id, name, description, status, due_date, created_at
       FROM projects
       WHERE id = ? AND company_id = ?
       LIMIT 1`,
      [projectId, companyId]
    );

    const [assignedUsers] = await db.query(
      `SELECT u.id, COALESCE(u.full_name, u.username) AS name
       FROM project_users pu
       INNER JOIN projects p ON pu.project_id = p.id
       INNER JOIN users u ON pu.user_id = u.id
       WHERE pu.project_id = ? AND p.company_id = ?
       ORDER BY u.full_name ASC, u.username ASC`,
      [projectId, companyId]
    );

    const [sections] = await db.query(
      `SELECT id, title, sort_order
       FROM project_sections
       WHERE project_id = ?
       ORDER BY sort_order ASC, id ASC`,
      [projectId]
    );

    const sectionIds = sections.map(section => section.id);
    const tasksBySection = new Map();
    let totalTasks = 0;
    let completedTasks = 0;

    if (sectionIds.length) {
      const [taskRows] = await db.query(
        `SELECT id, project_section_id, title, description, is_completed, sort_order
         FROM project_tasks
         WHERE project_section_id IN (${sectionIds.map(() => '?').join(',')})
         ORDER BY sort_order ASC, id ASC`,
        sectionIds
      );

      taskRows.forEach(row => {
        totalTasks += 1;
        if (row.is_completed) {
          completedTasks += 1;
        }
        if (!tasksBySection.has(row.project_section_id)) {
          tasksBySection.set(row.project_section_id, []);
        }
        tasksBySection.get(row.project_section_id).push({
          id: row.id,
          description: row.description || row.title,
          is_completed: Boolean(row.is_completed),
          sort_order: row.sort_order
        });
      });
    }

    const payloadSections = sections.map(section => ({
      id: section.id,
      title: section.title,
      sort_order: section.sort_order,
      tasks: tasksBySection.get(section.id) || []
    }));

    const progressPercent = totalTasks > 0
      ? Math.round((completedTasks / totalTasks) * 100)
      : 0;

    return res.status(201).json({
      id: project.id,
      name: project.name,
      description: project.description,
      status: project.status,
      due_date: project.due_date,
      created_at: project.created_at,
      assigned_users: assignedUsers,
      sections: payloadSections,
      progress: {
        total_tasks: totalTasks,
        completed_tasks: completedTasks,
        percent: progressPercent
      }
    });
  } catch (err) {
    console.error('Greška pri spremanju priloga projekta:', err);
    return res.status(500).json({ error: 'Greška pri spremanju priloga projekta' });
  }
});

router.patch('/tasks/:taskId/assign', ensureAdmin, async (req, res) => {
  const companyId = req.companyId;
  const taskId = req.params.taskId;
  const { user_ids } = req.body;

  const normalizedIds = Array.isArray(user_ids)
    ? Array.from(new Set(user_ids.map(Number).filter(Number.isInteger)))
    : [];

  try {
    const [[taskRow]] = await db.query(
      `SELECT pt.id, ps.project_id
       FROM project_tasks pt
       INNER JOIN project_sections ps ON pt.project_section_id = ps.id
       INNER JOIN projects p ON ps.project_id = p.id
       WHERE pt.id = ? AND p.company_id = ?
       LIMIT 1`,
      [taskId, companyId]
    );

    if (!taskRow) {
      return res.status(404).json({ error: 'Task not found' });
    }

    if (normalizedIds.length) {
      const [userRows] = await db.query(
        `SELECT id
         FROM users
         WHERE id IN (${normalizedIds.map(() => '?').join(',')})
           AND company_id = ?`,
        [...normalizedIds, companyId]
      );
      if (userRows.length !== normalizedIds.length) {
        return res.status(400).json({ error: 'Invalid user_ids' });
      }
    }

    const connection = await db.getConnection();
    try {
      await connection.beginTransaction();
      await connection.query('DELETE FROM project_task_users WHERE task_id = ?', [taskId]);

      if (normalizedIds.length) {
        const values = normalizedIds.map(userId => [taskId, userId]);
        await connection.query(
          'INSERT INTO project_task_users (task_id, user_id) VALUES ? ',
          [values]
        );
      }

      await connection.commit();
      return res.json({ success: true });
    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }
  } catch (err) {
    console.error('Greška pri ažuriranju dodjela zadatka projekta:', err);
    return res.status(500).json({ error: 'Greška pri ažuriranju dodjela zadatka projekta' });
  }
});

router.post('/tasks/:taskId/comments', async (req, res) => {
  const companyId = req.companyId;
  const taskId = req.params.taskId;
  const userId = req.session?.user?.id;
  const { comment } = req.body;

  if (!comment) {
    return res.status(400).json({ error: 'Comment is required' });
  }

  try {
    const [[taskRow]] = await db.query(
      `SELECT pt.id, ps.project_id
       FROM project_tasks pt
       INNER JOIN project_sections ps ON pt.project_section_id = ps.id
       INNER JOIN projects p ON ps.project_id = p.id
       WHERE pt.id = ? AND p.company_id = ?
       LIMIT 1`,
      [taskId, companyId]
    );

    if (!taskRow) {
      return res.status(404).json({ error: 'Task not found' });
    }

    const [result] = await db.query(
      `INSERT INTO project_task_comments (task_id, company_id, user_id, comment)
       VALUES (?, ?, ?, ?)`,
      [taskId, companyId, userId, comment]
    );

    await db.query(
      `INSERT INTO project_activity (project_id, company_id, user_id, type, meta)
       VALUES (?, ?, ?, 'task_commented', ?)`,
      [taskRow.project_id, companyId, userId, JSON.stringify({ task_id: taskId, comment_id: result.insertId })]
    );

    return res.status(201).json({ id: result.insertId, user_id: userId });
  } catch (err) {
    console.error('Greška pri dodavanju komentara zadatku projekta:', err);
    return res.status(500).json({ error: 'Greška pri dodavanju komentara zadatku projekta' });
  }
});

router.get('/:id/attachments', async (req, res) => {
  const projectId = req.params.id;
  const companyId = req.companyId;

  try {
    const [[projectRow]] = await db.query(
      'SELECT id FROM projects WHERE id = ? AND company_id = ? LIMIT 1',
      [projectId, companyId]
    );

    if (!projectRow) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const [rows] = await db.query(
      `SELECT id, file_path AS url
       FROM project_attachments
       WHERE project_id = ? AND company_id = ?
       ORDER BY created_at DESC, id DESC`,
      [projectId, companyId]
    );

    return res.json(rows);
  } catch (err) {
    console.error('Greška pri dohvaćanju priloga projekta:', err);
    return res.status(500).json({ error: 'Greška pri dohvaćanju priloga projekta' });
  }
});

router.get('/:id/activity', async (req, res) => {
  const projectId = req.params.id;
  const companyId = req.companyId;

  try {
    const [[projectRow]] = await db.query(
      'SELECT id FROM projects WHERE id = ? AND company_id = ? LIMIT 1',
      [projectId, companyId]
    );

    if (!projectRow) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const [rows] = await db.query(
      `SELECT a.id,
              a.type,
              a.meta,
              a.created_at,
              u.id AS user_id,
              COALESCE(u.full_name, u.username) AS user_name
       FROM project_activity a
       INNER JOIN users u ON a.user_id = u.id
       WHERE a.project_id = ?
         AND a.company_id = ?
       ORDER BY a.created_at DESC, a.id DESC`,
      [projectId, companyId]
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
    console.error('Greška pri dohvaćanju aktivnosti projekta:', err);
    return res.status(500).json({ error: 'Greška pri dohvaćanju aktivnosti projekta' });
  }
});

module.exports = router;
