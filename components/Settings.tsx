import React, { useEffect, useState } from 'react';
import { getConfig, saveConfig, cleanupOldData, downloadBackup, getSystemLogs, clearSystemLogs, getEmailConfig, saveEmailConfig, sendTestEmail } from '../services/storage';
import { AppConfig, SystemLog, EmailConfig } from '../types';
import { Save, Trash2, AlertTriangle, Database, Download, FileText, RefreshCw, Mail, Sliders, Wrench, CheckCircle, XCircle } from 'lucide-react';

type SettingsTab = 'general' | 'email' | 'maintenance';

const Settings: React.FC = () => {
  const [activeTab, setActiveTab] = useState<SettingsTab>('general');
  const [loading, setLoading] = useState(false);

  // General Config State
  const [config, setConfig] = useState<AppConfig>({
    addStartMins: 0,
    subEndMins: 0,
    rules: []
  });

  // Email Config State
  const [emailConfig, setEmailConfig] = useState<EmailConfig>({
    host: 'smtp.ionos.de',
    port: 465,
    secure: true,
    user: '',
    pass: '',
    fromEmail: 'noreply@example.com'
  });
  const [isTestingEmail, setIsTestingEmail] = useState(false);

  // Maintenance State
  const [cleanupDate, setCleanupDate] = useState('');
  const [logs, setLogs] = useState<SystemLog[]>([]);
  const [isLoadingLogs, setIsLoadingLogs] = useState(false);
  const [logFilter, setLogFilter] = useState<'ALL' | 'ERROR' | 'WARN'>('ALL');

  useEffect(() => {
    setLoading(true);
    Promise.all([getConfig(), getEmailConfig()]).then(([cfg, emailCfg]) => {
      setConfig(cfg);
      if (emailCfg) setEmailConfig(emailCfg);
      setLoading(false);
    });
  }, []);

  // --- TAB: General Actions ---
  const handleSaveGeneral = async () => {
    await saveConfig(config);
    alert('Allgemeine Einstellungen gespeichert.');
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

  // --- TAB: Email Actions ---
  const handleSaveEmail = async () => {
    try {
      await saveEmailConfig(emailConfig);
      alert('Email-Einstellungen gespeichert.');
    } catch (e) {
      alert('Fehler beim Speichern der Email-Einstellungen.');
    }
  };

  const handleTestEmail = async () => {
    setIsTestingEmail(true);
    try {
      const res = await sendTestEmail(emailConfig);
      if (res.success) alert(`✅ ${res.message}`);
      else alert(`❌ ${res.message}`);
    } catch (e: any) {
      alert('Fehler beim Verbindungstest.');
    }
    setIsTestingEmail(false);
  };

  // --- TAB: Maintenance Actions ---
  useEffect(() => {
    if (activeTab === 'maintenance') {
      loadLogs();
    }
  }, [activeTab]);

  const loadLogs = async () => {
    setIsLoadingLogs(true);
    const data = await getSystemLogs(200);
    setLogs(data);
    setIsLoadingLogs(false);
  };

  const handleClearLogs = async () => {
    if(confirm('Möchten Sie das Systemprotokoll wirklich leeren?')) {
        await clearSystemLogs();
        loadLogs();
    }
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

  const filteredLogs = logs.filter(l => logFilter === 'ALL' || l.level === logFilter);

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-12">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-gray-800">Systemeinstellungen</h2>
      </div>

      {/* TABS HEADER */}
      <div className="flex border-b border-gray-200 bg-white rounded-t-lg overflow-hidden">
        <button 
          onClick={() => setActiveTab('general')}
          className={`flex-1 py-4 px-6 flex items-center justify-center gap-2 font-medium transition-colors ${
            activeTab === 'general' ? 'bg-blue-50 text-blue-600 border-b-2 border-blue-600' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
          }`}
        >
          <Sliders size={18} /> Allgemein
        </button>
        <button 
          onClick={() => setActiveTab('email')}
          className={`flex-1 py-4 px-6 flex items-center justify-center gap-2 font-medium transition-colors ${
            activeTab === 'email' ? 'bg-blue-50 text-blue-600 border-b-2 border-blue-600' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
          }`}
        >
          <Mail size={18} /> Email / SMTP
        </button>
        <button 
          onClick={() => setActiveTab('maintenance')}
          className={`flex-1 py-4 px-6 flex items-center justify-center gap-2 font-medium transition-colors ${
            activeTab === 'maintenance' ? 'bg-blue-50 text-blue-600 border-b-2 border-blue-600' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
          }`}
        >
          <Wrench size={18} /> Wartung & Logs
        </button>
      </div>

      {/* --- CONTENT: GENERAL --- */}
      {activeTab === 'general' && (
        <div className="space-y-6 animate-fade-in">
           <div className="bg-white p-6 rounded-b-lg rounded-r-lg shadow-sm border border-gray-200">
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
              onClick={handleSaveGeneral}
              className="flex items-center gap-2 bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 shadow"
             >
               <Save size={18} />
               <span>Einstellungen Speichern</span>
             </button>
           </div>
        </div>
      )}

      {/* --- CONTENT: EMAIL --- */}
      {activeTab === 'email' && (
        <div className="space-y-6 animate-fade-in">
           <div className="bg-white p-6 rounded-b-lg rounded-r-lg shadow-sm border border-gray-200">
              <h3 className="text-lg font-semibold mb-4 border-b pb-2">SMTP Verbindung</h3>
              <p className="text-sm text-gray-500 mb-6">
                Hier konfigurieren Sie den Email-Versand für die PDF-Berichte.
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">SMTP Server (Host)</label>
                  <input 
                    className="w-full border rounded p-2"
                    placeholder="smtp.ionos.de"
                    value={emailConfig.host}
                    onChange={e => setEmailConfig({...emailConfig, host: e.target.value})}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Port</label>
                  <input 
                    type="number"
                    className="w-full border rounded p-2"
                    placeholder="465"
                    value={emailConfig.port}
                    onChange={e => setEmailConfig({...emailConfig, port: parseInt(e.target.value)})}
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Benutzername</label>
                  <input 
                    className="w-full border rounded p-2"
                    value={emailConfig.user}
                    onChange={e => setEmailConfig({...emailConfig, user: e.target.value})}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Passwort</label>
                  <input 
                    type="password"
                    className="w-full border rounded p-2"
                    value={emailConfig.pass}
                    onChange={e => setEmailConfig({...emailConfig, pass: e.target.value})}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Absender Adresse</label>
                  <input 
                    className="w-full border rounded p-2"
                    placeholder="noreply@firma.de"
                    value={emailConfig.fromEmail}
                    onChange={e => setEmailConfig({...emailConfig, fromEmail: e.target.value})}
                  />
                </div>

                <div className="flex items-center pt-6">
                   <label className="flex items-center space-x-2 cursor-pointer">
                      <input 
                        type="checkbox" 
                        className="w-4 h-4 text-blue-600 rounded"
                        checked={emailConfig.secure}
                        onChange={e => setEmailConfig({...emailConfig, secure: e.target.checked})}
                      />
                      <span className="text-gray-700 text-sm">SSL/TLS verwenden (Secure)</span>
                   </label>
                </div>
              </div>

              <div className="mt-8 flex justify-between border-t pt-4">
                 <button 
                  onClick={handleTestEmail}
                  disabled={isTestingEmail}
                  className="flex items-center gap-2 bg-gray-100 text-gray-700 px-4 py-2 rounded hover:bg-gray-200 border border-gray-300"
                 >
                   {isTestingEmail ? <RefreshCw className="animate-spin" size={18}/> : <RefreshCw size={18}/>}
                   Testen
                 </button>

                 <button 
                  onClick={handleSaveEmail}
                  className="flex items-center gap-2 bg-blue-600 text-white px-6 py-2 rounded hover:bg-blue-700 shadow"
                 >
                   <Save size={18} />
                   <span>Speichern</span>
                 </button>
              </div>
           </div>
        </div>
      )}

      {/* --- CONTENT: MAINTENANCE --- */}
      {activeTab === 'maintenance' && (
        <div className="space-y-6 animate-fade-in">
           {/* Backup & Cleanup */}
           <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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

           {/* System Logs */}
           <div className="bg-gray-900 text-gray-200 p-0 rounded-lg shadow-sm border border-gray-700 overflow-hidden">
               <div className="bg-gray-800 p-3 border-b border-gray-700 flex justify-between items-center">
                   <div className="flex items-center gap-2">
                       <FileText size={18} className="text-gray-400" />
                       <h3 className="font-mono text-sm font-semibold">Systemprotokoll (Letzte 200 Einträge)</h3>
                   </div>
                   <div className="flex items-center gap-2">
                       <select 
                         className="bg-gray-700 text-xs border-none rounded px-2 py-1 text-gray-300 focus:ring-1 focus:ring-blue-500"
                         value={logFilter}
                         onChange={(e) => setLogFilter(e.target.value as any)}
                       >
                           <option value="ALL">Alle Levels</option>
                           <option value="ERROR">Nur Fehler</option>
                           <option value="WARN">Warnungen</option>
                       </select>
                       <button 
                         onClick={loadLogs} 
                         disabled={isLoadingLogs}
                         className="p-1.5 hover:bg-gray-700 rounded text-gray-400 hover:text-white transition-colors"
                         title="Aktualisieren"
                        >
                           <RefreshCw size={16} className={isLoadingLogs ? 'animate-spin' : ''} />
                       </button>
                       <button 
                         onClick={handleClearLogs} 
                         className="p-1.5 hover:bg-red-900/50 rounded text-red-400 hover:text-red-200 transition-colors"
                         title="Protokoll leeren"
                        >
                           <Trash2 size={16} />
                       </button>
                   </div>
               </div>
               
               <div className="h-64 overflow-y-auto p-4 font-mono text-xs space-y-1">
                   {isLoadingLogs && logs.length === 0 && <p className="text-gray-500">Lade Protokolle...</p>}
                   {!isLoadingLogs && filteredLogs.length === 0 && <p className="text-gray-500 italic">Keine Einträge vorhanden.</p>}
                   
                   {filteredLogs.map(log => (
                       <div key={log.id} className="flex gap-2 items-start hover:bg-white/5 p-0.5 rounded">
                           <span className="text-gray-500 whitespace-nowrap">
                               {new Date(log.timestamp).toLocaleString('de-DE')}
                           </span>
                           <span className={`font-bold w-12 text-center text-[10px] px-1 rounded ${
                               log.level === 'ERROR' ? 'bg-red-900 text-red-200' :
                               log.level === 'WARN' ? 'bg-orange-900 text-orange-200' :
                               'bg-blue-900 text-blue-200'
                           }`}>
                               {log.level}
                           </span>
                           <span className="flex-1 text-gray-300 break-all">
                               {log.message}
                               {log.details && (
                                   <details className="mt-1 text-gray-500 cursor-pointer">
                                       <summary className="hover:text-gray-400">Details anzeigen</summary>
                                       <pre className="mt-1 p-2 bg-black/30 rounded overflow-x-auto text-[10px]">
                                           {log.details}
                                       </pre>
                                   </details>
                               )}
                           </span>
                       </div>
                   ))}
               </div>
           </div>
        </div>
      )}

    </div>
  );
};

export default Settings;