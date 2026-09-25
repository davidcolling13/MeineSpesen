import express from 'express';
import { db } from '../database.js';

const router = express.Router();

// GET All
router.get('/', (req, res) => {
  db.all("SELECT * FROM employees ORDER BY lastName ASC, firstName ASC", (err, rows) => {
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
    [id.trim(), firstName?.trim() || '', lastName?.trim() || '', email?.trim() || ''],
    (err) => {
      if (err) {
        console.error('Error saving employee:', err);
        return res.status(500).json({ error: err.message });
      }
      res.json({ success: true });
    }
  );
});

// DELETE (mit Kaskade für zugehörige Movements)
router.delete('/:id', (req, res) => {
  const empId = req.params.id;
  db.serialize(() => {
    db.run("DELETE FROM movements WHERE employeeId = ?", [empId]);
    db.run("DELETE FROM employees WHERE id = ?", [empId], (err) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true });
    });
  });
});

export default router;
