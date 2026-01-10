import { AppConfig, Movement } from '../types';

export const parseTime = (timeStr: string): number => {
  if (!timeStr) return 0;
  const [h, m] = timeStr.split(':').map(Number);
  return (h * 60) + m;
};

export const formatTime = (minutes: number): string => {
  // Handle negative minutes or > 24h normalization if needed, 
  // currently strictly formatting for HH:MM display
  let m = Math.floor(minutes);
  if (m < 0) m += 24 * 60; // Normalize negative to previous day logic if strictly needed, usually just clamped
  
  const h = Math.floor(m / 60) % 24; // Ensure 24h wrap
  const min = Math.floor(m % 60);
  return `${h.toString().padStart(2, '0')}:${min.toString().padStart(2, '0')}`;
};

export const calculateMovement = (
  rawStart: string, 
  rawEnd: string, 
  config: AppConfig
): { startCorr: string; endCorr: string; duration: number; amount: number } => {
  
  let startMins = parseTime(rawStart);
  let endMins = parseTime(rawEnd);

  // Korrektur anwenden
  let startCorrMins = startMins + config.addStartMins;
  let endCorrMins = endMins - config.subEndMins;

  // Mitternachts-Logik: Wenn Ende kleiner als Start (z.B. 02:00 < 22:00), dann +24h
  // Wir prüfen dies anhand der korrigierten Werte ODER der Rohwerte. 
  // Normalerweise gilt: Wenn rawEnd < rawStart, war es eine Nachtschicht.
  if (endMins < startMins) {
    endMins += 24 * 60;
    endCorrMins += 24 * 60;
  } else if (endCorrMins < startCorrMins) {
    // Edge case: Shift was same day, but corrections pushed it over negative boundary?
    // Usually unlikely with standard corrections, but safe guard:
    // This assumes corrections shouldn't invert the shift direction unless it's extremely short.
  }

  // Dauer berechnen
  const durationMins = Math.max(0, endCorrMins - startCorrMins);
  const durationHours = parseFloat((durationMins / 60).toFixed(2));

  // Determine amount based on thresholds (descending sort)
  const sortedRules = [...config.rules].sort((a, b) => b.hoursThreshold - a.hoursThreshold);
  const rule = sortedRules.find(r => durationHours >= r.hoursThreshold);
  const amount = rule ? rule.amount : 0;

  return {
    startCorr: formatTime(startCorrMins),
    endCorr: formatTime(endCorrMins),
    duration: durationHours,
    amount
  };
};

export const recalculateAllMovements = (movements: Movement[], config: AppConfig): Movement[] => {
  return movements.map(m => {
    // Wenn manuell bearbeitet (isManual), fassen wir es beim generellen Recalculate NICHT an,
    // es sei denn, man möchte explizit alles überschreiben. 
    // Hier: Sicherheitshalber nur automatische Einträge neu berechnen oder User muss manuell triggern.
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