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
  return `${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 9)}-${Math.random().toString(36).substring(2, 9)}`;
};

// Helper: Read File
const readFileLines = async (file: File): Promise<string[]> => {
  const text = await file.text();
  return text.split(/\r\n|\n/).filter(line => line.trim().length > 0);
};

// Helper: Clean cell / string
const cleanCell = (str?: string): string => {
  if (!str) return '';
  return str.replace(/^\uFEFF/, '').trim().replace(/^["']|["']$/g, '').trim();
};

// Helper: Clean IDs (remove BOM, quotes etc)
const cleanId = (id: string): string => {
  if (!id) return '';
  return cleanCell(id);
};

// Helper: Normalize Date to ISO (YYYY-MM-DD)
const normalizeDate = (dateStr: string): string => {
  if (!dateStr) return '';
  const cleanDate = cleanCell(dateStr);
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
    const touchedKeys = new Set<string>();

    // Bestehende Daten in Lookup-Map laden (zum Abgleich und Mergen)
    if (Array.isArray(existingMovements)) {
      existingMovements.forEach(m => {
        if (m.employeeId && m.date) {
          movementMap.set(`${m.employeeId}_${m.date}`, { ...m });
        }
      });
      addLog(`💾 ${existingMovements.length} bestehende Einträge im Speicher für Abgleich bereitgestellt.`);
    }

    let dispoCount = 0;

    // --- 1. DISPO ANALYSE ---
    addLog(`\n📂 Verarbeite Dispo-Datei: ${dispoFile.name}`);
    const dispoLines = await readFileLines(dispoFile);
    
    dispoLines.forEach((line) => {
      const trimmed = line.trim();
      if (
        trimmed.startsWith('Datum') || 
        trimmed.startsWith('---') || 
        trimmed.startsWith('SPESENEXPORT') || 
        trimmed.startsWith('Zeitraum')
      ) {
        return;
      }

      let empId = '';
      let dateStr = '';
      let location = '';

      // Format: DD.MM.YYYY ID Ort/Name
      const reportMatch = trimmed.match(/^(\d{1,2}\.\d{1,2}\.\d{4})\s+(\d+)\s+(.+)$/);

      if (reportMatch) {
        dateStr = reportMatch[1];
        empId = reportMatch[2];
        const rawContent = reportMatch[3].trim();
        
        // Versuche "Ladestelle" und "Ort" zu trennen
        const parts = rawContent.split(/\s{2,}/);
        
        if (parts.length >= 2) {
          parts.shift(); // Namen entfernen
          location = parts.join(' - ');
        } else {
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
      touchedKeys.add(key);
      
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
      let currentLocs = record.location ? record.location.split(' | ').filter(l => l.trim()) : [];
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

    // Standard-Spaltenindizes
    let idxId = 0;
    let idxDate = 4;
    let idxStart = 10;
    let idxEnd = 12;

    timeLines.forEach((line) => {
      const rawParts = line.split(';');
      const cleanParts = rawParts.map(cleanCell);
      
      // Flexible Header-Erkennung (auch bei Anführungszeichen)
      const foundId = cleanParts.findIndex(p => p === 'Pers-Nr.' || p === 'Pers-Nr' || p === 'Personalnummer');
      const foundDate = cleanParts.findIndex(p => p === 'Datum');
      const foundStart = cleanParts.findIndex(p => p === 'Kommt' || p === 'Beginn');
      const foundEnd = cleanParts.findIndex(p => p === 'Geht' || p === 'Ende');

      if (foundId !== -1 && foundDate !== -1) {
        idxId = foundId;
        idxDate = foundDate;
        if (foundStart !== -1) idxStart = foundStart;
        if (foundEnd !== -1) idxEnd = foundEnd;
        return;
      }

      // Sicherheitscheck: Zeile lang genug?
      if (cleanParts.length <= Math.max(idxId, idxDate, idxStart, idxEnd)) return;

      const rawDate = cleanParts[idxDate];
      if (!rawDate || !rawDate.match(/^\d{1,2}\.\d{1,2}\.\d{4}$/)) return;

      const start = cleanParts[idxStart];
      const end = cleanParts[idxEnd];

      // Ignoriere Tage ohne Arbeitszeiten
      if (!start || !end || start === '00:00' || end === '00:00') return;

      const empId = cleanId(cleanParts[idxId]);
      const dateStr = normalizeDate(rawDate);
      
      if (!empId || !dateStr) return;

      const key = `${empId}_${dateStr}`;
      touchedKeys.add(key);
      
      let record = movementMap.get(key);
      
      // Falls Dispo fehlte, neuen Eintrag anlegen
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

      // Berechnung durchführen, wenn nicht manuell gesperrt
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

    // CRITICAL FIX: Nur Datensätze zurückgeben, die in dieser Datei importiert/aktualisiert wurden!
    // Dadurch wird verhindert, dass die gesamte bisherige Datenbank erneut gesendet und aufgebläht wird.
    const finalMovements: Movement[] = [];
    touchedKeys.forEach(key => {
      const item = movementMap.get(key);
      if (item && ((item.startTimeRaw && item.endTimeRaw) || item.location)) {
        finalMovements.push(item);
      }
    });

    addLog(`📦 ${finalMovements.length} Datensätze zur Übernahme bereitgestellt.`);

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
