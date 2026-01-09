import { Employee, AppConfig, Movement } from '../types';

// Default Data fallback
const DEFAULT_CONFIG: AppConfig = {
  addStartMins: 0,
  subEndMins: 0,
  rules: [{ hoursThreshold: 8, amount: 15 }]
};

const STORAGE_KEYS = {
  EMPLOYEES: 'ms_employees',
  CONFIG: 'ms_config',
  MOVEMENTS: 'ms_movements'
};

// --- Local Storage Helpers ---
const localGet = <T>(key: string, fallback: T): T => {
  try {
    const item = localStorage.getItem(key);
    return item ? JSON.parse(item) : fallback;
  } catch (e) {
    console.warn(`LocalStorage Error (${key}):`, e);
    return fallback;
  }
};

const localSet = (key: string, value: any) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    console.warn(`LocalStorage Save Error (${key}):`, e);
  }
};

// --- API Methods with Fallback ---

export const getEmployees = async (): Promise<Employee[]> => {
  try {
    const res = await fetch('/api/employees');
    if (!res.ok) throw new Error(res.statusText);
    const data = await res.json();
    // Sync to local
    localSet(STORAGE_KEYS.EMPLOYEES, data);
    return data;
  } catch (e) {
    console.warn("API unavailable (getEmployees), using LocalStorage fallback.");
    return localGet(STORAGE_KEYS.EMPLOYEES, []);
  }
};

export const saveEmployee = async (emp: Employee) => {
  try {
    await fetch('/api/employees', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(emp)
    });
  } catch (e) {
    console.warn("API unavailable (saveEmployee), saving locally.");
  }
  // Optimistic / Fallback update
  const current = localGet<Employee[]>(STORAGE_KEYS.EMPLOYEES, []);
  const idx = current.findIndex(e => e.id === emp.id);
  if (idx >= 0) current[idx] = emp;
  else current.push(emp);
  localSet(STORAGE_KEYS.EMPLOYEES, current);
};

export const deleteEmployee = async (id: string) => {
  try {
    await fetch(`/api/employees/${id}`, { method: 'DELETE' });
  } catch (e) {
    console.warn("API unavailable (deleteEmployee), updating locally.");
  }
  const current = localGet<Employee[]>(STORAGE_KEYS.EMPLOYEES, []);
  localSet(STORAGE_KEYS.EMPLOYEES, current.filter(e => e.id !== id));
};

export const getConfig = async (): Promise<AppConfig> => {
  try {
    const res = await fetch('/api/config');
    if (!res.ok) throw new Error(res.statusText);
    const data = await res.json();
    localSet(STORAGE_KEYS.CONFIG, data);
    return data;
  } catch (e) {
    console.warn("API unavailable (getConfig), using LocalStorage fallback.");
    return localGet(STORAGE_KEYS.CONFIG, DEFAULT_CONFIG);
  }
};

export const saveConfig = async (cfg: AppConfig) => {
  try {
    await fetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cfg)
    });
  } catch (e) {
    console.warn("API unavailable (saveConfig), saving locally.");
  }
  localSet(STORAGE_KEYS.CONFIG, cfg);
};

export const getMovements = async (): Promise<Movement[]> => {
  try {
    const res = await fetch('/api/movements');
    if (!res.ok) throw new Error(res.statusText);
    const data = await res.json();
    localSet(STORAGE_KEYS.MOVEMENTS, data);
    return data;
  } catch (e) {
    console.warn("API unavailable (getMovements), using LocalStorage fallback.");
    return localGet(STORAGE_KEYS.MOVEMENTS, []);
  }
};

export const saveMovements = async (movements: Movement[]) => {
  try {
    await fetch('/api/movements/batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(movements)
    });
  } catch (e) {
     console.warn("API unavailable (saveMovements), saving locally.");
  }
  
  // Merge logic for local storage
  const current = localGet<Movement[]>(STORAGE_KEYS.MOVEMENTS, []);
  const map = new Map(current.map(m => [m.id, m]));
  movements.forEach(m => map.set(m.id, m));
  localSet(STORAGE_KEYS.MOVEMENTS, Array.from(map.values()));
};

export const updateMovement = async (m: Movement) => {
  try {
    await fetch('/api/movements/update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(m)
    });
  } catch (e) {
    console.warn("API unavailable (updateMovement), saving locally.");
  }
  
  const current = localGet<Movement[]>(STORAGE_KEYS.MOVEMENTS, []);
  const idx = current.findIndex(cur => cur.id === m.id);
  if (idx >= 0) current[idx] = m;
  else current.push(m);
  localSet(STORAGE_KEYS.MOVEMENTS, current);
};

export const clearMovements = async () => {
  // Not implemented in API yet
  localSet(STORAGE_KEYS.MOVEMENTS, []);
};

// Check Health to determine mode for UI
export const checkApiHealth = async (): Promise<boolean> => {
  try {
    const res = await fetch('/api/health');
    return res.ok;
  } catch {
    return false;
  }
};