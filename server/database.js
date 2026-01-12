import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const sqlite3 = require('sqlite3').verbose();

// Pfade berechnen
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// Wir sind in /server, Data ist im Root (../data)
const DATA_DIR = path.join(__dirname, '..', 'data');

// Sicherstellen, dass Data existiert
if (!fs.existsSync(DATA_DIR)){
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DB_PATH = path.join(DATA_DIR, 'meinespesen.db');

export const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) {
    console.error('❌ KRITISCH: Keine Verbindung zur Datenbank', err);
  } else {
    console.log('✓ Datenbank verbunden:', DB_PATH);
  }
});

export const initDb = () => {
  db.serialize(() => {
    // 1. Employees
    db.run(`CREATE TABLE IF NOT EXISTS employees (
      id TEXT PRIMARY KEY,
      firstName TEXT,
      lastName TEXT,
      email TEXT
    )`);

    // 2. Config
    db.run(`CREATE TABLE IF NOT EXISTS config (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      data TEXT
    )`);

    // 3. Movements
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
        
        // Default Config setzen
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
    });
  });
};