import { useState, useEffect, useCallback } from 'react';
import { Employee } from '../types';
import { getEmployees, saveEmployee, deleteEmployee } from '../services/storage';

export const useEmployees = () => {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getEmployees();
      setEmployees(data);
      setError(null);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const addOrUpdate = async (emp: Employee) => {
    try {
      await saveEmployee(emp);
      await refresh();
      return true;
    } catch (e) {
      console.error(e);
      return false;
    }
  };

  const remove = async (id: string) => {
    try {
      await deleteEmployee(id);
      await refresh();
      return true;
    } catch (e) {
      console.error(e);
      return false;
    }
  };

  return {
    employees,
    loading,
    error,
    refresh,
    addOrUpdate,
    remove
  };
};