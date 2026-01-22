import express from 'express';
import { db } from '../database.js';
import path from 'path';
import { fileURLToPath } from 'url';

const router = express.Router();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// Pfad zur Datenbank: server/routes/ -> ../../data/meinespesen.db
const DB_PATH = path.join(__dirname, '..', '..', 'data', 'meinespesen.db');

router.get('/', (req, res) => {
  db.get("SELECT data FROM config WHERE id = 1", (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(row ? JSON.parse(row.data) : {});
  });
});

router.post('/', (req, res) => {
  db.run("UPDATE config SET data = ? WHERE id = 1", [JSON.stringify(req.body)], (err) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true });
  });
});

// BACKUP ROUTE
router.get('/backup', (req, res) => {
  const dateStr = new Date().toISOString().split('T')[0];
  const fileName = `meinespesen_backup_${dateStr}.db`;
  
  res.download(DB_PATH, fileName, (err) => {
    if (err) {
      console.error("Backup download error:", err);
      if (!res.headersSent) {
        res.status(500).json({ error: "Fehler beim Herunterladen der Datenbank." });
      }
    }
  });
});

export default router;