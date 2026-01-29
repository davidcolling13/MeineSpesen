import { Movement, AppConfig } from '../types';
import { calculateMovement } from './calculation';

interface ImportResult {
  success: boolean;
  movements: Movement[];
  logs: string[];
}

// Helper: ID Generation (Robust)
const generateId = () => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback, aber besser als Math.random() pur
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
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
  // Format DD.MM.YYYY
  if (cleanDate.match(/^\d{1,2}\.\d{1,2}\.\d{4}$/)) {
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
  
  try {
    const movementMap = new Map<string, Movement>();

    // Bestehende Daten laden
    existingMovements.forEach(m => movementMap.set(`${m.employeeId}_${m.date}`, m));
    addLog(`💾 ${existingMovements.length} bestehende Einträge im Speicher berücksichtigt.`);

    let dispoCount = 0;

    // --- 1. DISPO ANALYSE ---
    addLog(`\n📂 Verarbeite Dispo-Datei: ${dispoFile.name}`);
    const dispoLines = await readFileLines(dispoFile);
    
    dispoLines.forEach((line) => {
      const trimmed = line.trim();
      if (trimmed.startsWith('Datum') || trimmed.startsWith('---') || trimmed.startsWith('SPESENEXPORT') || trimmed.startsWith('Zeitraum')) {
          return;
      }

      let empId = '';
      let dateStr = '';
      let location = '';

      // Regex für Berichte (Dispo Datei Format: DD.MM.YYYY ID Ort)
      const reportMatch = trimmed.match(/^(\d{1,2}\.\d{1,2}\.\d{4})\s+(\d+)\s+(.+)$/);

      if (reportMatch) {
        dateStr = reportMatch[1];
        empId = reportMatch[2];
        const rawContent = reportMatch[3].trim();
        
        // Versuche "Ladestelle" und "Ort" zu trennen.
        // Wir nehmen an, der erste Teil ist der Name (z.B. "Mustermann, Max") und danach folgen Orte.
        // Wir splitten bei 2 oder mehr Leerzeichen.
        const parts = rawContent.split(/\s{2,}/);
        
        if (parts.length >= 2) {
            // Wir entfernen den ersten Teil (den Namen)
            parts.shift();
            location = parts.join(' - ');
        } else {
            // Fallback: Wenn nur ein Teil da ist, prüfen wir, ob es wie ein Name aussieht (enthält Komma).
            // Wenn ja, ist kein Ort vorhanden. Wenn nein, übernehmen wir es als Ort.
            if (rawContent.includes(',')) {
                location = '';
            } else {
                location = rawContent;
            }
        }
      } 

      if (!empId || !dateStr) return;

      empId = cleanId(empId);
      dateStr = normalizeDate(dateStr);
      location = location.trim();

      if (location === '---' || location.match(/^---+$/)) location = '';

      const key = `${empId}_${dateStr}`;
      
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

      // Orte mergen
      let currentLocs = record.location ? record.location.split(' | ').filter(l => l) : [];
      if (location && !currentLocs.includes(location)) {
        currentLocs.push(location);
      }
      record.location = currentLocs.join(' | ');
      
      movementMap.set(key, record);
      dispoCount++;
    });
    addLog(`✅ Dispo erkannt: ${dispoCount} Zeilen verarbeitet`);

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
          return;
      }

      // Sicherheitscheck: Zeile lang genug?
      if (parts.length <= Math.max(idxId, idxDate, idxStart, idxEnd)) return;

      const rawDate = parts[idxDate];
      if (!rawDate || !rawDate.match(/^\d{1,2}\.\d{1,2}\.\d{4}$/)) return;

      const start = parts[idxStart]?.trim();
      const end = parts[idxEnd]?.trim();

      // Ignoriere Tage ohne Arbeit
      if (!start || !end || start === '00:00' || end === '00:00') return;

      const empId = cleanId(parts[idxId]);
      const dateStr = normalizeDate(rawDate);
      
      const key = `${empId}_${dateStr}`;
      
      let record = movementMap.get(key);
      
      // Falls Dispo fehlt, erstellen wir einen neuen Eintrag (nur Zeit)
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
      } else {
          if (record.location) mergeCount++;
      }

      // Zeiten setzen
      record.startTimeRaw = start;
      record.endTimeRaw = end;

      // Berechnung durchführen, wenn nicht manuell überschrieben
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
    if (mergeCount === 0 && dispoCount > 0 && timeCount > 0) {
      addLog(`⚠️ WARNUNG: 0 Übereinstimmungen gefunden! IDs oder Datumsformate prüfen.`);
    } else if (mergeCount > 0) {
      addLog(`✅ SUCCESS: ${mergeCount} Datensätze vollständig verknüpft.`);
    }

    // Filtern: Nur Einträge zurückgeben, die tatsächlich Zeiten oder Orte haben
    const finalMovements = Array.from(movementMap.values()).filter(m => 
       (m.startTimeRaw && m.endTimeRaw) || m.location
    );

    return {
      success: finalMovements.length > 0,
      movements: finalMovements,
      logs
    };

  } catch (e: any) {
    console.error(e);
    addLog(`❌ FEHLER: ${e.message}`);
    return {
      success: false,
      movements: [],
      logs
    };
  }
};