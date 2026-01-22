import React, { useEffect, useState } from 'react';
import { getConfig, saveConfig, cleanupOldData, downloadBackup } from '../services/storage';
import { AppConfig } from '../types';
import { Save, Trash2, AlertTriangle, Database, Download } from 'lucide-react';

const Settings: React.FC = () => {
  const [config, setConfig] = useState<AppConfig>({
    addStartMins: 0,
    subEndMins: 0,
    rules: []
  });
  const [cleanupDate, setCleanupDate] = useState('');

  useEffect(() => {
    getConfig().then(setConfig);
  }, []);

  const handleSave = async () => {
    await saveConfig(config);
    alert('Einstellungen gespeichert. Berechnungen werden bei neuen Importen angewendet.');
  };

  const updateRule = (index: number, field: 'hoursThreshold' | 'amount', value: number) => {
    const newRules = [...config.rules];
    newRules[index] = { ...newRules[index], [field]: value };
    setConfig({ ...config, rules: newRules });
  };

  const addRule = () => {
    setConfig({ ...config, rules: [...config.rules, { hoursThreshold: 0, amount: 0 }] });
  };

  const removeRule = (index: number) => {
    const newRules = config.rules.filter((_, i) => i !== index);
    setConfig({ ...config, rules: newRules });
  };

  const handleCleanup = async () => {
    if (!cleanupDate) {
      alert("Bitte wählen Sie ein Datum aus.");
      return;
    }
    if (confirm(`Sind Sie sicher, dass Sie alle Datensätze VOR dem ${cleanupDate} unwiderruflich löschen möchten?`)) {
      const res = await cleanupOldData(cleanupDate);
      if (res.success) {
        alert(`Erfolgreich ${res.deletedCount} Datensätze gelöscht.`);
        setCleanupDate('');
      } else {
        alert('Fehler beim Löschen. Bitte Serververbindung prüfen.');
      }
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6 pb-12">
       <h2 className="text-2xl font-bold text-gray-800">Einstellungen</h2>
       
       <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
         <h3 className="text-lg font-semibold mb-4 border-b pb-2">Zeitanpassung</h3>
         <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Korrektur Startzeit (+Minuten)
              </label>
              <input 
                type="number"
                className="w-full border rounded p-2"
                value={config.addStartMins}
                onChange={e => setConfig({...config, addStartMins: parseInt(e.target.value) || 0})}
              />
              <p className="text-xs text-gray-500 mt-1">Dieser Wert wird auf die gestempelte Startzeit addiert.</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Korrektur Endzeit (-Minuten)
              </label>
              <input 
                type="number"
                className="w-full border rounded p-2"
                value={config.subEndMins}
                onChange={e => setConfig({...config, subEndMins: parseInt(e.target.value) || 0})}
              />
              <p className="text-xs text-gray-500 mt-1">Dieser Wert wird von der gestempelten Endzeit abgezogen.</p>
            </div>
         </div>
       </div>

       <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
         <div className="flex justify-between items-center mb-4 border-b pb-2">
            <h3 className="text-lg font-semibold">Spesenregeln</h3>
            <button onClick={addRule} className="text-sm bg-blue-50 text-blue-600 px-3 py-1 rounded hover:bg-blue-100">
              + Regel hinzufügen
            </button>
         </div>
         
         <div className="space-y-3">
           {config.rules.map((rule, idx) => (
             <div key={idx} className="flex items-center gap-4 bg-gray-50 p-3 rounded">
                <div className="flex-1">
                  <label className="text-xs text-gray-500 block">Ab Stunden</label>
                  <input 
                    type="number" 
                    step="0.5"
                    className="border rounded p-1 w-full"
                    value={rule.hoursThreshold}
                    onChange={e => updateRule(idx, 'hoursThreshold', parseFloat(e.target.value))}
                  />
                </div>
                <div className="flex-1">
                  <label className="text-xs text-gray-500 block">Betrag (€)</label>
                  <input 
                    type="number" 
                    step="0.5"
                    className="border rounded p-1 w-full"
                    value={rule.amount}
                    onChange={e => updateRule(idx, 'amount', parseFloat(e.target.value))}
                  />
                </div>
                <button onClick={() => removeRule(idx)} className="mt-4 text-red-500 hover:text-red-700">
                  &times;
                </button>
             </div>
           ))}
           {config.rules.length === 0 && <p className="text-gray-500 italic">Keine Regeln definiert.</p>}
         </div>
       </div>

       <div className="flex justify-end">
         <button 
          onClick={handleSave}
          className="flex items-center gap-2 bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 shadow"
         >
           <Save size={18} />
           <span>Einstellungen Speichern</span>
         </button>
       </div>

       {/* Wartung Section */}
       <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-12">
          
          {/* Datensicherung */}
          <div className="bg-green-50 p-6 rounded-lg shadow-sm border border-green-100">
             <div className="flex items-start gap-3">
                <Database className="text-green-600 flex-shrink-0" size={24} />
                <div className="flex-1">
                    <h3 className="text-lg font-semibold text-green-900 mb-2">Datensicherung</h3>
                    <p className="text-sm text-green-800 mb-4">
                      Laden Sie eine vollständige Kopie der Datenbank herunter.
                    </p>
                    <button 
                      onClick={downloadBackup}
                      className="flex items-center gap-2 bg-white text-green-700 border border-green-200 px-4 py-2 rounded hover:bg-green-100 transition-colors w-full justify-center shadow-sm"
                    >
                      <Download size={16} />
                      <span>Backup herunterladen</span>
                    </button>
                </div>
             </div>
          </div>

          {/* Löschen / Cleanup */}
          <div className="bg-red-50 p-6 rounded-lg shadow-sm border border-red-100">
              <div className="flex items-start gap-3">
                <AlertTriangle className="text-red-600 flex-shrink-0" size={24} />
                <div className="flex-1">
                    <h3 className="text-lg font-semibold text-red-800 mb-2">Datenbank bereinigen</h3>
                    <p className="text-sm text-red-700 mb-2">
                      Lösche alte Datensätze vor dem gewählten Datum.
                    </p>
                    <div className="flex flex-col gap-2">
                        <input 
                          type="date" 
                          className="border border-red-200 rounded p-2 text-sm bg-white w-full"
                          value={cleanupDate}
                          onChange={e => setCleanupDate(e.target.value)}
                        />
                        <button 
                          onClick={handleCleanup}
                          disabled={!cleanupDate}
                          className="flex items-center justify-center gap-2 bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors w-full shadow-sm"
                        >
                          <Trash2 size={16} />
                          <span>Daten unwiderruflich löschen</span>
                        </button>
                    </div>
                </div>
              </div>
          </div>

       </div>
    </div>
  );
};

export default Settings;