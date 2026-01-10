import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import cors from 'cors';
import nodemailer from 'nodemailer';
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
    initDbAndStartServer();
  }
});

// --- Middleware ---
app.use(cors()); 
// Erhöhtes Limit für Base64 PDF Uploads
app.use(express.json({ limit: '50mb' }));

// Request Logger
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

// --- SMTP Configuration (IONOS) ---
const transporter = nodemailer.createTransport({
  host: "smtp.ionos.de",
  port: 465,
  secure: true, // true for 465, false for other ports
  auth: {
    user: "dispo@colling-transporte.de",
    pass: "Co33ingdispo26",
  },
});

// Verify connection configuration
transporter.verify(function (error, success) {
  if (error) {
    console.log("SMTP Connection Error:", error);
  } else {
    console.log("✓ SMTP Server is ready to take our messages");
  }
});

// --- Database Init & Server Start ---
function initDbAndStartServer() {
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
    )`, (err) => {
        if (err) {
            console.error("DB Init Error:", err);
            return;
        }
        
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

        // Start Server ONLY after DB is ready
        app.listen(PORT, '0.0.0.0', () => {
            console.log(`Server running on port ${PORT} (0.0.0.0)`);
        });
    });
  });
}

// --- API Routes (MUST BE BEFORE STATIC FILES) ---

// Serve Favicon from Data Directory
app.get('/favicon.png', (req, res) => {
  const faviconPath = path.join(DATA_DIR, 'favicon.png');
  if (fs.existsSync(faviconPath)) {
    res.sendFile(faviconPath);
  } else {
    res.status(404).end();
  }
});

// Health Check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Email Report Endpoint
app.post('/api/email-report', async (req, res) => {
  const { email, fileName, fileData } = req.body;
  
  if (!email || !fileData) {
      return res.status(400).json({ error: "Email and fileData required" });
  }

  try {
    // Entferne Data-URL prefix falls vorhanden für Buffer
    const base64Content = fileData.split(';base64,').pop();

    const info = await transporter.sendMail({
      from: '"MeineSpesen" <dispo@colling-transporte.de>', // sender address
      to: email, // list of receivers
      subject: `Spesenabrechnung: ${fileName}`, // Subject line
      text: `Hallo,\n\nanbei erhalten Sie Ihre Spesenabrechnung "${fileName}".\n\nMit freundlichen Grüßen\nColling Transporte\n\n(Diese Nachricht wurde automatisch erstellt)`, // plain text body
      attachments: [
        {
          filename: fileName,
          content: base64Content,
          encoding: 'base64',
        },
      ],
    });

    console.log(`📧 Email sent: ${info.messageId} to ${email}`);
    res.json({ success: true, message: "Email sent successfully", messageId: info.messageId });

  } catch (error) {
    console.error("❌ Error sending email:", error);
    res.status(500).json({ error: "Failed to send email: " + error.message });
  }
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

app.delete('/api/movements/:id', (req, res) => {
  // Einzelnes Movement löschen
  db.run("DELETE FROM movements WHERE id = ?", [req.params.id], function(err) {
      if (err) return res.status(500).json({ error: err.message });
      if (this.changes === 0) return res.status(404).json({ error: "Movement not found" });
      res.json({ success: true });
  });
});

app.delete('/api/movements/cleanup', (req, res) => {
  const { beforeDate } = req.query;
  if (!beforeDate) {
    return res.status(400).json({ error: "Parameter 'beforeDate' ist erforderlich." });
  }

  // Lösche Einträge vor dem Datum
  db.run("DELETE FROM movements WHERE date < ?", [beforeDate], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true, deletedCount: this.changes });
  });
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
  // Check if file exists, else send 404 to avoid confusing loops
  const indexPath = path.join(__dirname, 'dist', 'index.html');
  if (fs.existsSync(indexPath)) {
      res.sendFile(indexPath);
  } else {
      res.send('App is building or dist folder missing.');
  }
});