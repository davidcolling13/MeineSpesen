import express from 'express';
import { db, dbRun, addLogEntry } from '../database.js';

const router = express.Router();

// GET All
router.get('/', (req, res) => {
  db.all("SELECT * FROM movements", (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    const movements = rows.map(r => ({ ...r, isManual: !!r.isManual }));
    res.json(movements);
  });
});

// CLEANUP (Old Data)
router.delete('/cleanup', async (req, res) => {
  const { beforeDate } = req.query;
  if (!beforeDate) {
    return res.status(400).json({ error: "Parameter 'beforeDate' ist erforderlich." });
  }

  try {
      const result = await dbRun("DELETE FROM movements WHERE date < ?", [beforeDate]);
      // @ts-ignore
      res.json({ success: true, deletedCount: result.changes });
      addLogEntry('INFO', `Cleanup durchgeführt vor ${beforeDate}`);
  } catch (e) {
      res.status(500).json({ error: e.message });
  }
});

// BATCH IMPORT (Robust Transaction)
router.post('/batch', async (req, res) => {
  const movements = req.body;
  if (!Array.isArray(movements)) return res.status(400).json({ error: "Expected array" });

  const sql = `INSERT INTO movements (id, employeeId, date, location, startTimeRaw, endTimeRaw, startTimeCorr, endTimeCorr, durationNetto, amount, isManual) 
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
      isManual=excluded.isManual`;

  let stmt = null;

  try {
    // 1. Transaktion starten
    await dbRun("BEGIN TRANSACTION");

    // 2. Statement vorbereiten
    stmt = db.prepare(sql);
    
    // 3. Loop mit Promise-Wrapping für jedes Statement
    for (const m of movements) {
        await new Promise((resolve, reject) => {
            stmt.run(
                m.id, m.employeeId, m.date, m.location, 
                m.startTimeRaw, m.endTimeRaw, m.startTimeCorr, m.endTimeCorr, 
                m.durationNetto, m.amount, m.isManual ? 1 : 0,
                (err) => {
                    if (err) reject(err);
                    else resolve(true);
                }
            );
        });
    }

    // 4. Finalize bei Erfolg
    await new Promise((resolve, reject) => {
        stmt.finalize((err) => {
            if (err) reject(err);
            else resolve(true);
        });
    });
    stmt = null; // Mark as finalized

    // 5. Commit
    await dbRun("COMMIT");
    
    addLogEntry('INFO', `Batch Import erfolgreich: ${movements.length} Einträge.`);
    res.json({ success: true });

  } catch (err) {
    console.error("Batch Transaction Error:", err);
    
    // Finalize cleanup if failed in loop
    if (stmt) {
        stmt.finalize(() => {}); 
    }

    await dbRun("ROLLBACK"); // Alles rückgängig machen bei Fehler
    addLogEntry('ERROR', 'Batch Import fehlgeschlagen, Rollback ausgeführt.', err.message);
    res.status(500).json({ error: "Datenbankfehler beim Import: " + err.message });
  }
});

// SINGLE UPDATE
router.post('/update', async (req, res) => {
  const m = req.body;
  try {
      await dbRun(`INSERT INTO movements (id, employeeId, date, location, startTimeRaw, endTimeRaw, startTimeCorr, endTimeCorr, durationNetto, amount, isManual) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET 
          location=excluded.location,
          startTimeCorr=excluded.startTimeCorr,
          endTimeCorr=excluded.endTimeCorr,
          durationNetto=excluded.durationNetto,
          amount=excluded.amount,
          isManual=excluded.isManual`,
        [m.id, m.employeeId, m.date, m.location, m.startTimeRaw, m.endTimeRaw, m.startTimeCorr, m.endTimeCorr, m.durationNetto, m.amount, m.isManual ? 1 : 0]
      );
      res.json({ success: true });
  } catch (e) {
      res.status(500).json({ error: e.message });
  }
});

// DELETE SINGLE
router.delete('/:id', async (req, res) => {
  try {
      const result = await dbRun("DELETE FROM movements WHERE id = ?", [req.params.id]);
      // @ts-ignore
      if (result.changes === 0) return res.status(404).json({ error: "Movement not found" });
      res.json({ success: true });
  } catch (e) {
      res.status(500).json({ error: e.message });
  }
});

export default router;