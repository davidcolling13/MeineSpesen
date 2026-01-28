import { Employee, AppConfig, Movement, SystemLog, EmailConfig } from '../types';

// Default Data fallback
const DEFAULT_CONFIG: AppConfig = {
  addStartMins: 0,
  subEndMins: 0,
  rules: [{ hoursThreshold: 8, amount: 15 }]
};

const STORAGE_KEYS = {
  EMPLOYEES: 'ms_employees',
  CONFIG: 'ms_config',
  MOVEMENTS: 'ms_movements',
  EMAIL: 'ms_email_config'
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

// --- API Helpers ---

// Helper to check if response is valid JSON API response
const isValidApiResponse = (res: Response) => {
  const contentType = res.headers.get("content-type");
  return res.ok && contentType && contentType.includes("application/json");
};

// --- API Methods ---

export const getEmployees = async (): Promise<Employee[]> => {
  try {
    const res = await fetch('/api/employees');
    if (!isValidApiResponse(res)) throw new Error("API unavailable");
    
    const data = await res.json();
    // Cache for read-only offline viewing
    localSet(STORAGE_KEYS.EMPLOYEES, data);
    return data;
  } catch (e) {
    console.warn("API unavailable (getEmployees), viewing cached data.");
    return localGet(STORAGE_KEYS.EMPLOYEES, []);
  }
};

export const saveEmployee = async (emp: Employee) => {
  const res = await fetch('/api/employees', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(emp)
  });
  if (!isValidApiResponse(res)) throw new Error("Speichern fehlgeschlagen: Server nicht erreichbar");
  
  // Cache Update
  const current = localGet<Employee[]>(STORAGE_KEYS.EMPLOYEES, []);
  const idx = current.findIndex(e => e.id === emp.id);
  if (idx >= 0) current[idx] = emp;
  else current.push(emp);
  localSet(STORAGE_KEYS.EMPLOYEES, current);
};

export const deleteEmployee = async (id: string) => {
  const res = await fetch(`/api/employees/${id}`, { method: 'DELETE' });
  if (!isValidApiResponse(res)) throw new Error("Löschen fehlgeschlagen: Server nicht erreichbar");

  // Cache Update
  const current = localGet<Employee[]>(STORAGE_KEYS.EMPLOYEES, []);
  localSet(STORAGE_KEYS.EMPLOYEES, current.filter(e => e.id !== id));
};

export const getConfig = async (): Promise<AppConfig> => {
  try {
    const res = await fetch('/api/config');
    if (!isValidApiResponse(res)) throw new Error("API unavailable");
    
    const data = await res.json();
    localSet(STORAGE_KEYS.CONFIG, data);
    return data;
  } catch (e) {
    console.warn("API unavailable (getConfig), using cached fallback.");
    return localGet(STORAGE_KEYS.CONFIG, DEFAULT_CONFIG);
  }
};

export const saveConfig = async (cfg: AppConfig) => {
  const res = await fetch('/api/config', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(cfg)
  });
  if (!isValidApiResponse(res)) throw new Error("Speichern fehlgeschlagen: Server nicht erreichbar");
  localSet(STORAGE_KEYS.CONFIG, cfg);
};

// --- EMAIL CONFIG METHODS ---

export const getEmailConfig = async (): Promise<EmailConfig | null> => {
  try {
    const res = await fetch('/api/email-report/settings');
    if (!res.ok) throw new Error("API error");
    return await res.json();
  } catch (e) {
    return null; 
  }
};

export const saveEmailConfig = async (cfg: EmailConfig) => {
  const res = await fetch('/api/email-report/settings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(cfg)
  });
  if (!res.ok) throw new Error("Speichern fehlgeschlagen: Server nicht erreichbar");
  return true;
};

export const sendTestEmail = async (cfg: EmailConfig) => {
  const res = await fetch('/api/email-report/test', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(cfg)
  });
  return await res.json();
};

