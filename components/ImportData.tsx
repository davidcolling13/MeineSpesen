import React, { useState } from 'react';
import { getConfig, saveMovements, getMovements } from '../services/storage';
import { calculateMovement } from '../services/calculation';
import { Movement } from '../types';
import { UploadCloud, FileText, CheckCircle, AlertTriangle } from 'lucide-react';

const ImportData: React.FC = () => {
  const [dispoFile, setDispoFile] = useState<File | null>(null);
  const [timeFile, setTimeFile] = useState<File | null>(null);
  const [status, setStatus] = useState<'idle' | 'processing' | 'success' | 'error'>('idle');
  const [log, setLog] = useState<string[]>([]);

  // Helper to read file lines cleanly
  const readFileLines = async (file: File): Promise<string[]> => {
    const text = await file.text();
    return text.split(/\r\n|\n/).filter(line => line.trim().length > 0);
  };

  const handleImport = async () => {
    if (!dispoFile || !timeFile) return;
    setStatus('processing');
    setLog([]);
    const newLog: string[] = [];

    try {
      const config = await getConfig();
      const existingMovements = await getMovements();
      const movementMap = new Map<string, Movement>();

      // Load existing into map to support merge/update
      existingMovements.forEach(m => movementMap.set(`${m.employeeId}_${m.date}`, m));

      // --- 1. PROCESS DISPO FILE (Locations) ---
      const dispoLines = await readFileLines(dispoFile);
      let dispoCount = 0;

      dispoLines.forEach(line => {
        const trimmed = line.trim();
        let empId = '';
        let dateStr = '';
        let location = '';

        // Strategy A: Regex for Text Report Format (e.g. "05.01.2026  1092   Rhiem & Sohn")
        const reportMatch = trimmed.match(/^(\d{2}\.\d{2}\.\d{4})\s+(\d+)\s+(.+)$/);

        if (reportMatch) {
          dateStr = reportMatch[1];
          empId = reportMatch[2];
          location = reportMatch[3].trim();
        } else {
          // Strategy B: Fallback to CSV/Semicolon/Tab
          const parts = trimmed.split(/;|\t|,/);
          if (parts.length >= 3) {
            if (parts[1].match(/^\d{2}\.\d{2}\.\d{4}$/) || parts[1].match(/^\d{4}-\d{2}-\d{2}$/)) {
                 empId = parts[0].trim();
                 dateStr = parts[1].trim();
                 location = parts[2].trim();
            }
          }
        }

        if (!empId || !dateStr) return;

        if (dateStr.includes('.')) {
          const [d, m, y] = dateStr.split('.');
          dateStr = `${y}-${m}-${d}`;
        }

        if (location === '---') location = '';

        const key = `${empId}_${dateStr}`;
        let record = movementMap.get(key);

        if (!record) {
          record = {
            id: crypto.randomUUID(),
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
      newLog.push(`✓ Dispo-Datei: ${dispoCount} Zeilen verarbeitet (Orte zusammengeführt).`);

      // --- 2. PROCESS TIME FILE (Hours) ---
      const timeLines = await readFileLines(timeFile);
      let timeCount = 0;

      timeLines.forEach((line) => {
        const parts = line.split(';');
        let empId = '';
        let dateStr = '';
        let start = '';
        let end = '';

        if (parts.length > 11 && parts[4] && parts[4].match(/^\d{2}\.\d{2}\.\d{4}$/)) {
            empId = parts[0].trim();
            dateStr = parts[4].trim();
            start = parts[9].trim();
            end = parts[11].trim();
        } else if (parts.length >= 4) {
            empId = parts[0].trim();
            dateStr = parts[1].trim();
            start = parts[2].trim();
            end = parts[3].trim();
        }

        if (!empId || !dateStr || !start || !end) return;

        if (dateStr.includes('.')) {
          const [d, m, y] = dateStr.split('.');
          dateStr = `${y}-${m}-${d}`;
        }

        const key = `${empId}_${dateStr}`;
        let record = movementMap.get(key);
        
        if (!record) {
          record = {
            id: crypto.randomUUID(),
            employeeId: empId,
            date: dateStr,
            location: '',
            startTimeRaw: '', endTimeRaw: '',
            startTimeCorr: '', endTimeCorr: '',
            durationNetto: 0, amount: 0, isManual: false
          };
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
      newLog.push(`✓ Zeit-Datei: ${timeCount} Einträge verarbeitet.`);

      await saveMovements(Array.from(movementMap.values()));
      setStatus('success');
    } catch (e: any) {
      console.error(e);
      setStatus('error');
      newLog.push(`Fehler: ${e.message}`);
    }
    setLog(newLog);
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
    <div className="max-w-3xl mx-auto space-y-8">
      <div className="text-center">
        <h2 className="text-2xl font-bold text-gray-800">Datenimport</h2>
        <p className="text-gray-500">
          Laden Sie die <strong>Dispositionsdatei (Text-Bericht)</strong> und die <strong>Zeitdatei (CSV)</strong> hoch.
          <br/><span className="text-xs">Mehrfachnennungen in der Dispo werden pro Tag und Mitarbeiter zusammengefasst.</span>
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
              <span>Import Starten & Berechnen</span>
            </>
          )}
        </button>
      </div>

      {status !== 'idle' && (
        <div className={`rounded-lg p-4 border ${status === 'success' ? 'bg-green-50 border-green-200' : 'bg-gray-50 border-gray-200'}`}>
          <div className="flex items-center gap-2 mb-2">
            {status === 'success' && <CheckCircle className="text-green-600" size={20} />}
            {status === 'error' && <AlertTriangle className="text-red-600" size={20} />}
            <h4 className="font-semibold">Protokoll</h4>
          </div>
          <ul className="text-sm font-mono space-y-1 text-gray-600">
            {log.map((l, i) => <li key={i}>{l}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
};

export default ImportData;