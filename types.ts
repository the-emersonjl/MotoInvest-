
export enum Role {
  USER = 'user',
  MODEL = 'model'
}

export interface User {
  email: string;
  name: string;
}

export interface Message {
  role: Role;
  text: string;
  timestamp: string;
}

export interface Bill {
  id: string;
  name: string;
  amount: number;
  dueDate: string;
  isPaid: boolean;
}

export interface Expense {
  id: string;
  value: number;
  date: string;
  description?: string;
}

export interface Profile {
  age: string;
  gender: string;
  experience: string;
  tool: string;
  days_week: string;
  hours_day: string;
  platforms: string[];
  accident: boolean;
  challenge: string;
}

export interface FinancialData {
  dailyIncome: number[];
  fixedCosts: number;
  debts: Debt[];
  goal: string;
}

export interface Debt {
  name: string;
  amount: number;
  interestRate: number;
}
