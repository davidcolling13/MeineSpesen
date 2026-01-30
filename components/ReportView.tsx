import React, { useState, useMemo, useEffect } from 'react';
import { getMovements, getEmployees, updateMovement, deleteMovement, getConfig, saveMovements } from '../services/storage';
import { Movement, Employee, AppConfig, ReportData } from '../types';
import { Download, Mail, FileText, Loader2, Printer, Trash2, Save, FileArchive, Check, X, Edit2, CheckSquare, Square, MapPin, Plus } from 'lucide-react';
import { calculateMovement } from '../services/calculation';
import { generateSingleReportPdf, generateBulkReportPdf } from '../services/pdfGenerator';
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
  const [isDownloading, setIsDownloading] = useState(false);

  // Edit State
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<Movement>>({});

  // Add New State
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [addForm, setAddForm] = useState<{
      date: string;
      location: string;
      startTime: string;
      endTime: string;
  }>({ date: '', location: '', startTime: '', endTime: '' });

  // Bulk Edit State
  const [selectedRowIds, setSelectedRowIds] = useState<Set<string>>(new Set());
  const [bulkLocation, setBulkLocation] = useState('');

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

  const currentReportData: ReportData | null = useMemo(() => {
    if (!selectedEmpId) return null;
    const emp = employees.find(e => e.id === selectedEmpId);
    if (!emp) return null;

    const movs = movementsForMonth.filter(m => m.employeeId === selectedEmpId)
           .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    
    const totals = movs.reduce((acc, curr) => ({
      hours: acc.hours + curr.durationNetto,
      amount: acc.amount + curr.amount
    }), { hours: 0, amount: 0 });

    const monthName = new Date(selectedYear, selectedMonth).toLocaleString('de-DE', { month: 'long' });

    return {
      employee: emp,
      movements: movs,
      monthName,
      year: selectedYear,
      totals
    };

  }, [selectedEmpId, movementsForMonth, employees, selectedMonth, selectedYear]);

  const monthName = new Date(selectedYear, selectedMonth).toLocaleString('de-DE', { month: 'long' });

  // --- Helper ---
  const generateId = () => {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
    return Math.random().toString(36).substring(2, 15);
  };

  // --- Bulk Selection Handlers ---
  const toggleSelectAll = () => {
    if (!currentReportData) return;
    if (selectedRowIds.size === currentReportData.movements.length) {
      setSelectedRowIds(new Set());
    } else {
      setSelectedRowIds(new Set(currentReportData.movements.map(m => m.id)));
    }
  };

  const toggleSelectRow = (id: string) => {
    const newSet = new Set(selectedRowIds);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedRowIds(newSet);
  };

  const handleBulkUpdateLocation = async () => {
    if (!bulkLocation || selectedRowIds.size === 0) return;
    if (!confirm(`Möchten Sie den Ort für ${selectedRowIds.size} Einträge auf "${bulkLocation}" ändern?`)) return;

    const updates: Movement[] = [];
    allMovements.forEach(m => {
      if (selectedRowIds.has(m.id)) {
        updates.push({ ...m, location: bulkLocation, isManual: true });
      }
    });

    await saveMovements(updates);
    
    // Update local state optimistically
    setAllMovements(prev => prev.map(m => {
      if (selectedRowIds.has(m.id)) {
        return { ...m, location: bulkLocation, isManual: true };
      }
      return m;
    }));
    
    setSelectedRowIds(new Set());
    setBulkLocation('');
  };

  const handleBulkDelete = async () => {
    if (selectedRowIds.size === 0) return;
    if (!confirm(`Möchten Sie ${selectedRowIds.size} Einträge wirklich unwiderruflich löschen?`)) return;

    for (const id of selectedRowIds) {
      await deleteMovement(id);
    }

    setAllMovements(prev => prev.filter(m => !selectedRowIds.has(m.id)));
    setSelectedRowIds(new Set());
  };

  // --- Add Logic ---
  const handleOpenAddModal = () => {
      // Default date to first of selected month/year
      const defaultDate = new Date(selectedYear, selectedMonth, 1).toISOString().split('T')[0];
      setAddForm({
          date: defaultDate,
          location: '',
          startTime: '06:00',
          endTime: '16:00'
      });
      setIsAddModalOpen(true);
  };

  const handleCreateMovement = async () => {
      if (!config || !selectedEmpId) return;
      if (!addForm.date || !addForm.startTime || !addForm.endTime) {
          alert("Bitte Datum und Zeiten ausfüllen.");
          return;
      }

      // Calculate based on manual input (we treat manual input as corrected time usually, 
      // but to use the calculator we pass them as is. If we want 0 correction for manual entries,
      // we create a temporary config).
      // Here we assume manual entry = corrected time entry.
      const tempConfig: AppConfig = { ...config, addStartMins: 0, subEndMins: 0 };
      const calculated = calculateMovement(addForm.startTime, addForm.endTime, tempConfig);

      const newMovement: Movement = {
          id: generateId(),
          employeeId: selectedEmpId,
          date: addForm.date,
          location: addForm.location,
          startTimeRaw: addForm.startTime, // Keeping raw same as corr for manual
          endTimeRaw: addForm.endTime,
          startTimeCorr: calculated.startCorr,
          endTimeCorr: calculated.endCorr,
          durationNetto: calculated.duration,
          amount: calculated.amount,
          isManual: true
      };

      await saveMovements([newMovement]);
      setAllMovements(prev => [...prev, newMovement]);
      setIsAddModalOpen(false);
  };

  // --- Editing Logic ---
  const handleEdit = (m: Movement) => {
    setEditingId(m.id);
    setEditForm({ ...m });
  };

  const handleDelete = async (id: string) => {
    if (confirm('Möchten Sie diesen Datensatz wirklich löschen?')) {
        await deleteMovement(id);
        setAllMovements(prev => prev.filter(m => m.id !== id));
    }
  };

  const handleSaveEdit = async () => {
    if (!editingId || !config || !editForm) return;

    const startCorr = editForm.startTimeCorr || '00:00'; 
    const endCorr = editForm.endTimeCorr || '00:00';
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


  // --- Individual Actions (Using PDF Generator Service) ---
  const handleEmail = async () => {
    if (!currentReportData) return;
    if (!currentReportData.employee.email) {
      alert("Keine Email-Adresse für diesen Mitarbeiter hinterlegt.");
      return;
    }
    
    setIsSending(true);
    try {
      // 1. Generate Blob via Service
      const blob = await generateSingleReportPdf(currentReportData);
      
      // 2. Convert to Base64 for Transport
      const reader = new FileReader();
      reader.readAsDataURL(blob);
      reader.onloadend = async () => {
          const base64data = reader.result;
          const fileName = `Spesen_${selectedYear}-${(selectedMonth+1).toString().padStart(2,'0')}_${currentReportData.employee.lastName}.pdf`;
          
          const res = await fetch('/api/email-report', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                email: currentReportData.employee.email,
                fileName: fileName,
                fileData: base64data
            })
          });

          if (res.ok) alert(`PDF wurde erfolgreich an ${currentReportData.employee.email} gesendet.`);
          else alert("Fehler beim Senden der Email.");
          setIsSending(false);
      };
    } catch (e) {
      console.error(e);
      alert("Fehler bei der PDF Generierung.");
      setIsSending(false);
    }
  };

  const handleDownloadSingle = async () => {
    if (!currentReportData) return;
    setIsDownloading(true);
    try {
        const blob = await generateSingleReportPdf(currentReportData);
        const fileName = `Spesen_${selectedYear}-${(selectedMonth+1).toString().padStart(2,'0')}_${currentReportData.employee.lastName}.pdf`;
        FileSaver.saveAs(blob, fileName);
    } catch (e) {
        console.error(e);
        alert("Fehler beim Download.");
    }
    setIsDownloading(false);
  };

  const handlePrintSingle = async () => {
    if (!currentReportData) return;
    setIsPrintingSingle(true);
    try {
        const blob = await generateSingleReportPdf(currentReportData);
        const url = URL.createObjectURL(blob);
        window.open(url, '_blank');
    } catch (e) {
        console.error(e);
        alert("Fehler beim Drucken.");
    }
    setIsPrintingSingle(false);
  };

  // --- Bulk Actions Helper ---
  const generateAllReportsData = (): ReportData[] => {
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
          const reports = generateAllReportsData();
          if (reports.length === 0) {
              alert("Keine Daten für diesen Monat vorhanden.");
              setIsZipping(false);
              return;
          }

          const zip = new JSZip();
          const folder = zip.folder(`Spesen_${selectedYear}_${selectedMonth+1}`);

          for (const rep of reports) {
               // Generate single PDF via service
               const blob = await generateSingleReportPdf(rep);
               const fName = `Spesen_${rep.employee.lastName}_${rep.employee.firstName}.pdf`;
               folder?.file(fName, blob);
          }

          const content = await zip.generateAsync({ type: "blob" });
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
          const reports = generateAllReportsData();
          if (reports.length === 0) {
              alert("Keine Daten für diesen Monat vorhanden.");
              setIsPrintingAll(false);
              return;
          }

          // Generate merged PDF via service
          const blob = await generateBulkReportPdf(reports);
          const url = URL.createObjectURL(blob);
          window.open(url, '_blank');

      } catch (e) {
          console.error(e);
          alert("Fehler beim Generieren des Sammel-PDFs.");
      }
      setIsPrintingAll(false);
  };

  return (
    <div className="space-y-6 h-full flex flex-col relative">
      {/* Top Filter Bar */}
      <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200 flex flex-wrap justify-between gap-4 items-end flex-shrink-0">
        <div className="flex gap-4 items-end flex-wrap">
            <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Mitarbeiter wählen</label>
            <select 
                className="border rounded p-2 min-w-[200px]"
                value={selectedEmpId}
                onChange={e => { setSelectedEmpId(e.target.value); setSelectedRowIds(new Set()); }}
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
                onChange={e => { setSelectedMonth(Number(e.target.value)); setSelectedRowIds(new Set()); }}
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
                onChange={e => { setSelectedYear(Number(e.target.value)); setSelectedRowIds(new Set()); }}
                className="border rounded p-2"
            >
                {[2023, 2024, 2025, 2026].map(y => <option key={y} value={y}>{y}</option>)}
            </select>
            </div>
        </div>

        {/* Bulk Actions (Global) */}
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
      <div className="flex-1 min-h-0 bg-white rounded-lg border border-gray-300 overflow-hidden flex flex-col relative">
        {currentReportData ? (
            <>
                {/* Single Employee Action Bar */}
                <div className="bg-gray-50 border-b p-4 flex justify-between items-center shadow-sm">
                    <div className="text-lg font-semibold text-gray-800">
                         {currentReportData.employee.lastName}, {currentReportData.employee.firstName} 
                         <span className="text-gray-500 text-sm font-normal ml-2">({currentReportData.movements.length} Einträge)</span>
                    </div>
                    <div className="flex gap-2">
                         <button 
                            onClick={handleOpenAddModal}
                            className="flex items-center gap-2 bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 text-sm transition-colors mr-2 shadow-sm"
                         >
                            <Plus size={16} />
                            Neuer Eintrag
                         </button>

                         <button 
                            onClick={handlePrintSingle}
                            disabled={isPrintingSingle}
                            className="flex items-center gap-2 bg-gray-700 text-white px-4 py-2 rounded hover:bg-gray-800 text-sm disabled:opacity-50 transition-colors"
                         >
                            {isPrintingSingle ? <Loader2 size={16} className="animate-spin"/> : <Printer size={16} />}
                            Drucken
                         </button>

                         <button 
                            onClick={handleDownloadSingle}
                            disabled={isDownloading}
                            className="flex items-center gap-2 bg-gray-800 text-white px-4 py-2 rounded hover:bg-gray-900 text-sm transition-colors"
                         >
                            {isDownloading ? <Loader2 size={16} className="animate-spin"/> : <Download size={16} />}
                            PDF
                         </button>

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

                {/* Bulk Edit Toolbar (Sticky Top under header) */}
                {selectedRowIds.size > 0 && (
                  <div className="bg-blue-50 border-b border-blue-200 p-3 flex items-center justify-between animate-fade-in sticky top-0 z-20">
                    <div className="flex items-center gap-4">
                      <span className="font-semibold text-blue-900 bg-blue-200 px-2 py-1 rounded text-sm">
                        {selectedRowIds.size} ausgewählt
                      </span>
                      <div className="flex items-center gap-2 border-l border-blue-200 pl-4">
                        <MapPin size={16} className="text-blue-600" />
                        <input 
                          type="text" 
                          placeholder="Neuer Ort für alle..."
                          className="text-sm border border-blue-300 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-400"
                          value={bulkLocation}
                          onChange={(e) => setBulkLocation(e.target.value)}
                        />
                        <button 
                          onClick={handleBulkUpdateLocation}
                          disabled={!bulkLocation}
                          className="text-sm bg-blue-600 text-white px-3 py-1 rounded hover:bg-blue-700 disabled:opacity-50"
                        >
                          Ort aktualisieren
                        </button>
                      </div>
                    </div>
                    <div>
                      <button 
                        onClick={handleBulkDelete}
                        className="flex items-center gap-2 text-sm bg-red-100 text-red-700 px-3 py-1 rounded hover:bg-red-200 border border-red-200"
                      >
                        <Trash2 size={16} /> Löschen
                      </button>
                    </div>
                  </div>
                )}

                {/* Editable Table */}
                <div className="overflow-auto flex-1 p-4">
                    <table className="w-full text-sm text-left border-collapse">
                        <thead className="bg-gray-50 text-gray-600 font-medium border-b sticky top-0 z-10 shadow-sm">
                            <tr>
                                <th className="p-3 w-10">
                                  <button onClick={toggleSelectAll} className="text-gray-500 hover:text-blue-600">
                                    {currentReportData.movements.length > 0 && selectedRowIds.size === currentReportData.movements.length ? (
                                      <CheckSquare size={18} />
                                    ) : (
                                      <Square size={18} />
                                    )}
                                  </button>
                                </th>
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
                            {currentReportData.movements.map(m => {
                                const isEditing = editingId === m.id;
                                const isSelected = selectedRowIds.has(m.id);
                                return (
                                    <tr key={m.id} className={`group hover:bg-gray-50 ${isSelected ? 'bg-blue-50/50' : ''}`}>
                                        <td className="p-3">
                                          <button onClick={() => toggleSelectRow(m.id)} className={`${isSelected ? 'text-blue-600' : 'text-gray-300 group-hover:text-gray-400'}`}>
                                            {isSelected ? <CheckSquare size={18} /> : <Square size={18} />}
                                          </button>
                                        </td>
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
                                                        <Edit2 size={18} />
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
                        <tfoot className="bg-gray-50 font-bold text-gray-700 border-t sticky bottom-0 z-10">
                             <tr>
                                 <td colSpan={5} className="p-3 text-right">Gesamt:</td>
                                 <td className="p-3">{currentReportData.totals.hours.toFixed(2)}</td>
                                 <td className="p-3">{currentReportData.totals.amount.toFixed(2)} €</td>
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

      {/* CREATE NEW MODAL */}
      {isAddModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
              <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden animate-fade-in">
                  <div className="bg-gray-50 border-b p-4 flex justify-between items-center">
                      <h3 className="font-bold text-lg text-gray-800">Neuen Eintrag erstellen</h3>
                      <button onClick={() => setIsAddModalOpen(false)} className="text-gray-500 hover:text-gray-700">
                          <X size={20} />
                      </button>
                  </div>
                  <div className="p-6 space-y-4">
                      <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Datum</label>
                          <input 
                              type="date" 
                              className="w-full border rounded p-2"
                              value={addForm.date}
                              onChange={e => setAddForm({...addForm, date: e.target.value})}
                          />
                      </div>
                      <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Ort</label>
                          <input 
                              type="text" 
                              className="w-full border rounded p-2"
                              placeholder="z.B. Baustelle Köln"
                              value={addForm.location}
                              onChange={e => setAddForm({...addForm, location: e.target.value})}
                          />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                          <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">Beginn</label>
                              <input 
                                  type="time" 
                                  className="w-full border rounded p-2"
                                  value={addForm.startTime}
                                  onChange={e => setAddForm({...addForm, startTime: e.target.value})}
                              />
                          </div>
                          <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">Ende</label>
                              <input 
                                  type="time" 
                                  className="w-full border rounded p-2"
                                  value={addForm.endTime}
                                  onChange={e => setAddForm({...addForm, endTime: e.target.value})}
                              />
                          </div>
                      </div>
                  </div>
                  <div className="bg-gray-50 border-t p-4 flex justify-end gap-3">
                      <button 
                          onClick={() => setIsAddModalOpen(false)}
                          className="px-4 py-2 text-gray-600 hover:bg-gray-200 rounded-lg"
                      >
                          Abbrechen
                      </button>
                      <button 
                          onClick={handleCreateMovement}
                          className="px-4 py-2 bg-green-600 text-white hover:bg-green-700 rounded-lg shadow-sm"
                      >
                          Speichern
                      </button>
                  </div>
              </div>
          </div>
      )}

    </div>
  );
};

export default ReportView;