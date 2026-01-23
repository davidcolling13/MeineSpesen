import express from 'express';
import { db, addLogEntry } from '../database.js';

const router = express.Router();

// GET Logs (Limit 100 for UI performance)
router.get('/', (req, res) => {
  const limit = req.query.limit ? parseInt(req.query.limit) : 200;
  
  db.all("SELECT * FROM system_logs ORDER BY id DESC LIMIT ?", [limit], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// POST (Log from Frontend)
router.post('/', (req, res) => {
  const { level, message, details } = req.body;
  addLogEntry(level || 'INFO', message || 'Frontend Log', details || '');
  res.json({ success: true });
});

// DELETE (Clear Logs)
router.delete('/', (req, res) => {
  db.run("DELETE FROM system_logs", (err) => {
    if (err) return res.status(500).json({ error: err.message });
    addLogEntry('INFO', 'Systemprotokoll manuell bereinigt.');
    res.json({ success: true });
  });
});

export default router;