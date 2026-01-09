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
    // Suche ab Index 5 nach Uhrzeiten, um IDs/Datum am Anfang zu ignorieren
    const times = parts.slice(4).filter(p => timeRegex.test(p.trim()));

    if (times.length < 2) return null;

    const toMins = (t: string) => {
      const [h, m] = t.split(':').map(Number);
      return h * 60 + m;
    };

    times.sort((a, b) => toMins(a) - toMins(b));

    return {
      start: times[0],
      end: times[times.length - 1]
    };
  };

  const handleImport = async () => {
    if (!dispoFile || !timeFile) return;
    setStatus('processing');
    setLog([]);
    const logs: string[] = [];
    const addLog = (msg: string) => logs.push(msg);

    addLog(`🚀 Start Import-Vorgang`);
    addLog(`ℹ️ Umgebung: ${typeof crypto !== 'undefined' && crypto.randomUUID ? 'Secure Context' : 'Legacy Context (ID Fallback aktiv)'}`);

    try {
      const config = await getConfig();
      const existingMovements = await getMovements();
      const movementMap = new Map<string, Movement>();

      // Bestehende laden
      existingMovements.forEach(m => movementMap.set(`${m.employeeId}_${m.date}`, m));
      addLog(`💾 ${existingMovements.length} bestehende Einträge im Speicher.`);

      const dispoDates = new Set<string>();
      const timeDates = new Set<string>();

      // --- 1. DISPO ANALYSE ---
      addLog(`\n📂 Verarbeite Dispo-Datei: ${dispoFile.name}`);
      const dispoLines = await readFileLines(dispoFile);
      addLog(`   Zeilen gelesen: ${dispoLines.length}`);
      
      let dispoCount = 0;
      let dispoSkipCount = 0;

      dispoLines.forEach((line, idx) => {
        const trimmed = line.trim();
        // Überspringe Header-Zeilen (typischerweise enthalten diese Wörter wie "Datum", "PersNr", "---")
        if (trimmed.startsWith('Datum') || trimmed.startsWith('---') || trimmed.startsWith('SPESENEXPORT') || trimmed.startsWith('Zeitraum')) {
            return;
        }

        let empId = '';
        let dateStr = '';
        let location = '';

        // Regex Test
        const reportMatch = trimmed.match(/^(\d{2}\.\d{2}\.\d{4})\s+(\d+)\s+(.+)$/);

        if (reportMatch) {
          dateStr = reportMatch[1];
          empId = reportMatch[2];
          location = reportMatch[3].trim();
        } else {
          // CSV Fallback
          const parts = trimmed.split(/;|\t|,/);
          if (parts.length >= 3) {
            if (parts[1] && parts[1].match(/^\d{2}\.\d{2}\.\d{4}$/)) {
                 empId = parts[0].trim();
                 dateStr = parts[1].trim();
                 location = parts[2].trim();
            } else if (parts[0] && parts[0].match(/^\d{2}\.\d{2}\.\d{4}$/)) {
                 dateStr = parts[0].trim();
                 empId = parts[1].trim();
                 location = parts[2].trim();
            }
          }
        }

        if (!empId || !dateStr) {
            dispoSkipCount++;
            if (dispoSkipCount <= 3) {
                addLog(`   ⚠️ Überspringe Zeile ${idx + 1} (Format nicht erkannt): "${trimmed.substring(0, 50)}..."`);
            }
            return;
        }

        // Datum normalisieren
        if (dateStr.includes('.')) {
          const [d, m, y] = dateStr.split('.');
          dateStr = `${y}-${m}-${d}`;
        }
        
        dispoDates.add(dateStr);

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

        let currentLocs = record.location ? record.location.split(', ').filter(l => l) : [];
        if (location && !currentLocs.includes(location)) {
          currentLocs.push(location);
        }
        record.location = currentLocs.join(', ');
        
        movementMap.set(key, record);
        dispoCount++;
      });
      addLog(`✅ Dispo erkannt: ${dispoCount} Einträge (Übersprungen: ${dispoSkipCount})`);
      if (dispoDates.size > 0) {
        const sorted = Array.from(dispoDates).sort();
        addLog(`   📅 Zeitraum Dispo: ${sorted[0]} bis ${sorted[sorted.length-1]}`);
      }

      // --- 2. ZEIT ANALYSE ---
      addLog(`\n📂 Verarbeite Zeit-Datei: ${timeFile.name}`);
      const timeLines = await readFileLines(timeFile);
      addLog(`   Zeilen gelesen: ${timeLines.length}`);

      let timeCount = 0;
      let timeSkipCount = 0;
      let mergeCount = 0;

      timeLines.forEach((line, idx) => {
        const parts = line.split(';');
        let empId = '';
        let dateStr = '';
        let start = '';
        let end = '';

        // Versuche Datum zu finden (Spalte 4 in deinem Beispiel)
        // Format: 1007;Name;Vorname;...;01.12.2025;...
        if (parts.length > 4) {
            // Suche Spalte mit Datumsmuster
            const dateIdx = parts.findIndex(p => p.match(/^\d{2}\.\d{2}\.\d{4}$/));
            
            if (dateIdx > -1) {
                // Annahme: ID ist immer Index 0
                empId = parts[0].trim();
                dateStr = parts[dateIdx].trim();
                
                const timeRange = findTimeRangeInRow(parts);
                if (timeRange) {
                  start = timeRange.start;
                  end = timeRange.end;
                } else {
                     // Kein Fehler, vielleicht Urlaub/Krank ohne Zeiten
                }
            }
        }

        if (!empId || !dateStr || !start || !end) {
          timeSkipCount++;
          // Logge nur die ersten paar Fehler um Spam zu vermeiden
          if (timeSkipCount <= 3 && parts.length > 2) { 
             // Nur loggen wenn Zeile nicht leer aussieht
             // addLog(`   ℹ️ Zeile ${idx+1} übersprungen (Keine Zeiten/Datum): ${line.substring(0,30)}...`);
          }
          return;
        }

        if (dateStr.includes('.')) {
          const [d, m, y] = dateStr.split('.');
          dateStr = `${y}-${m}-${d}`;
        }
        
        timeDates.add(dateStr);

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
        } else {
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
      if (timeDates.size > 0) {
        const sorted = Array.from(timeDates).sort();
        addLog(`   📅 Zeitraum Zeiten: ${sorted[0]} bis ${sorted[sorted.length-1]}`);
      }

      // --- DIAGNOSE & ABSCHLUSS ---
      addLog(`\n📊 Zusammenfassung:`);
      if (mergeCount === 0 && dispoCount > 0 && timeCount > 0) {
        setStatus('error');
        addLog(`❌ FEHLER: 0 Übereinstimmungen gefunden!`);
        addLog(`   Die Datumsbereiche überschneiden sich nicht.`);
        addLog(`   Dispo Monat: ${Array.from(dispoDates)[0]?.substring(0,7)}`);
        addLog(`   Zeit Monat:  ${Array.from(timeDates)[0]?.substring(0,7)}`);
      } else if (mergeCount > 0) {
        addLog(`✅ ERFOLG: ${mergeCount} Datensätze erfolgreich verknüpft (Ort + Zeit).`);
        addLog(`ℹ️ ${timeCount - mergeCount} Datensätze haben Zeit aber keinen Ort (Homeoffice/Innendienst?).`);
        addLog(`ℹ️ ${dispoCount - mergeCount} Datensätze haben Ort aber keine Zeit.`);
        
        await saveMovements(Array.from(movementMap.values()));
        setStatus('success');
      } else {
        addLog(`⚠️ Warnung: Keine Daten verarbeitet.`);
        setStatus('error');
      }

    } catch (e: any) {
      console.error(e);
      setStatus('error');
      addLog(`❌ KRITISCHER FEHLER:`);
      addLog(`${e.message}`);
      addLog(`${e.stack}`);
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
                
                return <div key={i} className={`${colorClass} whitespace-pre-wrap border-b border-gray-50 py-1`}>{l}</div>
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default ImportData;