import { Movement, AppConfig } from '../types';
import { calculateMovement } from './calculation';

interface ImportResult {
  success: boolean;
  movements: Movement[];
  logs: string[];
}

// Helper: ID Generation
const generateId = () => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
};

// Helper: Read File
const readFileLines = async (file: File): Promise<string[]> => {
  const text = await file.text();
  return text.split(/\r\n|\n/).filter(line => line.trim().length > 0);
};

// Helper: Clean IDs (remove BOM etc)
const cleanId = (id: string) => {
  return id ? id.trim().replace(/^\uFEFF/, '') : '';
};

// Helper: Normalize Date to ISO (YYYY-MM-DD)
const normalizeDate = (dateStr: string) => {
  if (!dateStr) return '';
  const cleanDate = dateStr.trim();
  if (cleanDate.includes('.')) {
    const parts = cleanDate.split('.');
    if (parts.length < 3) return cleanDate;
    const [d, m, y] = parts;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  return cleanDate;
};

// Helper: Find Start/End time in CSV row
const findTimeRangeInRow = (parts: string[]) => {
  const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;
  // Suche ab Index 4 nach Uhrzeiten
  const times = parts.slice(4).filter(p => {
      if (!p) return false;
      const t = p.trim();
      return timeRegex.test(t) && t !== '00:00';
  });

  if (times.length < 2) return null;

  const toMins = (t: string) => {
    const [h, m] = t.split(':').map(Number);
    return h * 60 + m;
  };

  const start = times[0];
  let maxTime = times[0];
  let maxMins = toMins(times[0]);
  
  // Finde die späteste Zeit als Endzeit
  for(let i = 0; i < times.length; i++) {
      const t = times[i];
      const m = toMins(t);
      if (m > maxMins) {
          maxMins = m;
          maxTime = t;
      }
  }

  return { start: start, end: maxTime };
};

export const processImportFiles = async (
  dispoFile: File,
  timeFile: File,
  config: AppConfig,
  existingMovements: Movement[]
): Promise<ImportResult> => {
  const logs: string[] = [];
  const addLog = (msg: string) => logs.push(msg);

  addLog(`🚀 Start Import-Vorgang`);
  addLog(`ℹ️ Umgebung: ${typeof crypto !== 'undefined' && crypto.randomUUID ? 'Secure Context' : 'Legacy Context'}`);

  try {
    const movementMap = new Map<string, Movement>();

    // Bestehende Daten laden, um Dubletten zu vermeiden oder zu aktualisieren
    existingMovements.forEach(m => movementMap.set(`${m.employeeId}_${m.date}`, m));
    addLog(`💾 ${existingMovements.length} bestehende Einträge im Speicher.`);

    const dispoKeys = new Set<string>();
    const timeKeys = new Set<string>();

    // --- 1. DISPO ANALYSE ---
    addLog(`\n📂 Verarbeite Dispo-Datei: ${dispoFile.name}`);
    const dispoLines = await readFileLines(dispoFile);
    addLog(`   Zeilen gelesen: ${dispoLines.length}`);
    
    let dispoCount = 0;

    dispoLines.forEach((line) => {
      const trimmed = line.trim();
      if (trimmed.startsWith('Datum') || trimmed.startsWith('---') || trimmed.startsWith('SPESENEXPORT') || trimmed.startsWith('Zeitraum')) {
          return;
      }

      let empId = '';
      let dateStr = '';
      let location = '';

      // Versuch 1: Regex für Berichte
      const reportMatch = trimmed.match(/^(\d{1,2}\.\d{1,2}\.\d{4})\s+(\d+)\s+(.+)$/);

      if (reportMatch) {
        dateStr = reportMatch[1];
        empId = reportMatch[2];
        location = reportMatch[3].trim();
      } else {
        // Versuch 2: CSV Struktur
        const parts = trimmed.split(/;|\t|,/);
        if (parts.length >= 3) {
          const p0 = parts[0] || '';
          const p1 = parts[1] || '';
          const p2 = parts[2] || '';
          
          if (p1.match(/^\d{1,2}\.\d{1,2}\.\d{4}$/)) {
               empId = p0;
               dateStr = p1;
               location = p2;
          } else if (p0.match(/^\d{1,2}\.\d{1,2}\.\d{4}$/)) {
               dateStr = p0;
               empId = p1;
               location = p2;
          }
        }
      }

      if (!empId || !dateStr) return;

      empId = cleanId(empId);
      dateStr = normalizeDate(dateStr);
      location = location.trim();

      if (location === '---' || location.match(/^---+$/)) location = '';

      const key = `${empId}_${dateStr}`;
      dispoKeys.add(key);

      let record = movementMap.get(key);
      if (!record) {
        record = {
          id: generateId(),
          employeeId: empId,
          date: dateStr,
          location: '',
          startTimeRaw: '', endTimeRaw: '',
          startTimeCorr: '', endTimeCorr: '',
          durationNetto: 0, amount: 0, isManual: false
        };
      }

      // Orte zusammenführen, falls mehrere Einträge pro Tag
      let currentLocs = record.location ? record.location.split(', ').filter(l => l) : [];
      if (location && !currentLocs.includes(location)) {
        currentLocs.push(location);
      }
      record.location = currentLocs.join(', ');
      
      movementMap.set(key, record);
      dispoCount++;
    });
    addLog(`✅ Dispo erkannt: ${dispoCount} Einträge`);

    // --- 2. ZEIT ANALYSE ---
    addLog(`\n📂 Verarbeite Zeit-Datei: ${timeFile.name}`);
    const timeLines = await readFileLines(timeFile);
    
    let timeCount = 0;
    let mergeCount = 0;

    timeLines.forEach((line) => {
      const parts = line.split(';');
      let empId = '';
      let dateStr = '';
      let start = '';
      let end = '';

      if (parts.length > 4) {
          // Finde Datumsspalte
          const dateIdx = parts.findIndex(p => p && p.match(/^\d{1,2}\.\d{1,2}\.\d{4}$/));
          
          if (dateIdx > -1) {
              empId = parts[0];
              dateStr = parts[dateIdx];
              
              const timeRange = findTimeRangeInRow(parts);
              if (timeRange) {
                start = timeRange.start;
                end = timeRange.end;
              }
          }
      }

      if (!empId || !dateStr || !start || !end) return;

      empId = cleanId(empId);
      dateStr = normalizeDate(dateStr);
      
      const key = `${empId}_${dateStr}`;
      timeKeys.add(key);

      let record = movementMap.get(key);
      
      // Falls Dispo fehlt, erstellen wir einen neuen Eintrag (nur Zeit)
      if (!record) {
        record = {
          id: generateId(),
          employeeId: empId,
          date: dateStr,
          location: '', // Kein Ort bekannt
          startTimeRaw: '', endTimeRaw: '',
          startTimeCorr: '', endTimeCorr: '',
          durationNetto: 0, amount: 0, isManual: false
        };
      } else {
          // Merge Erfolg!
          if (record.location) mergeCount++;
      }

      record.startTimeRaw = start;
      record.endTimeRaw = end;

      // Berechnung durchführen (Calculation Service)
      if (!record.isManual) {
          const calculated = calculateMovement(start, end, config);
          record.startTimeCorr = calculated.startCorr;
          record.endTimeCorr = calculated.endCorr;
          record.durationNetto = calculated.duration;
          record.amount = calculated.amount;
      }

      movementMap.set(key, record);
      timeCount++;
    });

    addLog(`✅ Zeiten erkannt: ${timeCount} Einträge`);

    // --- DIAGNOSE ---
    addLog(`\n📊 Zusammenfassung:`);
    let success = false;

    if (mergeCount === 0 && dispoCount > 0 && timeCount > 0) {
      addLog(`❌ FEHLER: 0 Übereinstimmungen gefunden!`);
      addLog(`\n🔍 DEBUG INFO (Erste 3 Einträge):`);
      
      const dKeys = Array.from(dispoKeys).slice(0,3);
      const tKeys = Array.from(timeKeys).slice(0,3);
      
      addLog(`Dispo Keys (Beispiele):`);
      dKeys.forEach(k => addLog(` - "${k}"`));
      
      addLog(`Zeit Keys (Beispiele):`);
      tKeys.forEach(k => addLog(` - "${k}"`));
      
      addLog(`\nTipp: Prüfen Sie Datum (01.01. vs 1.1.) und Personalnummer.`);
    } else if (mergeCount > 0) {
      addLog(`✅ ERFOLG: ${mergeCount} Datensätze erfolgreich verknüpft.`);
      success = true;
    } else {
      addLog(`⚠️ Warnung: Keine Daten verarbeitet.`);
    }

    return {
      success,
      movements: Array.from(movementMap.values()),
      logs
    };

  } catch (e: any) {
    console.error(e);
    addLog(`❌ KRITISCHER FEHLER: ${e.message}`);
    return {
      success: false,
      movements: [],
      logs
    };
  }
};