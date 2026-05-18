export interface Family {
  id: number;
  identifier: string;
  name: string;
}

export interface Member {
  id: number;
  family_id: number;
  name: string;
  color: string;
}

export interface CalendarEvent {
  id: number;
  family_id: number;
  member_id: number | null;
  title: string;
  date: string;
  description: string;
  member_name?: string;
  member_color?: string;
}

export interface Task {
  id: number;
  family_id: number;
  title: string;
  done: number;
  created_at: string;
}

export interface Expense {
  id: number;
  family_id: number;
  member_id: number | null;
  amount: number;
  date: string;
  category: string;
  description: string;
  member_name?: string;
  member_color?: string;
}

export type ExpenseCategory = 'Loisirs' | 'Vêtements' | 'Abonnements' | 'Électricité' | 'Essence' | 'Autres';

export const EXPENSE_CATEGORIES: ExpenseCategory[] = [
  'Loisirs', 'Vêtements', 'Abonnements', 'Électricité', 'Essence', 'Autres',
];

export const MONTHS_FR = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre',
];

export const CATEGORY_COLORS: Record<string, string> = {
  Loisirs: '#F97316',
  Vêtements: '#EC4899',
  Abonnements: '#8B5CF6',
  Électricité: '#EAB308',
  Essence: '#EF4444',
  Autres: '#6B7280',
};

export interface Receipt {
  id: number;
  filename: string;
  mimetype: string;
  amount: number | null;
  date: string;
  category: string;
  description: string;
  member_id: number | null;
  created_at: string;
}

export const PRESET_COLORS = [
  '#EF4444', '#F97316', '#EAB308', '#22C55E', '#06B6D4',
  '#3B82F6', '#8B5CF6', '#EC4899', '#14B8A6', '#F59E0B',
  '#10B981', '#6366F1', '#84CC16', '#E11D48', '#0EA5E9',
];
