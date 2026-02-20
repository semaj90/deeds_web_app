import YoRHaAIChat from './YoRHaAIChat.svelte';
import YoRHaCommandCenter from './YoRHaCommandCenter.svelte';
import YoRHaDataGrid from './YoRHaDataGrid.svelte';
import YoRHaForm from './YoRHaForm.svelte';
// // ARCHIVED: import YoRHaModal from './YoRHaModal.svelte'; // Session 56: file missing
// // ARCHIVED: import YoRHaNavigation from './YoRHaNavigation.svelte'; // Session 56: file missing
import YoRHaTable from './YoRHaTable.svelte';

// Export main YoRHa components
export {
    YoRHaAIChat, YoRHaCommandCenter,
    YoRHaDataGrid, YoRHaForm,
    YoRHaTable
};

export interface TableColumn { key: string, title: string;
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
    DataGrid: YoRHaDataGrid,
    CommandCenter: YoRHaCommandCenter,
    Form: YoRHaForm,
    AIChat: YoRHaAIChat
};