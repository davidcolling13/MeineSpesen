import express from 'express';
import nodemailer from 'nodemailer';
import { db, addLogEntry } from '../database.js';

const router = express.Router();

// Helper: Get Config Promise
const getEmailSettings = () => {
  return new Promise((resolve, reject) => {
    db.get("SELECT * FROM email_settings WHERE id = 1", (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
};

// GET Settings
router.get('/settings', async (req, res) => {
  try {
    const row = await getEmailSettings();
    if (!row) return res.json({});
    // Convert SQLite integer boolean to JS boolean
    res.json({
      host: row.host,
      port: row.port,
      secure: row.secure === 1,
      user: row.user,
      pass: row.pass, // In production, maybe mask this
      fromEmail: row.fromEmail
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// SAVE Settings
router.post('/settings', (req, res) => {
  const { host, port, secure, user, pass, fromEmail } = req.body;
  
  db.run(`INSERT INTO email_settings (id, host, port, secure, user, pass, fromEmail) 
          VALUES (1, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET 
            host=excluded.host, 
            port=excluded.port, 
            secure=excluded.secure, 
            user=excluded.user, 
            pass=excluded.pass,
            fromEmail=excluded.fromEmail`,
    [host, port, secure ? 1 : 0, user, pass, fromEmail],
    (err) => {
      if (err) {
        addLogEntry('ERROR', 'Fehler beim Speichern der Email-Einstellungen', err.message);
        return res.status(500).json({ error: err.message });
      }
      addLogEntry('INFO', 'Email-Einstellungen aktualisiert');
      res.json({ success: true });
    }
  );
});

// TEST Connection
router.post('/test', async (req, res) => {
  const { host, port, secure, user, pass, fromEmail } = req.body;
  
  const transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass }
  });

  try {
    await transporter.verify();
    res.json({ success: true, message: "Verbindung erfolgreich!" });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

// SEND Email (Uses DB Config)
router.post('/', async (req, res) => {
  const { email, fileName, fileData } = req.body;
  
  if (!email || !fileData) {
      return res.status(400).json({ error: "Email and fileData required" });
  }

  try {
    const config = await getEmailSettings();
    if (!config) throw new Error("Keine Email-Konfiguration gefunden.");

    const transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure === 1,
      auth: {
        user: config.user,
        pass: config.pass,
      },
    });

    const base64Content = fileData.split(';base64,').pop();

    const info = await transporter.sendMail({
      from: `"${config.fromEmail}" <${config.fromEmail}>`,
      to: email,
      subject: `Spesenabrechnung: ${fileName}`,
      text: `Hallo,\n\nanbei erhalten Sie Ihre Spesenabrechnung "${fileName}".\n\nMit freundlichen Grüßen\nColling Transporte\n\n(Diese Nachricht wurde automatisch erstellt)`,
      attachments: [
        {
          filename: fileName,
          content: base64Content,
          encoding: 'base64',
        },
      ],
    });

    addLogEntry('INFO', `Email gesendet an ${email}`, `ID: ${info.messageId}`);
    res.json({ success: true, message: "Email sent successfully", messageId: info.messageId });

  } catch (error) {
    console.error("❌ Error sending email:", error);
    addLogEntry('ERROR', `Fehler beim Senden an ${email}`, error.message);
    res.status(500).json({ error: "Failed to send email: " + error.message });
  }
});

export default router;