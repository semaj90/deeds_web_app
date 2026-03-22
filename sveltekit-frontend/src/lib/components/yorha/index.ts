import YoRHaAIChat from './YoRHaAIChat.svelte';
import YoRHaCommandCenter from './YoRHaCommandCenter.svelte';
import YoRHaForm from './YoRHaForm.svelte';
import YoRHaTable from './YoRHaTable.svelte';

// Export main YoRHa components
export { YoRHaAIChat, YoRHaCommandCenter, YoRHaForm, YoRHaTable };

export interface TableColumn {
  key: string;
  title: string;
  sortable?: boolean;
  width?: string;
  align?: 'left' | 'center' | 'right';
  type?: 'text' | 'number' | 'date' | 'status' | 'action';
}

export interface TableRow {
  id: string | number;
  [key: string]: any;
}

// Re-export specific case components
export { default as CaseFilters } from './cases/CaseFilters.svelte';
export { default as CasesList } from './cases/CasesList.svelte';
export { default as CaseStats } from './cases/CaseStats.svelte';

export const YoRHa = {
  Table: YoRHaTable,
  CommandCenter: YoRHaCommandCenter,
  Form: YoRHaForm,
  AIChat: YoRHaAIChat,
};