export const downloadBackup = async () => {
  try {
    const res = await fetch('/api/config/backup');
    if (!res.ok) throw new Error("Backup download failed");
    
    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    
    const contentDisposition = res.headers.get('Content-Disposition');
    let fileName = `meinespesen_backup_${new Date().toISOString().slice(0,10)}.db`;
    if (contentDisposition) {
        const match = contentDisposition.match(/filename="?([^"]+)"?/);
        if (match && match[1]) fileName = match[1];
    }
    
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
    return true;
  } catch (e) {
    console.error("Backup Error:", e);
    alert("Fehler beim Herunterladen des Backups. Ist der Server erreichbar?");
    return false;
  }
};

export const getMovements = async (): Promise<Movement[]> => {
  try {
    const res = await fetch('/api/movements');
    if (!isValidApiResponse(res)) throw new Error("API unavailable");
    
    const data = await res.json();
    localSet(STORAGE_KEYS.MOVEMENTS, data);
    return data;
  } catch (e) {
    console.warn("API unavailable (getMovements), using cached fallback.");
    return localGet(STORAGE_KEYS.MOVEMENTS, []);
  }
};

export const saveMovements = async (movements: Movement[]) => {
  // CRITICAL: No fallback here to prevent split-brain.
  const res = await fetch('/api/movements/batch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(movements)
  });
  if (!isValidApiResponse(res)) throw new Error("Server Fehler beim Speichern.");
  
  // Cache Update only on success
  const current = localGet<Movement[]>(STORAGE_KEYS.MOVEMENTS, []);
  const map = new Map(current.map(m => [m.id, m]));
  movements.forEach(m => map.set(m.id, m));
  localSet(STORAGE_KEYS.MOVEMENTS, Array.from(map.values()));
};

export const updateMovement = async (m: Movement) => {
  const res = await fetch('/api/movements/update', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(m)
  });
  if (!isValidApiResponse(res)) throw new Error("Update fehlgeschlagen: Server nicht erreichbar");
  
  // Cache Update
  const current = localGet<Movement[]>(STORAGE_KEYS.MOVEMENTS, []);
  const idx = current.findIndex(cur => cur.id === m.id);
  if (idx >= 0) current[idx] = m;
  else current.push(m);
  localSet(STORAGE_KEYS.MOVEMENTS, current);
};

export const deleteMovement = async (id: string) => {
    const res = await fetch(`/api/movements/${id}`, { method: 'DELETE' });
    if (!res.ok && res.status !== 404) throw new Error("Löschen fehlgeschlagen: Server Fehler");
    
    // Cache Update
    const current = localGet<Movement[]>(STORAGE_KEYS.MOVEMENTS, []);
    const filtered = current.filter(m => m.id !== id);
    localSet(STORAGE_KEYS.MOVEMENTS, filtered);
};

export const cleanupOldData = async (beforeDate: string) => {
  try {
    const res = await fetch(`/api/movements/cleanup?beforeDate=${beforeDate}`, {
      method: 'DELETE'
    });
    if (!isValidApiResponse(res)) throw new Error("API unavailable");
    return await res.json();
  } catch (e) {
    return { success: false, error: 'Offline or API error' };
  }
};

export const checkApiHealth = async (): Promise<boolean> => {
  try {
    const res = await fetch('/api/health');
    return isValidApiResponse(res);
  } catch {
    return false;
  }
};

// --- LOGGING ---
export const getSystemLogs = async (limit = 200): Promise<SystemLog[]> => {
  try {
    const res = await fetch(`/api/logs?limit=${limit}`);
    if (!res.ok) return [];
    return await res.json();
  } catch {
    return [];
  }
};

export const clearSystemLogs = async () => {
  try {
    await fetch('/api/logs', { method: 'DELETE' });
    return true;
  } catch {
    return false;
  }
};

// --- SYSTEM ---
export const triggerSystemUpdate = async () => {
  const res = await fetch('/api/system/update', {
    method: 'POST'
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Update failed');
  return data;
};