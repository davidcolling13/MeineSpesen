import React, { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { getConfig, saveMovements, getMovements, getEmployees } from '../services/storage';
import { processImportFiles } from '../services/importService';
import { UploadCloud, CheckCircle, Terminal, RefreshCw, Eye, XCircle } from 'lucide-react';
import { Movement } from '../types';

const ImportData: React.FC = () => {
  const [dispoFile, setDispoFile] = useState<File | null>(null);
  const [timeFile, setTimeFile] = useState<File | null>(null);
  const [status, setStatus] = useState<'idle' | 'analyzing' | 'preview' | 'processing' | 'success' | 'error'>('idle');
  const [log, setLog] = useState<string[]>([]);
  
  // Preview State
  const [previewMovements, setPreviewMovements] = useState<Movement[]>([]);
  const [previewLog, setPreviewLog] = useState<string[]>([]);

  const handleAnalyze = async () => {
    if (!dispoFile || !timeFile) return;
    setStatus('analyzing');
    setLog([]);

    try {
      const config = await getConfig();
      const existingMovements = await getMovements();

      const result = await processImportFiles(dispoFile, timeFile, config, existingMovements);

      setPreviewLog(result.logs);
      setPreviewMovements(result.movements);
      
      if (result.success && result.movements.length > 0) {
        setStatus('preview');
      } else {
        setLog(result.logs);
        setStatus('error');
      }

    } catch (e: any) {
      console.error(e);
      setStatus('error');
      setLog(prev => [...prev, `❌ SYSTEM FEHLER: ${e.message}`]);
    }
  };

  const handleConfirmImport = async () => {
    setStatus('processing');
    try {
      await saveMovements(previewMovements);
      // Merge Logs
      setLog([...previewLog, `✅ ${previewMovements.length} Datensätze erfolgreich in die Datenbank importiert.`]);
      setStatus('success');
      // Reset Preview
      setPreviewMovements([]);
    } catch (e: any) {
      setStatus('error');
      setLog(prev => [...prev, `❌ SPEICHERFEHLER: ${e.message}`]);
    }
  };

  const handleCancel = () => {
    setPreviewMovements([]);
    setStatus('idle');
    setLog([]);
  };

  // --- Drag & Drop Component ---
  const FileInput = ({ label, file, setFile }: { label: string, file: File | null, setFile: (f: File | null) => void }) => {
    
    const onDrop = useCallback((acceptedFiles: File[]) => {
      if (acceptedFiles && acceptedFiles.length > 0) {
        setFile(acceptedFiles[0]);
        // Reset status if user changes file
        if (status !== 'processing') setStatus('idle');
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

    let containerClasses = "relative border-2 rounded-xl p-8 text-center transition-all duration-200 cursor-pointer flex flex-col items-center justify-center min-h-[180px] ";
    
    if (file) {
      containerClasses += "border-green-500 bg-green-50 ring-4 ring-green-100";
    } else if (isDragActive) {
      containerClasses += "border-blue-500 bg-blue-50 scale-[1.02] shadow-lg border-dashed";
    } else {
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
          Laden Sie die <strong>Dispositionsdatei (Bericht)</strong> und die <strong>Zeitdatei (CSV)</strong> per Drag & Drop hoch.
          Sie erhalten eine Vorschau, bevor die Daten gespeichert werden.
        </p>
      </div>

      {status !== 'preview' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <FileInput label="Dispositionsdatei" file={dispoFile} setFile={setDispoFile} />
          <FileInput label="Zeitdatei (CSV)" file={timeFile} setFile={setTimeFile} />
        </div>
      )}

      {/* Action Button (Analyze) */}
      {status !== 'preview' && status !== 'success' && (
        <div className="flex justify-center pt-4">
          <button 
            onClick={handleAnalyze}
            disabled={!dispoFile || !timeFile || status === 'analyzing'}
            className="flex items-center gap-3 bg-blue-600 text-white px-8 py-4 rounded-xl hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg hover:shadow-xl transition-all transform hover:-translate-y-0.5 active:translate-y-0 text-lg font-medium w-full md:w-auto justify-center"
          >
            {status === 'analyzing' ? (
              <span className="animate-pulse flex items-center gap-2">
                <RefreshCw className="animate-spin" size={20} /> Analysiere...
              </span>
            ) : (
              <>
                <Eye size={24} />
                <span>Vorschau erstellen</span>
              </>
            )}
          </button>
        </div>
      )}

      {/* Preview Section */}
      {status === 'preview' && (
        <div className="bg-white border border-blue-200 rounded-xl shadow-lg overflow-hidden animate-fade-in">
          <div className="bg-blue-50 p-6 border-b border-blue-100 flex flex-col md:flex-row justify-between items-center gap-4">
            <div>
              <h3 className="text-xl font-bold text-blue-900 flex items-center gap-2">
                <CheckCircle className="text-blue-600" />
                Analyse erfolgreich
              </h3>
              <p className="text-blue-700 mt-1">
                {previewMovements.length} Datensätze gefunden. Bitte prüfen Sie die Daten vor dem Import.
              </p>
            </div>
            <div className="flex gap-3">
              <button 
                onClick={handleCancel}
                className="flex items-center gap-2 px-4 py-2 text-red-600 bg-white border border-red-200 rounded-lg hover:bg-red-50"
              >
                <XCircle size={18} /> Abbrechen
              </button>
              <button 
                onClick={handleConfirmImport}
                className="flex items-center gap-2 px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 shadow-md font-medium"
              >
                <UploadCloud size={18} /> Importieren
              </button>
            </div>
          </div>

          <div className="max-h-96 overflow-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-gray-50 text-gray-600 font-medium border-b sticky top-0">
                <tr>
                  <th className="p-3">Datum</th>
                  <th className="p-3">ID</th>
                  <th className="p-3">Ort</th>
                  <th className="p-3">Zeit (Orig)</th>
                  <th className="p-3">Zeit (Korr)</th>
                  <th className="p-3">Betrag</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {previewMovements.slice(0, 50).map((m, i) => (
                  <tr key={i} className="hover:bg-blue-50/50">
                    <td className="p-3">{m.date}</td>
                    <td className="p-3 font-mono text-xs">{m.employeeId}</td>
                    <td className="p-3 font-medium">{m.location || <span className="text-red-400 italic">Kein Ort</span>}</td>
                    <td className="p-3 text-gray-500">{m.startTimeRaw} - {m.endTimeRaw}</td>
                    <td className="p-3">{m.startTimeCorr} - {m.endTimeCorr}</td>
                    <td className="p-3 font-bold">{m.amount.toFixed(2)} €</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {previewMovements.length > 50 && (
              <div className="p-4 text-center text-gray-500 text-xs bg-gray-50 border-t">
                ... und {previewMovements.length - 50} weitere Einträge
              </div>
            )}
          </div>
        </div>
      )}

      {/* Log Output */}
      {(status === 'success' || status === 'error') && (
        <div className={`rounded-xl border shadow-sm overflow-hidden transition-all duration-300 ${
            status === 'success' ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'
        }`}>
          <div className="p-4 border-b border-gray-200/50 flex items-center justify-between bg-white/50 backdrop-blur-sm">
             <div className="flex items-center gap-2">
                <Terminal size={18} className="text-gray-500" />
                <h4 className="font-semibold text-gray-700">Import Protokoll</h4>
             </div>
             {status === 'success' && (
               <button onClick={() => { setStatus('idle'); setDispoFile(null); setTimeFile(null); setLog([]); }} className="text-xs text-blue-600 hover:underline">
                 Neuer Import
               </button>
             )}
          </div>
          <div className="p-4 font-mono text-xs md:text-sm text-gray-700 space-y-1 max-h-64 overflow-y-auto bg-white/80">
            {log.map((l, i) => {
                let colorClass = "text-gray-600";
                if (l.includes("❌") || l.includes("⚠️") || l.includes("FEHLER")) colorClass = "text-red-600 font-bold bg-red-50 px-1 rounded";
                if (l.includes("✅") || l.includes("ERFOLG")) colorClass = "text-green-600 font-bold bg-green-50 px-1 rounded";
                if (l.includes("📂")) colorClass = "text-blue-600 font-bold mt-3 block border-t border-gray-100 pt-2";
                
                return <div key={i} className={`${colorClass} whitespace-pre-wrap py-0.5`}>{l}</div>
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default ImportData;