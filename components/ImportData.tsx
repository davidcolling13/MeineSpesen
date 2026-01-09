import React, { useState } from 'react';
import { getConfig, saveMovements, getMovements } from '../services/storage';
import { calculateMovement } from '../services/calculation';
import { Movement } from '../types';
import { UploadCloud, FileText, CheckCircle, AlertTriangle, Info, Terminal } from 'lucide-react';

const ImportData: React.FC = () => {
  const [dispoFile, setDispoFile] = useState<File | null>(null);
  const [timeFile, setTimeFile] = useState<File | null>(null);
  const [status, setStatus] = useState<'idle' | 'processing' | 'success' | 'error'>('idle');
  const [log, setLog] = useState<string[]>([]);

  // Sichere ID-Generierung (Fallback für ältere Browser/HTTP)
  const generateId = () => {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
  };

  const readFileLines = async (file: File): Promise<string[]> => {
    const text = await file.text();
    return text.split(/\r\n|\n/).filter(line => line.trim().length > 0);
  };

  const findTimeRangeInRow = (parts: string[]) => {
    const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;
    // Suche ab Index 4 nach Uhrzeiten
    const times = parts.slice(4).filter(p => {
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
    
    times.forEach(t => {
        const m = toMins(t);
        if (m > maxMins) {
            maxMins = m;
            maxTime = t;
        }
    });

    return {
      start: start,
      end: maxTime
    };
  };

  // Hilfsfunktion zur Normalisierung von Datum (immer YYYY-MM-DD)
  const normalizeDate = (dateStr: string) => {
    if (!dateStr) return '';
    const cleanDate = dateStr.trim();
    if (cleanDate.includes('.')) {
      const [d, m, y] = cleanDate.split('.');
      // Wichtig: padStart(2, '0') stellt sicher, dass 1.1.2026 zu 2026-01-01 wird
      return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
    }
    return cleanDate;
  };

  // Hilfsfunktion ID Cleaning (BOM entfernen)
  const cleanId = (id: string) => {
     return id.trim().replace(/^\uFEFF/, '');
  };

  const handleImport = async () => {
    if (!dispoFile || !timeFile) return;
    setStatus('processing');
    setLog([]);
    const logs: string[] = [];
    const addLog = (msg: string) => logs.push(msg);

    addLog(`🚀 Start Import-Vorgang`);
    addLog(`ℹ️ Umgebung: ${typeof crypto !== 'undefined' && crypto.randomUUID ? 'Secure Context' : 'Legacy Context'}`);

    try {
      const config = await getConfig();
      const existingMovements = await getMovements();
      const movementMap = new Map<string, Movement>();

      existingMovements.forEach(m => movementMap.set(`${m.employeeId}_${m.date}`, m));
      addLog(`💾 ${existingMovements.length} bestehende Einträge im Speicher.`);

      const dispoKeys = new Set<string>();
      const timeKeys = new Set<string>();

      // --- 1. DISPO ANALYSE ---
      addLog(`\n📂 Verarbeite Dispo-Datei: ${dispoFile.name}`);
      const dispoLines = await readFileLines(dispoFile);
      addLog(`   Zeilen gelesen: ${dispoLines.length}`);
      
      let dispoCount = 0;

      dispoLines.forEach((line, idx) => {
        const trimmed = line.trim();
        if (trimmed.startsWith('Datum') || trimmed.startsWith('---') || trimmed.startsWith('SPESENEXPORT') || trimmed.startsWith('Zeitraum')) {
            return;
        }

        let empId = '';
        let dateStr = '';
        let location = '';

        // Regex Test: Erlaubt jetzt auch 1-stellige Tage/Monate: \d{1,2}
        const reportMatch = trimmed.match(/^(\d{1,2}\.\d{1,2}\.\d{4})\s+(\d+)\s+(.+)$/);

        if (reportMatch) {
          dateStr = reportMatch[1];
          empId = reportMatch[2];
          location = reportMatch[3].trim();
        } else {
          // CSV Fallback
          const parts = trimmed.split(/;|\t|,/);
          if (parts.length >= 3) {
            // Check auf Datumsmuster
            if (parts[1] && parts[1].match(/^\d{1,2}\.\d{1,2}\.\d{4}$/)) {
                 empId = parts[0];
                 dateStr = parts[1];
                 location = parts[2];
            } else if (parts[0] && parts[0].match(/^\d{1,2}\.\d{1,2}\.\d{4}$/)) {
                 dateStr = parts[0];
                 empId = parts[1];
                 location = parts[2];
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

      timeLines.forEach((line, idx) => {
        const parts = line.split(';');
        let empId = '';
        let dateStr = '';
        let start = '';
        let end = '';

        if (parts.length > 4) {
            // Flexibles Regex für Datum
            const dateIdx = parts.findIndex(p => p.match(/^\d{1,2}\.\d{1,2}\.\d{4}$/));
            
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
            // Debug: Check if this was a valid merge
            if (record.location) mergeCount++;
        }

        record.startTimeRaw = start;
        record.endTimeRaw = end;

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

      // --- DIAGNOSE & ABSCHLUSS ---
      addLog(`\n📊 Zusammenfassung:`);
      if (mergeCount === 0 && dispoCount > 0 && timeCount > 0) {
        setStatus('error');
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
        await saveMovements(Array.from(movementMap.values()));
        setStatus('success');
      } else {
        addLog(`⚠️ Warnung: Keine Daten verarbeitet.`);
        setStatus('error');
      }

    } catch (e: any) {
      console.error(e);
      setStatus('error');
      addLog(`❌ KRITISCHER FEHLER: ${e.message}`);
    }
    setLog(logs);
  };

  const FileInput = ({ label, file, setFile }: { label: string, file: File | null, setFile: (f: File | null) => void }) => (
    <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:bg-gray-50 transition-colors">
      <FileText className="mx-auto text-gray-400 mb-2" size={32} />
      <h4 className="font-medium text-gray-700">{label}</h4>
      <p className="text-xs text-gray-500 mb-4">{file ? file.name : "TXT oder CSV Datei"}</p>
      <input 
        type="file" 
        accept=".csv,.txt"
        className="hidden" 
        id={`file-${label}`}
        onChange={(e) => setFile(e.target.files ? e.target.files[0] : null)}
      />
      <label 
        htmlFor={`file-${label}`} 
        className="cursor-pointer bg-blue-50 text-blue-600 px-4 py-2 rounded text-sm font-medium hover:bg-blue-100"
      >
        Datei wählen
      </label>
    </div>
  );

  return (
    <div className="max-w-3xl mx-auto space-y-8 pb-12">
      <div className="text-center">
        <h2 className="text-2xl font-bold text-gray-800">Datenimport</h2>
        <p className="text-gray-500">
          Laden Sie die <strong>Dispositionsdatei (Bericht)</strong> und die <strong>Zeitdatei (CSV)</strong> hoch.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <FileInput label="1. Dispositionsdatei (Bericht)" file={dispoFile} setFile={setDispoFile} />
        <FileInput label="2. Zeitdatei (Saldenlisten/CSV)" file={timeFile} setFile={setTimeFile} />
      </div>

      <div className="flex justify-center">
        <button 
          onClick={handleImport}
          disabled={!dispoFile || !timeFile || status === 'processing'}
          className="flex items-center gap-2 bg-blue-600 text-white px-8 py-3 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg"
        >
          {status === 'processing' ? (
            <span className="animate-pulse">Verarbeite...</span>
          ) : (
            <>
              <UploadCloud size={20} />
              <span>Import Starten & Analyse</span>
            </>
          )}
        </button>
      </div>

      {status !== 'idle' && (
        <div className={`rounded-lg border shadow-sm overflow-hidden ${
            status === 'success' ? 'bg-green-50 border-green-200' : 
            status === 'error' ? 'bg-red-50 border-red-200' : 'bg-gray-50 border-gray-200'
        }`}>
          <div className="p-4 border-b border-gray-200/50 flex items-center gap-2 bg-white/50">
             <Terminal size={18} className="text-gray-500" />
             <h4 className="font-semibold text-gray-700">Import Protokoll</h4>
          </div>
          <div className="p-4 font-mono text-xs md:text-sm text-gray-700 space-y-1 max-h-96 overflow-y-auto bg-white">
            {log.map((l, i) => {
                let colorClass = "text-gray-600";
                if (l.includes("❌") || l.includes("⚠️") || l.includes("FEHLER")) colorClass = "text-red-600 font-bold";
                if (l.includes("✅") || l.includes("ERFOLG")) colorClass = "text-green-600 font-bold";
                if (l.includes("📂")) colorClass = "text-blue-600 font-bold mt-2 block";
                if (l.includes("DEBUG INFO")) colorClass = "text-purple-600 font-bold mt-2 block";
                
                return <div key={i} className={`${colorClass} whitespace-pre-wrap border-b border-gray-50 py-1`}>{l}</div>
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default ImportData;