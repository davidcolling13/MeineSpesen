import React, { useEffect, useState, useMemo } from 'react';
import { getMovements, getEmployees, getConfig, updateMovement } from '../services/storage';
import { Movement, Employee, AppConfig } from '../types';
import { Save, Wand2 } from 'lucide-react';
import { analyzeExpenses } from '../services/gemini';
import { BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer } from 'recharts';

const Dashboard: React.FC = () => {
  const [movements, setMovements] = useState<Movement[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [config, setConfig] = useState<AppConfig | null>(null);
  
  const [filterMonth, setFilterMonth] = useState(new Date().getMonth());
  const [filterYear, setFilterYear] = useState(new Date().getFullYear());
  const [filterEmp, setFilterEmp] = useState<string>('all');
  
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<Movement>>({});
  
  const [aiAnalysis, setAiAnalysis] = useState<string>('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const loadData = async () => {
    const [movs, emps, cfg] = await Promise.all([
      getMovements(),
      getEmployees(),
      getConfig()
    ]);
    setMovements(movs);
    setEmployees(emps);
    setConfig(cfg);
  };

  useEffect(() => {
    loadData();
  }, []);

  const filteredMovements = useMemo(() => {
    return movements.filter(m => {
      const d = new Date(m.date);
      const matchesDate = d.getMonth() === filterMonth && d.getFullYear() === filterYear;
      const matchesEmp = filterEmp === 'all' || m.employeeId === filterEmp;
      return matchesDate && matchesEmp;
    }).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [movements, filterMonth, filterYear, filterEmp]);

  const stats = useMemo(() => {
    return filteredMovements.reduce((acc, curr) => ({
      totalHours: acc.totalHours + curr.durationNetto,
      totalAmount: acc.totalAmount + curr.amount
    }), { totalHours: 0, totalAmount: 0 });
  }, [filteredMovements]);

  const chartData = useMemo(() => {
    const data: Record<string, number> = {};
    filteredMovements.forEach(m => {
      const day = m.date.split('-')[2];
      data[day] = (data[day] || 0) + m.amount;
    });
    return Object.keys(data).map(day => ({ day, amount: data[day] }));
  }, [filteredMovements]);

  const handleEdit = (m: Movement) => {
    setEditingId(m.id);
    setEditForm({ ...m });
  };

  const handleSave = async () => {
    if (!editingId || !config || !editForm) return;
    
    const rawStart = editForm.startTimeCorr || '00:00'; 
    const rawEnd = editForm.endTimeCorr || '00:00';

    const startMins = rawStart.split(':').map(Number);
    const endMins = rawEnd.split(':').map(Number);
    const durationMins = Math.max(0, (endMins[0] * 60 + endMins[1]) - (startMins[0] * 60 + startMins[1]));
    const durationHours = parseFloat((durationMins / 60).toFixed(2));
    
    const sortedRules = [...config.rules].sort((a, b) => b.hoursThreshold - a.hoursThreshold);
    const rule = sortedRules.find(r => durationHours >= r.hoursThreshold);
    const calculatedAmount = rule ? rule.amount : 0;

    const original = movements.find(m => m.id === editingId)!;

    const updated: Movement = {
      ...original,
      location: editForm.location || '',
      startTimeCorr: rawStart,
      endTimeCorr: rawEnd,
      durationNetto: durationHours,
      amount: editForm.amount !== undefined ? editForm.amount : calculatedAmount,
      isManual: true
    };

    await updateMovement(updated);
    
    // Update local state optimistic or reload
    setMovements(prev => prev.map(m => m.id === updated.id ? updated : m));
    setEditingId(null);
    setEditForm({});
  };

  const runAnalysis = async () => {
    setIsAnalyzing(true);
    setAiAnalysis('');
    const res = await analyzeExpenses(filteredMovements, employees);
    setAiAnalysis(res);
    setIsAnalyzing(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <h2 className="text-2xl font-bold text-gray-800">Monatsübersicht</h2>
        
        <div className="flex flex-wrap gap-2">
          <select 
            value={filterMonth} 
            onChange={(e) => setFilterMonth(Number(e.target.value))}
            className="border rounded p-2 text-sm"
          >
            {Array.from({length: 12}, (_, i) => (
              <option key={i} value={i}>{new Date(0, i).toLocaleString('de-DE', { month: 'long' })}</option>
            ))}
          </select>
          <select 
            value={filterYear} 
            onChange={(e) => setFilterYear(Number(e.target.value))}
            className="border rounded p-2 text-sm"
          >
            {[2023, 2024, 2025, 2026].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <select 
            value={filterEmp} 
            onChange={(e) => setFilterEmp(e.target.value)}
            className="border rounded p-2 text-sm"
          >
            <option value="all">Alle Mitarbeiter</option>
            {employees.map(e => (
              <option key={e.id} value={e.id}>{e.lastName}, {e.firstName}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-100">
          <p className="text-sm text-gray-500">Datensätze</p>
          <p className="text-2xl font-bold">{filteredMovements.length}</p>
        </div>
        <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-100">
          <p className="text-sm text-gray-500">Gesamtstunden</p>
          <p className="text-2xl font-bold">{stats.totalHours.toFixed(2)} h</p>
        </div>
        <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-100">
          <p className="text-sm text-gray-500">Auszahlungsbetrag</p>
          <p className="text-2xl font-bold text-green-600">{stats.totalAmount.toFixed(2)} €</p>
        </div>
      </div>

       {filteredMovements.length > 0 && (
         <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-100 h-64">
           <h3 className="text-sm font-semibold text-gray-500 mb-4">Tägliche Spesen (€)</h3>
           <ResponsiveContainer width="100%" height="100%">
             <BarChart data={chartData}>
               <CartesianGrid strokeDasharray="3 3" vertical={false} />
               <XAxis dataKey="day" />
               <YAxis />
               <Tooltip />
               <Bar dataKey="amount" fill="#3b82f6" radius={[4, 4, 0, 0]} />
             </BarChart>
           </ResponsiveContainer>
         </div>
       )}

      <div className="bg-white rounded-lg shadow-sm overflow-hidden border border-gray-200">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-gray-50 text-gray-600 font-medium border-b">
              <tr>
                <th className="p-3">Datum</th>
                <th className="p-3">Mitarbeiter</th>
                <th className="p-3">Ort</th>
                <th className="p-3 hidden md:table-cell">Orig Start</th>
                <th className="p-3 hidden md:table-cell">Orig Ende</th>
                <th className="p-3">Korr Start</th>
                <th className="p-3">Korr Ende</th>
                <th className="p-3">Dauer</th>
                <th className="p-3">Spesen (€)</th>
                <th className="p-3">Aktion</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredMovements.map(m => {
                const isEditing = editingId === m.id;
                const emp = employees.find(e => e.id === m.employeeId);
                return (
                  <tr key={m.id} className="hover:bg-gray-50 group">
                    <td className="p-3">{new Date(m.date).toLocaleDateString('de-DE')}</td>
                    <td className="p-3 font-medium text-gray-700">
                      {emp ? `${emp.lastName}, ${emp.firstName}` : m.employeeId}
                    </td>
                    <td className="p-3">
                      {isEditing ? (
                        <input 
                          className="border rounded px-2 py-1 w-full"
                          value={editForm.location || ''}
                          onChange={e => setEditForm({...editForm, location: e.target.value})}
                        />
                      ) : m.location}
                    </td>
                    <td className="p-3 text-gray-400 hidden md:table-cell">{m.startTimeRaw}</td>
                    <td className="p-3 text-gray-400 hidden md:table-cell">{m.endTimeRaw}</td>
                    <td className="p-3">
                      {isEditing ? (
                        <input 
                          type="time"
                          className="border rounded px-2 py-1 w-24"
                          value={editForm.startTimeCorr || ''}
                          onChange={e => setEditForm({...editForm, startTimeCorr: e.target.value})}
                        />
                      ) : <span className={m.startTimeCorr !== m.startTimeRaw ? 'text-blue-600 font-medium' : ''}>{m.startTimeCorr}</span>}
                    </td>
                    <td className="p-3">
                      {isEditing ? (
                        <input 
                          type="time"
                          className="border rounded px-2 py-1 w-24"
                          value={editForm.endTimeCorr || ''}
                          onChange={e => setEditForm({...editForm, endTimeCorr: e.target.value})}
                        />
                      ) : <span className={m.endTimeCorr !== m.endTimeRaw ? 'text-blue-600 font-medium' : ''}>{m.endTimeCorr}</span>}
                    </td>
                    <td className="p-3">{m.durationNetto.toFixed(2)}</td>
                    <td className="p-3 font-bold">
                       {isEditing ? (
                        <input 
                          type="number"
                          step="0.01"
                          className="border rounded px-2 py-1 w-20"
                          value={editForm.amount}
                          onChange={e => setEditForm({...editForm, amount: parseFloat(e.target.value)})}
                        />
                      ) : m.amount.toFixed(2)}
                    </td>
                    <td className="p-3">
                      {isEditing ? (
                        <button onClick={handleSave} className="text-green-600 hover:text-green-800 p-1">
                          <Save size={18} />
                        </button>
                      ) : (
                        <button onClick={() => handleEdit(m)} className="text-gray-400 hover:text-blue-600 p-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          Edit
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
              {filteredMovements.length === 0 && (
                <tr>
                  <td colSpan={10} className="p-8 text-center text-gray-500">
                    Keine Daten für diesen Zeitraum gefunden.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-100 rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Wand2 className="text-indigo-600" />
            <h3 className="text-lg font-semibold text-indigo-900">AI Report Analysis</h3>
          </div>
          <button 
            onClick={runAnalysis}
            disabled={isAnalyzing || filteredMovements.length === 0}
            className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-indigo-700 disabled:opacity-50 transition-colors"
          >
            {isAnalyzing ? 'Analyzing...' : 'Analyze with Gemini'}
          </button>
        </div>
        
        {aiAnalysis && (
          <div className="bg-white p-4 rounded border border-indigo-100 text-gray-700 whitespace-pre-wrap leading-relaxed text-sm">
            {aiAnalysis}
          </div>
        )}
        {!aiAnalysis && !isAnalyzing && (
          <p className="text-sm text-gray-500">Click to detect anomalies and summarize expenses using Gemini AI.</p>
        )}
      </div>
    </div>
  );
};

export default Dashboard;