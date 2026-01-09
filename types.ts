export interface Employee {
  id: string; // Personalnummer
  firstName: string;
  lastName: string;
  email: string;
}

export interface ExpenseRule {
  hoursThreshold: number;
  amount: number;
}

export interface AppConfig {
  addStartMins: number;
  subEndMins: number;
  rules: ExpenseRule[];
}

export interface Movement {
  id: string;
  employeeId: string;
  date: string; // ISO YYYY-MM-DD
  location: string;
  startTimeRaw: string; // HH:MM
  endTimeRaw: string; // HH:MM
  startTimeCorr: string; // HH:MM
  endTimeCorr: string; // HH:MM
  durationNetto: number; // Hours
  amount: number; // EUR
  isManual: boolean;
}

export interface DateFilter {
  month: number;
  year: number;
}
