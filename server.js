import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import cors from 'cors';
import { createRequire } from 'module';

// ES Module Workarounds
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = createRequire(import.meta.url);

// Stabilize SQLite Import
const sqlite3 = require('sqlite3').verbose();

const app = express();
const PORT = process.env.PORT || 3001;
const DATA_DIR = path.join(__dirname, 'data');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)){
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DB_PATH = path.join(DATA_DIR, 'meinespesen.db');
const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) {
    console.error('CRITICAL: Could not connect to database', err);
  } else {
    console.log('✓ Connected to database at', DB_PATH);
    initDb();
  }
});

// --- Middleware ---
app.use(cors()); 
app.use(express.json({ limit: '50mb' }));

// Request Logger
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

// --- Database Init ---
function initDb() {
  db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS employees (
      id TEXT PRIMARY KEY,
      firstName TEXT,
      lastName TEXT,
      email TEXT
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS config (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      data TEXT
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS movements (
      id TEXT PRIMARY KEY,
      employeeId TEXT,
      date TEXT,
      location TEXT,
      startTimeRaw TEXT,
      endTimeRaw TEXT,
      startTimeCorr TEXT,
      endTimeCorr TEXT,
      durationNetto REAL,
      amount REAL,
      isManual INTEGER
    )`);

    // Init default config if not exists
    db.get("SELECT id FROM config WHERE id = 1", (err, row) => {
      if (!row) {
        const defaultConfig = JSON.stringify({
          addStartMins: 0,
          subEndMins: 0,
          rules: [{ hoursThreshold: 8, amount: 15 }]
        });
        db.run("INSERT INTO config (id, data) VALUES (1, ?)", [defaultConfig]);
      }
    });
  });
}

// --- API Routes (MUST BE BEFORE STATIC FILES) ---

// Health Check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Employees
app.get('/api/employees', (req, res) => {
  db.all("SELECT * FROM employees", (err, rows) => {
    if (err) {
      console.error('Error fetching employees:', err);
      return res.status(500).json({ error: err.message });
    }
    res.json(rows);
  });
});

app.post('/api/employees', (req, res) => {
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

app.delete('/api/employees/:id', (req, res) => {
  db.run("DELETE FROM employees WHERE id = ?", [req.params.id], (err) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true });
  });
});

// Config
app.get('/api/config', (req, res) => {
  db.get("SELECT data FROM config WHERE id = 1", (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(row ? JSON.parse(row.data) : {});
  });
});

app.post('/api/config', (req, res) => {
  db.run("UPDATE config SET data = ? WHERE id = 1", [JSON.stringify(req.body)], (err) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true });
  });
});

// Movements
app.get('/api/movements', (req, res) => {
  db.all("SELECT * FROM movements", (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    const movements = rows.map(r => ({ ...r, isManual: !!r.isManual }));
    res.json(movements);
  });
});

app.post('/api/movements/batch', (req, res) => {
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

app.post('/api/movements/update', (req, res) => {
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

// Explicit API 404 Handler
app.use('/api/*', (req, res) => {
  res.status(404).json({ error: `API endpoint not found: ${req.method} ${req.url}` });
});

// --- Static Files (After API) ---
// Only serve static files if API didn't catch the request
app.use(express.static(path.join(__dirname, 'dist')));

// Catch all for SPA (This MUST be the last route)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

// Listen on 0.0.0.0 to support all interfaces (Docker, WSL, etc.)
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT} (0.0.0.0)`);
});