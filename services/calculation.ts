import { AppConfig, Movement } from '../types';

export const parseTime = (timeStr?: string | null): number => {
  if (!timeStr || typeof timeStr !== 'string') return 0;
  const cleanStr = timeStr.trim().replace(/^["']|["']$/g, '');
  const parts = cleanStr.split(':');
  if (parts.length < 2) return 0;
  const h = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  if (isNaN(h) || isNaN(m)) return 0;
  return (h * 60) + m;
};

export const formatTime = (minutes: number): string => {
  if (isNaN(minutes) || !isFinite(minutes)) return "00:00";
  let m = Math.floor(minutes);
  const minutesInDay = 24 * 60;
  
  // Normalized Minutes (0 to 1439)
  let normalized = ((m % minutesInDay) + minutesInDay) % minutesInDay;
  
  const h = Math.floor(normalized / 60);
  const min = normalized % 60;
  return `${h.toString().padStart(2, '0')}:${min.toString().padStart(2, '0')}`;
};

export const calculateMovement = (
  rawStart: string, 
  rawEnd: string, 
  config: AppConfig
): { startCorr: string; endCorr: string; duration: number; amount: number } => {
  if (!rawStart && !rawEnd) {
    return { startCorr: '', endCorr: '', duration: 0, amount: 0 };
  }

  const addStart = Number(config?.addStartMins) || 0;
  const subEnd = Number(config?.subEndMins) || 0;

  let startMins = parseTime(rawStart);
  let endMins = parseTime(rawEnd);

  // Korrektur anwenden
  let startCorrMins = startMins + addStart;
  let endCorrMins = endMins - subEnd;

  // Mitternachts-Logik: Wenn Ende kleiner als Start (z.B. 02:00 < 22:00), dann +24h
  if (endMins < startMins) {
    endMins += 24 * 60;
    endCorrMins += 24 * 60;
  }

  // Dauer berechnen (nie negativ)
  const durationMins = Math.max(0, endCorrMins - startCorrMins);
  const durationHours = parseFloat((durationMins / 60).toFixed(2));

  // Determine amount based on thresholds (descending sort)
  const rules = Array.isArray(config?.rules) ? config.rules : [];
  const sortedRules = [...rules].sort((a, b) => (Number(b.hoursThreshold) || 0) - (Number(a.hoursThreshold) || 0));
  const rule = sortedRules.find(r => durationHours >= (Number(r.hoursThreshold) || 0));
  const amount = rule ? (Number(rule.amount) || 0) : 0;

  return {
    startCorr: formatTime(startCorrMins),
    endCorr: formatTime(endCorrMins),
    duration: isNaN(durationHours) ? 0 : durationHours,
    amount
  };
};

export const recalculateAllMovements = (movements: Movement[], config: AppConfig): Movement[] => {
  if (!Array.isArray(movements)) return [];
  return movements.map(m => {
    // Wenn manuell bearbeitet (isManual), nicht automatisch überschreiben
    if (m.isManual) return m;

    const calculated = calculateMovement(m.startTimeRaw, m.endTimeRaw, config);
    
    return {
      ...m,
      startTimeCorr: calculated.startCorr,
      endTimeCorr: calculated.endCorr,
      durationNetto: calculated.duration,
      amount: calculated.amount
    };
  });
};
