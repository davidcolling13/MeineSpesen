import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const sqlite3 = require('sqlite3').verbose();

// Pfade berechnen
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, '..', 'data');

if (!fs.existsSync(DATA_DIR)){
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DB_PATH = path.join(DATA_DIR, 'meinespesen.db');

export const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) {
    console.error('❌ KRITISCH: Keine Verbindung zur Datenbank', err);
  } else {
    console.log('✓ Datenbank verbunden:', DB_PATH);
    // Performance & Integrität Tuning
    db.run("PRAGMA journal_mode = WAL;"); // Erlaubt gleichzeitiges Lesen/Schreiben
    db.run("PRAGMA foreign_keys = ON;"); // Erzwingt Datenkonsistenz
    db.run("PRAGMA synchronous = NORMAL;"); // Performance Boost bei guter Sicherheit
  }
});

/**
 * Promise-Wrapper für db.run (Insert, Update, Delete)
 */
export const dbRun = (sql, params = []) => {
    return new Promise((resolve, reject) => {
        db.run(sql, params, function(err) {
            if (err) reject(err);
            else resolve(this);
        });
    });
};

/**
 * Promise-Wrapper für db.all (Select All)
 */
export const dbAll = (sql, params = []) => {
    return new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
};

/**
 * Promise-Wrapper für db.get (Select One)
 */
export const dbGet = (sql, params = []) => {
    return new Promise((resolve, reject) => {
        db.get(sql, params, (err, row) => {
            if (err) reject(err);
            else resolve(row);
        });
    });
};

export const initDb = () => {
  db.serialize(() => {
    // 1. Employees
    db.run(`CREATE TABLE IF NOT EXISTS employees (
      id TEXT PRIMARY KEY,
      firstName TEXT,
      lastName TEXT,
      email TEXT
    )`);

    // 2. Config (General)
    db.run(`CREATE TABLE IF NOT EXISTS config (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      data TEXT
    )`);

    // 3. Email Settings
    db.run(`CREATE TABLE IF NOT EXISTS email_settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      host TEXT,
      port INTEGER,
      secure INTEGER,
      user TEXT,
      pass TEXT,
      fromEmail TEXT
    )`, (err) => {
      if (!err) {
        db.get("SELECT id FROM email_settings WHERE id = 1", (err, row) => {
          if (!row) {
             db.run(`INSERT INTO email_settings (id, host, port, secure, user, pass, fromEmail) 
                     VALUES (1, 'smtp.example.com', 465, 1, 'user', 'pass', 'noreply@example.com')`);
          }
        });
      }
    });

    // 4. Movements
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

    // 5. System Logs
    db.run(`CREATE TABLE IF NOT EXISTS system_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp TEXT,
      level TEXT,
      message TEXT,
      details TEXT
    )`, (err) => {
       if(!err) {
         db.get("SELECT id FROM config WHERE id = 1", (err, row) => {
            if (!row) {
                const defaultConfig = JSON.stringify({
                addStartMins: 0,
                subEndMins: 0,
                rules: [{ hoursThreshold: 8, amount: 15 }]
                });
                db.run("INSERT INTO config (id, data) VALUES (1, ?)", [defaultConfig]);
                console.log("✓ Default Konfiguration erstellt");
            }
        });
       }
    });
  });
};

export const addLogEntry = (level, message, details = '') => {
  const timestamp = new Date().toISOString();
  db.run(`INSERT INTO system_logs (timestamp, level, message, details) VALUES (?, ?, ?, ?)`, 
    [timestamp, level, message, typeof details === 'object' ? JSON.stringify(details) : details], 
    (err) => {
      if (err) console.error("Logging Error:", err);
      // Async Pruning
      db.run(`DELETE FROM system_logs WHERE id NOT IN (SELECT id FROM system_logs ORDER BY id DESC LIMIT 1000)`);
    }
  );
};