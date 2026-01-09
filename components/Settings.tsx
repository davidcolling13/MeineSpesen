import React, { useEffect, useState } from 'react';
import { getConfig, saveConfig } from '../services/storage';
import { AppConfig } from '../types';
import { Save } from 'lucide-react';

const Settings: React.FC = () => {
  const [config, setConfig] = useState<AppConfig>({
    addStartMins: 0,
    subEndMins: 0,
    rules: []
  });

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

  return (
    <div className="max-w-2xl mx-auto space-y-6">
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
    </div>
  );
};

export default Settings;