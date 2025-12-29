
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
