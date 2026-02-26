const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const db = require('../db');
const { logAudit } = require('../utils/auditLog');

const router = express.Router();

const signaturesDir = path.join(__dirname, '..', 'uploads', 'signatures');
const ensureSignaturesDir = () => {
  if (!fs.existsSync(signaturesDir)) {
    fs.mkdirSync(signaturesDir, { recursive: true });
  }
};

const signatureStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    ensureSignaturesDir();
    cb(null, signaturesDir);
  },
  filename: (req, file, cb) => {
    const companyId = req.companyId;
    const reportType = req.params.type;
    const reportId = req.params.id;
    const role = file.fieldname === 'technician_signature' ? 'tech' : 'client';
    const timestamp = Date.now();
    cb(null, `${companyId}-${reportType}-${reportId}-${role}-${timestamp}.png`);
  }
});

const uploadSignatures = multer({
  storage: signatureStorage,
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === 'image/png') {
      cb(null, true);
    } else {
      cb(new Error('Only PNG signatures are allowed'));
    }
  }
});

const canSignReport = async ({ companyId, reportType, reportId, userId, role }) => {
  if (role === 'admin') return true;
  if (reportType === 'rms') {
    const [rows] = await db.query(
      'SELECT id FROM rms_visits WHERE id = ? AND company_id = ? AND user_id = ?',
      [reportId, companyId, userId]
    );
    return rows.length > 0;
  }

  const [rows] = await db.query(
    'SELECT id FROM interventions WHERE id = ? AND company_id = ? AND technician = (SELECT username FROM users WHERE id = ? LIMIT 1)',
    [reportId, companyId, userId]
  );
  return rows.length > 0;
};

const computeDocumentHash = (report) =>
  crypto.createHash('sha256').update(JSON.stringify(report)).digest('hex');

router.post(
  '/:type/:id/sign',
  uploadSignatures.fields([
    { name: 'technician_signature', maxCount: 1 },
    { name: 'client_signature', maxCount: 1 }
  ]),
  async (req, res) => {
    try {
      const companyId = req.companyId;
      const userId = req.session?.user?.id;
      const userRole = req.session?.user?.role;
      const { type, id } = req.params;
      const reportId = Number(id);

      if (!companyId || !userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      if (!['rms', 'intervention'].includes(type)) {
        return res.status(400).json({ error: 'Invalid report type' });
      }

      if (!Number.isFinite(reportId)) {
        return res.status(400).json({ error: 'Invalid report id' });
      }

      const allowed = await canSignReport({
        companyId,
        reportType: type,
        reportId,
        userId,
        role: userRole
      });

      if (!allowed) {
        return res.status(403).json({ error: 'Forbidden' });
      }

      const table = type === 'rms' ? 'rms_visits' : 'interventions';
      const [rows] = await db.query(
        `SELECT * FROM ${table} WHERE id = ? AND company_id = ?`,
        [reportId, companyId]
      );

      if (rows.length === 0) {
        return res.status(404).json({ error: 'Report not found' });
      }

      const report = rows[0];

      if (report.signature_status === 'signed') {
        return res.status(403).json({ error: 'Report already signed' });
      }

      const technicianFile = req.files?.technician_signature?.[0];
      const clientFile = req.files?.client_signature?.[0];

      if (technicianFile && report.technician_signature_path) {
        return res.status(400).json({ error: 'Technician signature already exists' });
      }

      if (clientFile && report.client_signature_path) {
        return res.status(400).json({ error: 'Client signature already exists' });
      }

      const updateFields = [];
      const params = [];

      if (technicianFile) {
        updateFields.push('technician_signature_path = ?');
        params.push(`/uploads/signatures/${technicianFile.filename}`);
      }

      if (clientFile) {
        updateFields.push('client_signature_path = ?');
        params.push(`/uploads/signatures/${clientFile.filename}`);
      }

      if (!technicianFile && !clientFile) {
        return res.status(400).json({ error: 'No signatures provided' });
      }

      const documentHash = computeDocumentHash({
        ...report,
        technician_signature_path: technicianFile
          ? `/uploads/signatures/${technicianFile.filename}`
          : report.technician_signature_path,
        client_signature_path: clientFile
          ? `/uploads/signatures/${clientFile.filename}`
          : report.client_signature_path
      });

      updateFields.push('document_hash = ?');
      params.push(documentHash);

      const technicianPath = technicianFile
        ? `/uploads/signatures/${technicianFile.filename}`
        : report.technician_signature_path;
      const clientPath = clientFile
        ? `/uploads/signatures/${clientFile.filename}`
        : report.client_signature_path;

      const willBeSigned = Boolean(technicianPath && clientPath);
      if (willBeSigned) {
        updateFields.push("signature_status = 'signed'");
        updateFields.push('signed_at = NOW()');
        updateFields.push('signed_by_user_id = ?');
        updateFields.push('signature_ip = ?');
        params.push(userId, req.ip);
      }

      params.push(reportId, companyId);

      await db.query(
        `UPDATE ${table} SET ${updateFields.join(', ')} WHERE id = ? AND company_id = ?`,
        params
      );

      const [updatedRows] = await db.query(
        `SELECT * FROM ${table} WHERE id = ? AND company_id = ?`,
        [reportId, companyId]
      );

      if (willBeSigned) {
        await logAudit({
          userId,
          companyId,
          action: 'sign_report',
          metadata: { reportId, type }
        });
      }

      res.json(updatedRows[0]);
    } catch (err) {
      console.error('Signature upload error:', err);
      res.status(500).json({ error: 'Signature upload failed' });
    }
  }
);

module.exports = router;
