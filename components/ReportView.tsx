import React, { useState, useMemo, useEffect } from 'react';
import { getMovements, getEmployees, updateMovement, deleteMovement, getConfig, saveMovements } from '../services/storage';
import { Movement, Employee, AppConfig } from '../types';
import { Download, Mail, FileText, Loader2, Printer, Trash2, Save, FileArchive, Check, X } from 'lucide-react';
import { PDFDownloadLink, pdf } from '@react-pdf/renderer';
import ReportPdfLayout, { ReportData } from './ReportPdfLayout';
import { calculateMovement } from '../services/calculation';
import JSZip from 'jszip';
import FileSaver from 'file-saver';

const ReportView: React.FC = () => {
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedEmpId, setSelectedEmpId] = useState<string>('');
  
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [allMovements, setAllMovements] = useState<Movement[]>([]);
  const [config, setConfig] = useState<AppConfig | null>(null);

  const [isSending, setIsSending] = useState(false);
  const [isZipping, setIsZipping] = useState(false);
  const [isPrintingAll, setIsPrintingAll] = useState(false);
  const [isPrintingSingle, setIsPrintingSingle] = useState(false);

  // Edit State
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<Movement>>({});

  const refreshData = async () => {
    const [e, m, c] = await Promise.all([getEmployees(), getMovements(), getConfig()]);
    setEmployees(e);
    setAllMovements(m);
    setConfig(c);
  };

  useEffect(() => {
    refreshData();
  }, []);

  // --- Filtering Logic ---
  const movementsForMonth = useMemo(() => {
     return allMovements.filter(m => {
        const d = new Date(m.date);
        return d.getMonth() === selectedMonth && d.getFullYear() === selectedYear;
     });
  }, [allMovements, selectedMonth, selectedYear]);

  const reportData = useMemo(() => {
    if (!selectedEmpId) return null;
    return movementsForMonth.filter(m => m.employeeId === selectedEmpId)
           .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [selectedEmpId, movementsForMonth]);

  const selectedEmployee = employees.find(e => e.id === selectedEmpId);

  const totals = useMemo(() => {
    if (!reportData) return { hours: 0, amount: 0 };
    return reportData.reduce((acc, curr) => ({
      hours: acc.hours + curr.durationNetto,
      amount: acc.amount + curr.amount
    }), { hours: 0, amount: 0 });
  }, [reportData]);

  const monthName = new Date(selectedYear, selectedMonth).toLocaleString('de-DE', { month: 'long' });
  const singleFileName = `Spesen_${selectedYear}-${(selectedMonth+1).toString().padStart(2,'0')}_${selectedEmployee?.lastName || 'Report'}.pdf`;

  // --- Editing Logic ---
  const handleEdit = (m: Movement) => {
    setEditingId(m.id);
    setEditForm({ ...m });
  };

  const handleDelete = async (id: string) => {
    if (confirm('Möchten Sie diesen Datensatz wirklich löschen?')) {
        await deleteMovement(id);
        // Optimistic update locally to feel snappy
        setAllMovements(prev => prev.filter(m => m.id !== id));
    }
  };

  const handleSaveEdit = async () => {
    if (!editingId || !config || !editForm) return;

    const startCorr = editForm.startTimeCorr || '00:00'; 
    const endCorr = editForm.endTimeCorr || '00:00';
    
    // We create a temporary config with 0 corrections because the user is editing the *Corrected* time directly
    const tempConfig: AppConfig = { ...config, addStartMins: 0, subEndMins: 0 };
    
    const calculated = calculateMovement(startCorr, endCorr, tempConfig);
    const original = allMovements.find(m => m.id === editingId)!;

    const updated: Movement = {
      ...original,
      location: editForm.location || '',
      startTimeCorr: startCorr,
      endTimeCorr: endCorr,
      durationNetto: calculated.duration,
      amount: editForm.amount !== undefined ? editForm.amount : calculated.amount,
      isManual: true
    };

    await updateMovement(updated);
    
    setAllMovements(prev => prev.map(m => m.id === updated.id ? updated : m));
    setEditingId(null);
    setEditForm({});
  };


  // --- Individual Actions ---
  const handleEmail = async () => {
    if (!selectedEmployee || !reportData) return;
    if (!selectedEmployee.email) {
      alert("Keine Email-Adresse für diesen Mitarbeiter hinterlegt.");
      return;
    }
    
    setIsSending(true);
    try {
      const doc = (
        <ReportPdfLayout 
            data={{
                movements: reportData, 
                employee: selectedEmployee, 
                monthName, 
                year: selectedYear, 
                totals
            }}
        />
      );
      const blob = await pdf(doc).toBlob();
      
      const reader = new FileReader();
      reader.readAsDataURL(blob);
      reader.onloadend = async () => {
          const base64data = reader.result;
          const res = await fetch('/api/email-report', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                email: selectedEmployee.email,
                fileName: singleFileName,
                fileData: base64data
            })
          });

          if (res.ok) alert(`PDF wurde erfolgreich an ${selectedEmployee.email} gesendet.`);
          else alert("Fehler beim Senden der Email.");
          setIsSending(false);
      };
    } catch (e) {
      console.error(e);
      alert("Fehler bei der PDF Generierung.");
      setIsSending(false);
    }
  };

  const handlePrintSingle = async () => {
    if (!selectedEmployee || !reportData) return;
    setIsPrintingSingle(true);
    try {
        const doc = (
            <ReportPdfLayout 
                data={{
                    movements: reportData, 
                    employee: selectedEmployee, 
                    monthName, 
                    year: selectedYear, 
                    totals
                }}
            />
        );
        const blob = await pdf(doc).toBlob();
        const url = URL.createObjectURL(blob);
        window.open(url, '_blank');
    } catch (e) {
        console.error(e);
        alert("Fehler beim Drucken.");
    }
    setIsPrintingSingle(false);
  };

  // --- Bulk Actions Helper ---
  const generateAllReports = () => {
      // 1. Identify all employees who have data in this month
      const activeEmployeeIds = new Set(movementsForMonth.map(m => m.employeeId));
      const reports: ReportData[] = [];

      activeEmployeeIds.forEach(empId => {
          const emp = employees.find(e => e.id === empId);
          if (!emp) return;

          const movs = movementsForMonth.filter(m => m.employeeId === empId)
                        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
          
          const t = movs.reduce((acc, curr) => ({
            hours: acc.hours + curr.durationNetto,
            amount: acc.amount + curr.amount
          }), { hours: 0, amount: 0 });

          reports.push({
              employee: emp,
              movements: movs,
              monthName,
              year: selectedYear,
              totals: t
          });
      });
      return reports;
  };

  // --- Bulk ZIP ---
  const handleBulkZip = async () => {
      setIsZipping(true);
      try {
          const reports = generateAllReports();
          if (reports.length === 0) {
              alert("Keine Daten für diesen Monat vorhanden.");
              setIsZipping(false);
              return;
          }

          const zip = new JSZip();
          const folder = zip.folder(`Spesen_${selectedYear}_${selectedMonth+1}`);

          for (const rep of reports) {
               const doc = <ReportPdfLayout data={rep} />;
               const blob = await pdf(doc).toBlob();
               const fName = `Spesen_${rep.employee.lastName}_${rep.employee.firstName}.pdf`;
               folder?.file(fName, blob);
          }

          const content = await zip.generateAsync({ type: "blob" });
          // FileSaver.saveAs is the safest bet for the default export object
          FileSaver.saveAs(content, `Spesen_Export_${selectedYear}-${selectedMonth+1}.zip`);

      } catch (e) {
          console.error(e);
          alert("Fehler beim Erstellen der ZIP-Datei.");
      }
      setIsZipping(false);
  };

  // --- Bulk Print (Merged PDF) ---
  const handleBulkPrint = async () => {
      setIsPrintingAll(true);
      try {
          const reports = generateAllReports();
          if (reports.length === 0) {
              alert("Keine Daten für diesen Monat vorhanden.");
              setIsPrintingAll(false);
              return;
          }

          // Generate one PDF document containing multiple reports
          const doc = <ReportPdfLayout reports={reports} />;
          const blob = await pdf(doc).toBlob();
          
          // Open Blob in new tab for printing
          const url = URL.createObjectURL(blob);
          window.open(url, '_blank');

      } catch (e) {
          console.error(e);
          alert("Fehler beim Generieren des Sammel-PDFs.");
      }
      setIsPrintingAll(false);
  };

  return (
    <div className="space-y-6 h-full flex flex-col">
      {/* Top Filter Bar */}
      <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200 flex flex-wrap justify-between gap-4 items-end flex-shrink-0">
        <div className="flex gap-4 items-end flex-wrap">
            <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Mitarbeiter wählen</label>
            <select 
                className="border rounded p-2 min-w-[200px]"
                value={selectedEmpId}
                onChange={e => setSelectedEmpId(e.target.value)}
            >
                <option value="">-- Übersicht (Alle) --</option>
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
        </div>

        {/* Bulk Actions (Visible when in Overview or always visible for utility) */}
        <div className="flex gap-2 border-l pl-4 border-gray-200">
            <button 
                onClick={handleBulkZip}
                disabled={isZipping || movementsForMonth.length === 0}
                className="flex items-center gap-2 bg-gray-100 text-gray-700 px-4 py-2 rounded hover:bg-gray-200 text-sm disabled:opacity-50"
            >
                {isZipping ? <Loader2 size={16} className="animate-spin" /> : <FileArchive size={16} />}
                <span>{isZipping ? 'Zippen...' : 'Alle als ZIP'}</span>
            </button>
            <button 
                onClick={handleBulkPrint}
                disabled={isPrintingAll || movementsForMonth.length === 0}
                className="flex items-center gap-2 bg-gray-100 text-gray-700 px-4 py-2 rounded hover:bg-gray-200 text-sm disabled:opacity-50"
            >
                {isPrintingAll ? <Loader2 size={16} className="animate-spin" /> : <Printer size={16} />}
                <span>{isPrintingAll ? 'Generiere...' : 'Alle Drucken'}</span>
            </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 min-h-0 bg-white rounded-lg border border-gray-300 overflow-hidden flex flex-col">
        {selectedEmployee && reportData ? (
            <>
                {/* Single Employee Action Bar */}
                <div className="bg-gray-50 border-b p-4 flex justify-between items-center shadow-sm">
                    <div className="text-lg font-semibold text-gray-800">
                         {selectedEmployee.lastName}, {selectedEmployee.firstName} 
                         <span className="text-gray-500 text-sm font-normal ml-2">({reportData.length} Einträge)</span>
                    </div>
                    <div className="flex gap-2">
                         <button 
                            onClick={handlePrintSingle}
                            disabled={isPrintingSingle}
                            className="flex items-center gap-2 bg-gray-700 text-white px-4 py-2 rounded hover:bg-gray-800 text-sm disabled:opacity-50 transition-colors"
                         >
                            {isPrintingSingle ? <Loader2 size={16} className="animate-spin"/> : <Printer size={16} />}
                            Drucken
                         </button>

                         <PDFDownloadLink 
                            document={
                                <ReportPdfLayout 
                                    data={{
                                        movements: reportData, 
                                        employee: selectedEmployee, 
                                        monthName, 
                                        year: selectedYear, 
                                        totals
                                    }}
                                />
                            } 
                            fileName={singleFileName}
                            className="flex items-center gap-2 bg-gray-800 text-white px-4 py-2 rounded hover:bg-gray-900 text-sm transition-colors"
                         >
                            {({ loading }) => (loading ? 'Lade...' : <><Download size={16} /> PDF</>)}
                         </PDFDownloadLink>

                         <button 
                            onClick={handleEmail}
                            disabled={isSending}
                            className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 text-sm disabled:opacity-50 transition-colors"
                         >
                            {isSending ? <Loader2 size={16} className="animate-spin"/> : <Mail size={16} />}
                            {isSending ? 'Senden' : 'Email'}
                         </button>
                    </div>
                </div>

                {/* Editable Table */}
                <div className="overflow-auto flex-1 p-4">
                    <table className="w-full text-sm text-left border-collapse">
                        <thead className="bg-gray-50 text-gray-600 font-medium border-b sticky top-0">
                            <tr>
                                <th className="p-3">Datum</th>
                                <th className="p-3">Ort</th>
                                <th className="p-3">Start (Korr)</th>
                                <th className="p-3">Ende (Korr)</th>
                                <th className="p-3">Std.</th>
                                <th className="p-3">Betrag (€)</th>
                                <th className="p-3 text-right">Aktion</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {reportData.map(m => {
                                const isEditing = editingId === m.id;
                                return (
                                    <tr key={m.id} className="hover:bg-gray-50 group">
                                        <td className="p-3">{new Date(m.date).toLocaleDateString('de-DE')}</td>
                                        
                                        {/* Location */}
                                        <td className="p-3">
                                            {isEditing ? (
                                                <input 
                                                  className="border rounded px-2 py-1 w-full"
                                                  value={editForm.location || ''}
                                                  onChange={e => setEditForm({...editForm, location: e.target.value})}
                                                />
                                            ) : m.location}
                                        </td>

                                        {/* Start Time */}
                                        <td className="p-3">
                                            {isEditing ? (
                                                <input 
                                                  type="time"
                                                  className="border rounded px-2 py-1 w-24"
                                                  value={editForm.startTimeCorr || ''}
                                                  onChange={e => setEditForm({...editForm, startTimeCorr: e.target.value})}
                                                />
                                            ) : <span className={m.startTimeCorr !== m.startTimeRaw ? 'text-blue-600' : ''}>{m.startTimeCorr}</span>}
                                        </td>

                                        {/* End Time */}
                                        <td className="p-3">
                                            {isEditing ? (
                                                <input 
                                                  type="time"
                                                  className="border rounded px-2 py-1 w-24"
                                                  value={editForm.endTimeCorr || ''}
                                                  onChange={e => setEditForm({...editForm, endTimeCorr: e.target.value})}
                                                />
                                            ) : <span className={m.endTimeCorr !== m.endTimeRaw ? 'text-blue-600' : ''}>{m.endTimeCorr}</span>}
                                        </td>

                                        <td className="p-3">
                                            <div className="flex items-center gap-2">
                                                <span>{m.durationNetto.toFixed(2)}</span>
                                                {m.amount > 0 ? (
                                                    <Check size={16} className="text-green-600" />
                                                ) : (
                                                    <X size={16} className="text-red-500" />
                                                )}
                                            </div>
                                        </td>
                                        
                                        {/* Amount */}
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

                                        {/* Actions */}
                                        <td className="p-3 text-right">
                                            {isEditing ? (
                                                <button onClick={handleSaveEdit} className="text-green-600 hover:text-green-800 p-2 rounded hover:bg-green-50">
                                                  <Save size={18} />
                                                </button>
                                            ) : (
                                                <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <button onClick={() => handleEdit(m)} className="text-gray-400 hover:text-blue-600 p-2 rounded hover:bg-blue-50">
                                                        Edit
                                                    </button>
                                                    <button onClick={() => handleDelete(m.id)} className="text-gray-400 hover:text-red-600 p-2 rounded hover:bg-red-50">
                                                        <Trash2 size={18} />
                                                    </button>
                                                </div>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                        <tfoot className="bg-gray-50 font-bold text-gray-700 border-t sticky bottom-0">
                             <tr>
                                 <td colSpan={4} className="p-3 text-right">Gesamt:</td>
                                 <td className="p-3">{totals.hours.toFixed(2)}</td>
                                 <td className="p-3">{totals.amount.toFixed(2)} €</td>
                                 <td></td>
                             </tr>
                        </tfoot>
                    </table>
                </div>
            </>
        ) : (
             <div className="flex flex-col items-center justify-center h-full text-gray-400 bg-gray-50">
                <FileText size={64} className="mb-4 opacity-20" />
                <p className="text-lg font-medium text-gray-500">Bitte wählen Sie einen Mitarbeiter aus</p>
                <p className="text-sm mt-2">oder nutzen Sie die Funktionen oben rechts für den gesamten Monat.</p>
             </div>
        )}
      </div>
    </div>
  );
};

export default ReportView;