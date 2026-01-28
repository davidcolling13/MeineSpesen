import express from 'express';
import { addLogEntry } from '../database.js';
import http from 'http';

const router = express.Router();

// Trigger Update via Watchtower API
router.post('/update', (req, res) => {
  addLogEntry('INFO', 'System-Update manuell angefordert.');

  const token = process.env.UPDATE_TOKEN || 'meinespesen-internal-secret';
  
  // Wir kommunizieren intern im Docker-Netzwerk mit dem Container "updater"
  const options = {
    hostname: 'updater',
    port: 8080,
    path: '/v1/update',
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`
    }
  };

  const updateReq = http.request(options, (updateRes) => {
    let data = '';
    
    updateRes.on('data', (chunk) => {
      data += chunk;
    });

    updateRes.on('end', () => {
      if (updateRes.statusCode === 200) {
        addLogEntry('INFO', 'Update-Prozess gestartet. Server startet neu...', data);
        res.json({ success: true, message: 'Update initiiert. Server startet in Kürze neu.' });
      } else {
        addLogEntry('ERROR', 'Update fehlgeschlagen (Watchtower Antwort)', data);
        res.status(500).json({ error: 'Update-Service antwortete mit Fehler: ' + updateRes.statusCode });
      }
    });
  });

  updateReq.on('error', (e) => {
    const errorMsg = `Konnte Update-Service nicht erreichen. Läuft der Container 'updater'? Fehler: ${e.message}`;
    console.error(errorMsg);
    addLogEntry('ERROR', 'Update-Verbindungsfehler', e.message);
    
    // Fallback für lokale Entwicklung oder falsche Konfiguration
    res.status(503).json({ 
      error: 'Update-Service nicht erreichbar. Dies funktioniert nur in der Docker-Umgebung mit konfiguriertem Updater.' 
    });
  });

  updateReq.end();
});

export default router;