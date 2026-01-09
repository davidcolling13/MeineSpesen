import React, { useState, useMemo, useEffect } from 'react';
import { getMovements, getEmployees } from '../services/storage';
import { Movement, Employee } from '../types';
import { Printer, Download, Mail } from 'lucide-react';

const ReportView: React.FC = () => {
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedEmpId, setSelectedEmpId] = useState<string>('');
  
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [allMovements, setAllMovements] = useState<Movement[]>([]);

  useEffect(() => {
    Promise.all([getEmployees(), getMovements()]).then(([e, m]) => {
      setEmployees(e);
      setAllMovements(m);
    });
  }, []);

  // Filter Data
  const reportData = useMemo(() => {
    if (!selectedEmpId) return null;
    return allMovements.filter(m => {
      const d = new Date(m.date);
      return m.employeeId === selectedEmpId && 
             d.getMonth() === selectedMonth && 
             d.getFullYear() === selectedYear;
    }).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [selectedEmpId, selectedMonth, selectedYear, allMovements]);

  const selectedEmployee = employees.find(e => e.id === selectedEmpId);

  const totals = useMemo(() => {
    if (!reportData) return { hours: 0, amount: 0 };
    return reportData.reduce((acc, curr) => ({
      hours: acc.hours + curr.durationNetto,
      amount: acc.amount + curr.amount
    }), { hours: 0, amount: 0 });
  }, [reportData]);

  const handlePrint = () => {
    window.print();
  };

  const handleEmail = () => {
    if (!selectedEmployee?.email) {
      alert("Keine Email-Adresse für diesen Mitarbeiter hinterlegt.");
      return;
    }
    alert(`Report für ${selectedEmployee.lastName} wurde an ${selectedEmployee.email} gesendet (Simulation).`);
  };

  return (
    <div className="space-y-6">
      <div className="no-print bg-white p-6 rounded-lg shadow-sm border border-gray-200 flex flex-wrap gap-4 items-end">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Mitarbeiter wählen</label>
          <select 
            className="border rounded p-2 min-w-[200px]"
            value={selectedEmpId}
            onChange={e => setSelectedEmpId(e.target.value)}
          >
            <option value="">-- Bitte wählen --</option>
            {employees.map(e => (
              <option key={e.id} value={e.id}>{e.lastName}, {e.firstName} ({e.id})</option>
            ))}
          </select>
        </div>
        
        <div>
           <label className="block text-sm font-medium text-gray-700 mb-1">Monat</label>
           <select 
            value={selectedMonth} 
            onChange={e => setSelectedMonth(Number(e.target.value))}
            className="border rounded p-2"
          >
            {Array.from({length: 12}, (_, i) => (
              <option key={i} value={i}>{new Date(0, i).toLocaleString('de-DE', { month: 'long' })}</option>
            ))}
          </select>
        </div>

        <div>
           <label className="block text-sm font-medium text-gray-700 mb-1">Jahr</label>
           <select 
            value={selectedYear} 
            onChange={e => setSelectedYear(Number(e.target.value))}
            className="border rounded p-2"
          >
            {[2023, 2024, 2025, 2026].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>

        <div className="flex gap-2 ml-auto">
          <button 
            disabled={!reportData}
            onClick={handlePrint}
            className="flex items-center gap-2 bg-gray-800 text-white px-4 py-2 rounded hover:bg-gray-900 disabled:opacity-50"
          >
            <Printer size={18} /> Drucken / PDF
          </button>
          <button 
             disabled={!reportData}
             onClick={handleEmail}
             className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 disabled:opacity-50"
          >
            <Mail size={18} /> Email Senden
          </button>
        </div>
      </div>

      {/* Actual Report Area (Visible in Print) */}
      {selectedEmployee && reportData ? (
        <div className="bg-white p-8 shadow-lg max-w-[210mm] mx-auto min-h-[297mm] print:shadow-none print:w-full print:max-w-none">
          {/* Header */}
          <div className="flex justify-between items-start border-b-2 border-gray-800 pb-6 mb-8">
            <div>
              <h1 className="text-3xl font-bold text-gray-800 uppercase tracking-wide">Spesenabrechnung</h1>
              <p className="text-gray-500 mt-1">
                Zeitraum: {new Date(selectedYear, selectedMonth).toLocaleString('de-DE', { month: 'long', year: 'numeric' })}
              </p>
            </div>
            <div className="text-right">
              <h2 className="font-bold text-xl">{selectedEmployee.lastName}, {selectedEmployee.firstName}</h2>
              <p className="text-gray-600">PNR: {selectedEmployee.id}</p>
              <p className="text-gray-600">{selectedEmployee.email}</p>
            </div>
          </div>

          {/* Content */}
          <table className="w-full text-sm text-left mb-8">
            <thead>
              <tr className="border-b border-gray-300">
                <th className="py-2 font-bold">Datum</th>
                <th className="py-2 font-bold">Ort</th>
                <th className="py-2 text-right">Beginn</th>
                <th className="py-2 text-right">Ende</th>
                <th className="py-2 text-right">Stunden</th>
                <th className="py-2 text-right">Betrag (€)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {reportData.map(row => (
                <tr key={row.id}>
                  <td className="py-2">{new Date(row.date).toLocaleDateString('de-DE')}</td>
                  <td className="py-2">{row.location}</td>
                  <td className="py-2 text-right">{row.startTimeCorr}</td>
                  <td className="py-2 text-right">{row.endTimeCorr}</td>
                  <td className="py-2 text-right">{row.durationNetto.toFixed(2)}</td>
                  <td className="py-2 text-right">{row.amount.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-gray-800 font-bold text-lg">
                <td colSpan={4} className="py-4 text-right">Summe:</td>
                <td className="py-4 text-right">{totals.hours.toFixed(2)} h</td>
                <td className="py-4 text-right">{totals.amount.toFixed(2)} €</td>
              </tr>
            </tfoot>
          </table>

          {/* Footer / Signature */}
          <div className="mt-16 flex justify-between print:break-inside-avoid">
             <div className="w-1/3 border-t border-gray-400 pt-2">
               <p className="text-sm text-gray-600">Datum, Unterschrift Mitarbeiter</p>
             </div>
             <div className="w-1/3 border-t border-gray-400 pt-2">
               <p className="text-sm text-gray-600">Datum, Freigabe Vorgesetzter</p>
             </div>
          </div>
          
          <div className="mt-8 text-center text-xs text-gray-400">
            Erstellt mit MeineSpesen
          </div>
        </div>
      ) : (
        <div className="text-center p-12 text-gray-500">
          Bitte wählen Sie einen Mitarbeiter und Zeitraum aus, um den Bericht zu generieren.
        </div>
      )}
    </div>
  );
};

export default ReportView;