import React, { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { getConfig, saveMovements, getMovements } from '../services/storage';
import { calculateMovement } from '../services/calculation';
import { Movement } from '../types';
import { UploadCloud, FileText, CheckCircle, AlertTriangle, Info, Terminal, RefreshCw } from 'lucide-react';

const ImportData: React.FC = () => {
  const [dispoFile, setDispoFile] = useState<File | null>(null);
  const [timeFile, setTimeFile] = useState<File | null>(null);
  const [status, setStatus] = useState<'idle' | 'processing' | 'success' | 'error'>('idle');
  const [log, setLog] = useState<string[]>([]);

  // Sichere ID-Generierung
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
    // Suche ab Index 4 nach Uhrzeiten (Safe Slice)
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
    
    // Safety check loop
    for(let i = 0; i < times.length; i++) {
        const t = times[i];
        const m = toMins(t);
        if (m > maxMins) {
            maxMins = m;
            maxTime = t;
        }
    }

    return {
      start: start,
      end: maxTime
    };
  };

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

  const cleanId = (id: string) => {
     return id ? id.trim().replace(/^\uFEFF/, '') : '';
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

        const reportMatch = trimmed.match(/^(\d{1,2}\.\d{1,2}\.\d{4})\s+(\d+)\s+(.+)$/);

        if (reportMatch) {
          dateStr = reportMatch[1];
          empId = reportMatch[2];
          location = reportMatch[3].trim();
        } else {
          // CSV Fallback
          const parts = trimmed.split(/;|\t|,/);
          if (parts.length >= 3) {
            // Defensive checks before access
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

        // Nur neu berechnen, wenn nicht manuell bearbeitet
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

  // --- Drag & Drop Component ---
  const FileInput = ({ label, file, setFile }: { label: string, file: File | null, setFile: (f: File | null) => void }) => {
    
    const onDrop = useCallback((acceptedFiles: File[]) => {
      if (acceptedFiles && acceptedFiles.length > 0) {
        setFile(acceptedFiles[0]);
      }
    }, [setFile]);

    const { getRootProps, getInputProps, isDragActive } = useDropzone({
      onDrop,
      accept: {
        'text/csv': ['.csv'],
        'text/plain': ['.txt', '.csv']
      },
      multiple: false
    });

    // Dynamische Klassen für Zustände
    let containerClasses = "relative border-2 rounded-xl p-8 text-center transition-all duration-200 cursor-pointer flex flex-col items-center justify-center min-h-[180px] ";
    
    if (file) {
      // SUCCESS STATE
      containerClasses += "border-green-500 bg-green-50 ring-4 ring-green-100";
    } else if (isDragActive) {
      // DRAG STATE
      containerClasses += "border-blue-500 bg-blue-50 scale-[1.02] shadow-lg border-dashed";
    } else {
      // DEFAULT STATE
      containerClasses += "border-gray-300 border-dashed hover:border-gray-400 hover:bg-gray-50";
    }

    return (
      <div {...getRootProps()} className={containerClasses}>
        <input {...getInputProps()} />
        
        {file ? (
          <>
            <div className="bg-green-100 text-green-600 rounded-full p-3 mb-3">
              <CheckCircle size={32} />
            </div>
            <h4 className="font-bold text-green-800 text-lg break-all max-w-full px-4">{file.name}</h4>
            <p className="text-green-600 text-sm mt-1">{(file.size / 1024).toFixed(1)} KB</p>
            <div className="absolute top-3 right-3 text-green-600 bg-white rounded-full p-1 shadow-sm opacity-0 group-hover:opacity-100 transition-opacity">
              <RefreshCw size={14} />
            </div>
            <span className="mt-4 text-xs font-medium text-green-700 bg-green-200 px-3 py-1 rounded-full">
              Klicken oder ziehen zum Ändern
            </span>
          </>
        ) : (
          <>
            <div className={`rounded-full p-3 mb-3 transition-colors ${isDragActive ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-400'}`}>
              <UploadCloud size={32} />
            </div>
            <h4 className={`font-semibold text-lg mb-1 ${isDragActive ? 'text-blue-700' : 'text-gray-700'}`}>
              {label}
            </h4>
            {isDragActive ? (
              <p className="text-blue-500 font-medium">Ja, hier loslassen!</p>
            ) : (
              <p className="text-gray-500 text-sm">
                Datei hierher ziehen oder <span className="text-blue-600 underline decoration-blue-300 decoration-2 underline-offset-2">klicken</span>
              </p>
            )}
            <p className="text-xs text-gray-400 mt-2 uppercase tracking-wide">TXT oder CSV</p>
          </>
        )}
      </div>
    );
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-12">
      <div className="text-center space-y-2 mb-8">
        <h2 className="text-3xl font-bold text-gray-800">Datenimport</h2>
        <p className="text-gray-500 max-w-xl mx-auto">
          Laden Sie die <strong>Dispositionsdatei (Bericht)</strong> und die <strong>Zeitdatei (CSV)</strong> per Drag & Drop hoch, um die Spesenabrechnung zu starten.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <FileInput label="Dispositionsdatei" file={dispoFile} setFile={setDispoFile} />
        <FileInput label="Zeitdatei (CSV)" file={timeFile} setFile={setTimeFile} />
      </div>

      <div className="flex justify-center pt-4">
        <button 
          onClick={handleImport}
          disabled={!dispoFile || !timeFile || status === 'processing'}
          className="flex items-center gap-3 bg-blue-600 text-white px-8 py-4 rounded-xl hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg hover:shadow-xl transition-all transform hover:-translate-y-0.5 active:translate-y-0 text-lg font-medium w-full md:w-auto justify-center"
        >
          {status === 'processing' ? (
            <span className="animate-pulse flex items-center gap-2">
              <RefreshCw className="animate-spin" size={20} /> Verarbeite Daten...
            </span>
          ) : (
            <>
              <UploadCloud size={24} />
              <span>Import Starten & Analysieren</span>
            </>
          )}
        </button>
      </div>

      {status !== 'idle' && (
        <div className={`rounded-xl border shadow-sm overflow-hidden transition-all duration-300 ${
            status === 'success' ? 'bg-green-50 border-green-200' : 
            status === 'error' ? 'bg-red-50 border-red-200' : 'bg-gray-50 border-gray-200'
        }`}>
          <div className="p-4 border-b border-gray-200/50 flex items-center gap-2 bg-white/50 backdrop-blur-sm">
             <Terminal size={18} className="text-gray-500" />
             <h4 className="font-semibold text-gray-700">System Protokoll</h4>
          </div>
          <div className="p-4 font-mono text-xs md:text-sm text-gray-700 space-y-1 max-h-96 overflow-y-auto bg-white/80">
            {log.map((l, i) => {
                let colorClass = "text-gray-600";
                if (l.includes("❌") || l.includes("⚠️") || l.includes("FEHLER")) colorClass = "text-red-600 font-bold bg-red-50 px-1 rounded";
                if (l.includes("✅") || l.includes("ERFOLG")) colorClass = "text-green-600 font-bold bg-green-50 px-1 rounded";
                if (l.includes("📂")) colorClass = "text-blue-600 font-bold mt-3 block border-t border-gray-100 pt-2";
                if (l.includes("DEBUG INFO")) colorClass = "text-purple-600 font-bold mt-2 block";
                
                return <div key={i} className={`${colorClass} whitespace-pre-wrap py-0.5`}>{l}</div>
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default ImportData;