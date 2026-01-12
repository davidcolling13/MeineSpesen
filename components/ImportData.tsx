import React, { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { getConfig, saveMovements, getMovements } from '../services/storage';
import { processImportFiles } from '../services/importService';
import { UploadCloud, CheckCircle, Terminal, RefreshCw } from 'lucide-react';

const ImportData: React.FC = () => {
  const [dispoFile, setDispoFile] = useState<File | null>(null);
  const [timeFile, setTimeFile] = useState<File | null>(null);
  const [status, setStatus] = useState<'idle' | 'processing' | 'success' | 'error'>('idle');
  const [log, setLog] = useState<string[]>([]);

  const handleImport = async () => {
    if (!dispoFile || !timeFile) return;
    setStatus('processing');
    setLog([]);

    try {
      // 1. Abhängigkeiten laden
      const config = await getConfig();
      const existingMovements = await getMovements();

      // 2. Logik an Service delegieren
      const result = await processImportFiles(dispoFile, timeFile, config, existingMovements);

      // 3. Ergebnis verarbeiten
      setLog(result.logs);
      
      if (result.success && result.movements.length > 0) {
        await saveMovements(result.movements);
        setStatus('success');
      } else {
        setStatus('error');
      }

    } catch (e: any) {
      console.error(e);
      setStatus('error');
      setLog(prev => [...prev, `❌ SYSTEM FEHLER: ${e.message}`]);
    }
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