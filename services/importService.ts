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

      // Regex für Berichte (Dispo Datei Format: DD.MM.YYYY ID Ort)
      // Erwartet: Datum (Leerzeichen) ID (Leerzeichen) Rest
      const reportMatch = trimmed.match(/^(\d{1,2}\.\d{1,2}\.\d{4})\s+(\d+)\s+(.+)$/);

      if (reportMatch) {
        dateStr = reportMatch[1];
        empId = reportMatch[2];
        const rawContent = reportMatch[3].trim();
        
        // Versuche "Ladestelle" und "Ort" zu trennen
        // Wir nutzen mind. 3 Leerzeichen als Trenner, da die Datei sehr breite Spalten hat.
        // Das verhindert falsches Trennen bei Tippfehlern (doppelte Leerzeichen) im Namen.
        const parts = rawContent.split(/\s{3,}/);
        
        if (parts.length >= 2) {
            location = parts.join(' - '); // "Kieswerk Rhiem - Erftstadt-Erp"
        } else {
            location = rawContent;
        }
      } 
      // CSV Fallback entfernt, da die Dispo-Datei strikt textbasiert ist und wir Verwechslungen mit der Zeitdatei vermeiden wollen.

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

      // Orte zusammenführen
      let currentLocs = record.location ? record.location.split(' | ').filter(l => l) : [];
      if (location && !currentLocs.includes(location)) {
        currentLocs.push(location);
      }
      record.location = currentLocs.join(' | ');
      
      movementMap.set(key, record);
      dispoCount++;
    });
    addLog(`✅ Dispo erkannt: ${dispoCount} Einträge`);

    // --- 2. ZEIT ANALYSE ---
    addLog(`\n📂 Verarbeite Zeit-Datei: ${timeFile.name}`);
    const timeLines = await readFileLines(timeFile);
    
    let timeCount = 0;
    let mergeCount = 0;

    // Standard-Indizes (werden überschrieben, wenn Header gefunden wird)
    let idxId = 0;
    let idxDate = 4;
    let idxStart = 10;
    let idxEnd = 12;

    timeLines.forEach((line) => {
      const parts = line.split(';');
      
      // Header Erkennung
      if (parts[0] === 'Pers-Nr.' && parts.includes('Datum')) {
          idxId = parts.indexOf('Pers-Nr.');
          idxDate = parts.indexOf('Datum');
          idxStart = parts.indexOf('Kommt');
          idxEnd = parts.indexOf('Geht');
          addLog(`ℹ️ Spalten erkannt: ID=${idxId}, Datum=${idxDate}, Kommt=${idxStart}, Geht=${idxEnd}`);
          return;
      }

      // Sicherheitscheck: Zeile lang genug?
      if (parts.length <= Math.max(idxId, idxDate, idxStart, idxEnd)) return;

      const rawDate = parts[idxDate];
      
      // Validierung: Ist es ein Datum? (Ignoriert Summenzeilen am Ende des Blocks)
      if (!rawDate || !rawDate.match(/^\d{1,2}\.\d{1,2}\.\d{4}$/)) return;

      const start = parts[idxStart]?.trim();
      const end = parts[idxEnd]?.trim();

      // Ignoriere Tage ohne Arbeit (00:00)
      if (!start || !end || start === '00:00' || end === '00:00') return;

      const empId = cleanId(parts[idxId]);
      const dateStr = normalizeDate(rawDate);
      
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
          if (record.location) mergeCount++;
      }

      record.startTimeRaw = start;
      record.endTimeRaw = end;

      // Berechnung durchführen
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
    
    if (mergeCount === 0 && dispoCount > 0 && timeCount > 0) {
      addLog(`❌ FEHLER: 0 Übereinstimmungen gefunden!`);
      addLog(`Tipp: Prüfen Sie Datum (01.01. vs 1.1.) und Personalnummer.`);
    } else if (mergeCount > 0) {
      addLog(`✅ ERFOLG: ${mergeCount} Datensätze vollständig verknüpft.`);
    }

    return {
      success: timeCount > 0 || dispoCount > 0,
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