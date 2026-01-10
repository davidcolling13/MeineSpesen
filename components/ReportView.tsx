import React, { useState, useMemo, useEffect } from 'react';
import { getMovements, getEmployees } from '../services/storage';
import { Movement, Employee } from '../types';
import { Download, Mail, FileText, Loader2 } from 'lucide-react';
import { PDFViewer, PDFDownloadLink, pdf } from '@react-pdf/renderer';
import ReportPdfLayout from './ReportPdfLayout';

const ReportView: React.FC = () => {
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedEmpId, setSelectedEmpId] = useState<string>('');
  
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [allMovements, setAllMovements] = useState<Movement[]>([]);
  const [isSending, setIsSending] = useState(false);

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

  const monthName = new Date(selectedYear, selectedMonth).toLocaleString('de-DE', { month: 'long' });
  const fileName = `Spesen_${selectedYear}-${(selectedMonth+1).toString().padStart(2,'0')}_${selectedEmployee?.lastName || 'Report'}.pdf`;

  const handleEmail = async () => {
    if (!selectedEmployee || !reportData) return;
    if (!selectedEmployee.email) {
      alert("Keine Email-Adresse für diesen Mitarbeiter hinterlegt.");
      return;
    }
    
    setIsSending(true);
    try {
      // 1. Generate Blob
      const doc = (
        <ReportPdfLayout 
            movements={reportData} 
            employee={selectedEmployee} 
            monthName={monthName}
            year={selectedYear}
            totals={totals}
        />
      );
      const blob = await pdf(doc).toBlob();
      
      // 2. Convert to Base64 to send via JSON (Simpler for this setup than FormData)
      const reader = new FileReader();
      reader.readAsDataURL(blob);
      reader.onloadend = async () => {
          const base64data = reader.result;
          
          // 3. Send to Backend
          const res = await fetch('/api/email-report', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                email: selectedEmployee.email,
                fileName: fileName,
                fileData: base64data
            })
          });

          if (res.ok) {
            alert(`PDF wurde erfolgreich an ${selectedEmployee.email} gesendet.`);
          } else {
            alert("Fehler beim Senden der Email.");
          }
          setIsSending(false);
      };
    } catch (e) {
      console.error(e);
      alert("Fehler bei der PDF Generierung.");
      setIsSending(false);
    }
  };

  return (
    <div className="space-y-6 h-full flex flex-col">
      <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200 flex flex-wrap gap-4 items-end flex-shrink-0">
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
      </div>

      <div className="flex-1 min-h-0 bg-gray-100 rounded-lg border border-gray-300 overflow-hidden relative flex flex-col">
        {selectedEmployee && reportData ? (
            <>
                <div className="bg-white border-b p-2 flex justify-between items-center shadow-sm z-10">
                    <div className="text-sm font-semibold text-gray-700 px-2">
                        Vorschau: {fileName}
                    </div>
                    <div className="flex gap-2">
                         <PDFDownloadLink 
                            document={
                                <ReportPdfLayout 
                                    movements={reportData} 
                                    employee={selectedEmployee} 
                                    monthName={monthName}
                                    year={selectedYear}
                                    totals={totals}
                                />
                            } 
                            fileName={fileName}
                            className="flex items-center gap-2 bg-gray-800 text-white px-4 py-2 rounded hover:bg-gray-900 text-sm transition-colors"
                         >
                            {({ loading }) => (loading ? 'Lade...' : <><Download size={16} /> PDF Download</>)}
                         </PDFDownloadLink>

                         <button 
                            onClick={handleEmail}
                            disabled={isSending}
                            className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 text-sm disabled:opacity-50 transition-colors"
                         >
                            {isSending ? <Loader2 size={16} className="animate-spin"/> : <Mail size={16} />}
                            {isSending ? 'Sende...' : 'Per Email senden'}
                         </button>
                    </div>
                </div>
                <div className="flex-1 w-full h-full bg-gray-500">
                    <PDFViewer width="100%" height="100%" showToolbar={false} className="w-full h-full border-none">
                        <ReportPdfLayout 
                            movements={reportData} 
                            employee={selectedEmployee} 
                            monthName={monthName}
                            year={selectedYear}
                            totals={totals}
                        />
                    </PDFViewer>
                </div>
            </>
        ) : (
             <div className="flex flex-col items-center justify-center h-full text-gray-400">
                <FileText size={64} className="mb-4 opacity-20" />
                <p>Bitte Mitarbeiter und Zeitraum wählen</p>
             </div>
        )}
      </div>
    </div>
  );
};

export default ReportView;