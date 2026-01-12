import express from 'express';
import { db } from '../database.js';

const router = express.Router();

// GET All
router.get('/', (req, res) => {
  db.all("SELECT * FROM employees", (err, rows) => {
    if (err) {
      console.error('Error fetching employees:', err);
      return res.status(500).json({ error: err.message });
    }
    res.json(rows);
  });
});

// POST (Create/Update)
router.post('/', (req, res) => {
  const { id, firstName, lastName, email } = req.body;
  if (!id) return res.status(400).json({ error: "ID is required" });
  
  db.run(`INSERT INTO employees (id, firstName, lastName, email) 
          VALUES (?, ?, ?, ?) 
          ON CONFLICT(id) DO UPDATE SET firstName=excluded.firstName, lastName=excluded.lastName, email=excluded.email`,
    [id, firstName, lastName, email],
    (err) => {
      if (err) {
        console.error('Error saving employee:', err);
        return res.status(500).json({ error: err.message });
      }
      res.json({ success: true });
    }
  );
});

// DELETE
router.delete('/:id', (req, res) => {
  db.run("DELETE FROM employees WHERE id = ?", [req.params.id], (err) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true });
  });
});

export default router;