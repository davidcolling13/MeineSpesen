import { useState, useEffect, useMemo, useCallback } from 'react';
import { getEmployees, getMovements, getConfig, saveMovements, updateMovement, deleteMovement, bulkDeleteMovements } from '../services/storage';
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
      setEmployees(e || []);
      setAllMovements(m || []);
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
    if (!Array.isArray(allMovements)) return [];
    return allMovements.filter(m => {
       if (!m || !m.date) return false;
       let y: number;
       let month: number;
       if (m.date.includes('-')) {
         const parts = m.date.split('-');
         y = parseInt(parts[0], 10);
         month = parseInt(parts[1], 10);
       } else if (m.date.includes('.')) {
         const parts = m.date.split('.');
         y = parseInt(parts[2], 10);
         month = parseInt(parts[1], 10);
       } else {
         return false;
       }
       if (isNaN(y) || isNaN(month)) return false;
       return (month - 1) === selectedMonth && y === selectedYear;
    });
  }, [allMovements, selectedMonth, selectedYear]);

  const currentReportData: ReportData | null = useMemo(() => {
    if (!selectedEmpId) return null;
    const emp = employees.find(e => e.id === selectedEmpId);
    if (!emp) return null;

    const movs = movementsForMonth
      .filter(m => m.employeeId === selectedEmpId)
      .sort((a, b) => (a.date || '').localeCompare(b.date || ''));
    
    const totals = movs.reduce((acc, curr) => ({
      hours: acc.hours + (Number(curr.durationNetto) || 0),
      amount: acc.amount + (Number(curr.amount) || 0)
    }), { hours: 0, amount: 0 });

    const monthName = new Date(selectedYear, selectedMonth).toLocaleString('de-DE', { month: 'long' });

    return {
      employee: emp,
      movements: movs,
      monthName,
      year: selectedYear,
      totals: {
        hours: parseFloat(totals.hours.toFixed(2)),
        amount: parseFloat(totals.amount.toFixed(2))
      }
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
      location: location || '',
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

    const startCorr = updates.startTimeCorr !== undefined ? updates.startTimeCorr : original.startTimeCorr;
    const endCorr = updates.endTimeCorr !== undefined ? updates.endTimeCorr : original.endTimeCorr;
    
    const tempConfig: AppConfig = { ...config, addStartMins: 0, subEndMins: 0 };
    const calculated = calculateMovement(startCorr, endCorr, tempConfig);

    let newAmount = calculated.amount;
    
    if (updates.amount !== undefined) {
      const amountShouldChange = calculated.amount !== original.amount;
      if (updates.amount === original.amount && amountShouldChange) {
        newAmount = calculated.amount;
      } else {
        newAmount = updates.amount;
      }
    }

    const updatedMovement: Movement = {
      ...original,
      ...updates,
      startTimeCorr: startCorr,
      endTimeCorr: endCorr,
      durationNetto: calculated.duration,
      amount: newAmount,
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
    const idList = Array.from(ids);
    if (idList.length === 0) return;
    await bulkDeleteMovements(idList);
    setAllMovements(prev => prev.filter(m => !ids.has(m.id)));
  };

  const bulkUpdateLocation = async (ids: Set<string>, location: string) => {
    const updates: Movement[] = [];
    allMovements.forEach(m => {
      if (ids.has(m.id)) {
        updates.push({ ...m, location: location, isManual: true });
      }
    });

    if (updates.length > 0) {
      await saveMovements(updates);
      setAllMovements(prev => prev.map(m => {
        if (ids.has(m.id)) {
          return { ...m, location: location, isManual: true };
        }
        return m;
      }));
    }
  };

  // Generate data for all employees in current month (for bulk PDF/ZIP)
  const getAllReportsData = (): ReportData[] => {
    const activeEmployeeIds = new Set(movementsForMonth.map(m => m.employeeId));
    const reports: ReportData[] = [];

    activeEmployeeIds.forEach(empId => {
      const emp = employees.find(e => e.id === empId);
      if (!emp) return;

      const movs = movementsForMonth
        .filter(m => m.employeeId === empId)
        .sort((a, b) => (a.date || '').localeCompare(b.date || ''));
      
      const t = movs.reduce((acc, curr) => ({
        hours: acc.hours + (Number(curr.durationNetto) || 0),
        amount: acc.amount + (Number(curr.amount) || 0)
      }), { hours: 0, amount: 0 });

      reports.push({
        employee: emp,
        movements: movs,
        monthName,
        year: selectedYear,
        totals: {
          hours: parseFloat(t.hours.toFixed(2)),
          amount: parseFloat(t.amount.toFixed(2))
        }
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
