import { useState, useEffect, useMemo, useCallback } from 'react';
import { getEmployees, getMovements, getConfig, saveMovements, updateMovement, deleteMovement } from '../services/storage';
import { calculateMovement } from '../services/calculation';
import { Employee, Movement, AppConfig, ReportData } from '../types';

export const useReportLogic = () => {
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedEmpId, setSelectedEmpId] = useState<string>('');

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [allMovements, setAllMovements] = useState<Movement[]>([]);
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshData = useCallback(async () => {
    setLoading(true);
    try {
      const [e, m, c] = await Promise.all([getEmployees(), getMovements(), getConfig()]);
      setEmployees(e);
      setAllMovements(m);
      setConfig(c);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshData();
  }, [refreshData]);

  // --- Derived State ---

  const movementsForMonth = useMemo(() => {
    return allMovements.filter(m => {
       const [y, month] = m.date.split('-').map(Number);
       return (month - 1) === selectedMonth && y === selectedYear;
    });
  }, [allMovements, selectedMonth, selectedYear]);

  const currentReportData: ReportData | null = useMemo(() => {
    if (!selectedEmpId) return null;
    const emp = employees.find(e => e.id === selectedEmpId);
    if (!emp) return null;

    const movs = movementsForMonth.filter(m => m.employeeId === selectedEmpId)
           .sort((a, b) => a.date.localeCompare(b.date));
    
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

  // --- Actions ---

  const generateId = () => {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
    return Math.random().toString(36).substring(2, 15);
  };

  const addEntry = async (date: string, location: string, startTime: string, endTime: string) => {
      if (!config || !selectedEmpId) return;

      const tempConfig: AppConfig = { ...config, addStartMins: 0, subEndMins: 0 };
      const calculated = calculateMovement(startTime, endTime, tempConfig);

      const newMovement: Movement = {
          id: generateId(),
          employeeId: selectedEmpId,
          date,
          location,
          startTimeRaw: startTime,
          endTimeRaw: endTime,
          startTimeCorr: calculated.startCorr,
          endTimeCorr: calculated.endCorr,
          durationNetto: calculated.duration,
          amount: calculated.amount,
          isManual: true
      };

      await saveMovements([newMovement]);
      setAllMovements(prev => [...prev, newMovement]);
  };

  const updateEntry = async (id: string, updates: Partial<Movement>) => {
    if (!config) return;
    const original = allMovements.find(m => m.id === id);
    if (!original) return;

    // Recalculate if times changed, otherwise just update fields
    // Note: This logic assumes the updates object contains the *new* values for corrected times if manually edited
    const startCorr = updates.startTimeCorr !== undefined ? updates.startTimeCorr : original.startTimeCorr;
    const endCorr = updates.endTimeCorr !== undefined ? updates.endTimeCorr : original.endTimeCorr;
    
    // We use temp config 0 corrections because manual edits usually input the final desired time
    const tempConfig: AppConfig = { ...config, addStartMins: 0, subEndMins: 0 };
    const calculated = calculateMovement(startCorr, endCorr, tempConfig);

    const updatedMovement: Movement = {
      ...original,
      ...updates,
      startTimeCorr: startCorr,
      endTimeCorr: endCorr,
      durationNetto: calculated.duration,
      // Use provided amount if manually set, otherwise recalculate
      amount: updates.amount !== undefined ? updates.amount : calculated.amount,
      isManual: true
    };

    await updateMovement(updatedMovement);
    setAllMovements(prev => prev.map(m => m.id === id ? updatedMovement : m));
  };

  const removeEntry = async (id: string) => {
      await deleteMovement(id);
      setAllMovements(prev => prev.filter(m => m.id !== id));
  };

  const bulkDelete = async (ids: Set<string>) => {
    for (const id of ids) {
      await deleteMovement(id);
    }
    setAllMovements(prev => prev.filter(m => !ids.has(m.id)));
  };

  const bulkUpdateLocation = async (ids: Set<string>, location: string) => {
    const updates: Movement[] = [];
    allMovements.forEach(m => {
      if (ids.has(m.id)) {
        updates.push({ ...m, location: location, isManual: true });
      }
    });

    await saveMovements(updates);
    setAllMovements(prev => prev.map(m => {
      if (ids.has(m.id)) {
        return { ...m, location: location, isManual: true };
      }
      return m;
    }));
  };

  // Generate data for all employees in current month (for bulk PDF/ZIP)
  const getAllReportsData = (): ReportData[] => {
      const activeEmployeeIds = new Set(movementsForMonth.map(m => m.employeeId));
      const reports: ReportData[] = [];

      activeEmployeeIds.forEach(empId => {
          const emp = employees.find(e => e.id === empId);
          if (!emp) return;

          const movs = movementsForMonth.filter(m => m.employeeId === empId)
                        .sort((a, b) => a.date.localeCompare(b.date));
          
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

  return {
    // State
    selectedMonth, setSelectedMonth,
    selectedYear, setSelectedYear,
    selectedEmpId, setSelectedEmpId,
    employees,
    config,
    loading,
    
    // Derived
    movementsForMonth,
    currentReportData,
    monthName,

    // Actions
    refreshData,
    addEntry,
    updateEntry,
    removeEntry,
    bulkDelete,
    bulkUpdateLocation,
    getAllReportsData
  };
};