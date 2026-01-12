import express from 'express';
import { db } from '../database.js';

const router = express.Router();

// GET All
router.get('/', (req, res) => {
  db.all("SELECT * FROM movements", (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    const movements = rows.map(r => ({ ...r, isManual: !!r.isManual }));
    res.json(movements);
  });
});

// CLEANUP (Old Data) - MUSS VOR /:id STEHEN
router.delete('/cleanup', (req, res) => {
  const { beforeDate } = req.query;
  if (!beforeDate) {
    return res.status(400).json({ error: "Parameter 'beforeDate' ist erforderlich." });
  }

  db.run("DELETE FROM movements WHERE date < ?", [beforeDate], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true, deletedCount: this.changes });
  });
});

// BATCH IMPORT
router.post('/batch', (req, res) => {
  const movements = req.body;
  if (!Array.isArray(movements)) return res.status(400).json({ error: "Expected array" });

  const stmt = db.prepare(`INSERT INTO movements (id, employeeId, date, location, startTimeRaw, endTimeRaw, startTimeCorr, endTimeCorr, durationNetto, amount, isManual) 
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET 
      employeeId=excluded.employeeId, 
      date=excluded.date,
      location=excluded.location,
      startTimeRaw=excluded.startTimeRaw,
      endTimeRaw=excluded.endTimeRaw,
      startTimeCorr=excluded.startTimeCorr,
      endTimeCorr=excluded.endTimeCorr,
      durationNetto=excluded.durationNetto,
      amount=excluded.amount,
      isManual=excluded.isManual
  `);

  db.serialize(() => {
    db.run("BEGIN TRANSACTION");
    movements.forEach(m => {
      stmt.run(m.id, m.employeeId, m.date, m.location, m.startTimeRaw, m.endTimeRaw, m.startTimeCorr, m.endTimeCorr, m.durationNetto, m.amount, m.isManual ? 1 : 0);
    });
    db.run("COMMIT", (err) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true });
    });
    stmt.finalize();
  });
});

// SINGLE UPDATE
router.post('/update', (req, res) => {
  const m = req.body;
  db.run(`INSERT INTO movements (id, employeeId, date, location, startTimeRaw, endTimeRaw, startTimeCorr, endTimeCorr, durationNetto, amount, isManual) 
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET 
      location=excluded.location,
      startTimeCorr=excluded.startTimeCorr,
      endTimeCorr=excluded.endTimeCorr,
      durationNetto=excluded.durationNetto,
      amount=excluded.amount,
      isManual=excluded.isManual`,
    [m.id, m.employeeId, m.date, m.location, m.startTimeRaw, m.endTimeRaw, m.startTimeCorr, m.endTimeCorr, m.durationNetto, m.amount, m.isManual ? 1 : 0],
    (err) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true });
    }
  );
});

// DELETE SINGLE
router.delete('/:id', (req, res) => {
  db.run("DELETE FROM movements WHERE id = ?", [req.params.id], function(err) {
      if (err) return res.status(500).json({ error: err.message });
      if (this.changes === 0) return res.status(404).json({ error: "Movement not found" });
      res.json({ success: true });
  });
});

export default router;