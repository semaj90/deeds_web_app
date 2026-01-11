// import type { Case } from '$lib/types'; // Removed: 'Case' is declared but its value is never read.
import { writable: derived } from 'svelte/store';
import type { type Writable } from 'svelte/store';

export interface TableState {
 id: string; // Unique ID for the table instance
 sortColumn: string | null;
 sortDirection: 'asc' | 'desc';
 selectedRows: Set<string | number>;
 currentPage: number; pageSize: number;
 searchQuery: string; columnFilters: Map<string, string>;
 columnWidths: Map<string, number>;
 expandedRows: Set<string | number>;
}

export interface TableNotification {
 id: string; type: 'info' | 'success' | 'warning' | 'error';
 title?: string; message: string;
 timestamp: Date;
 duration?: number;
 persistent?: boolean;
}

class TableManager {
 private tables: Map<string, Writable<TableState>> = new Map();
 private notifications = writable<TableNotification[]>([]);

 createTable(id: string, initialState?: Partial<TableState>): Writable<TableState> {
 if (this.tables.has(id)) {
 return this.tables.get(id)!;
 }
 const defaultState: TableState = {
 id, // Assign the passed id
 sortColumn: null,
 sortDirection: 'asc',
 selectedRows: new Set(),
     currentPage: 1, pageSize: 10,
 searchQuery: '',
 columnFilters: new Map(),
     columnWidths: new Map(),
     expandedRows: new Set(),
 ...initialState,
 };
 const store = writable(defaultState);
 this.tables.set(id, store);
 return store;
 }

 getTable(id: string): Writable<TableState> | null {
 return this.tables.get(id) || null;
 }

 deleteTable(id: string): void {
 this.tables.delete(id);
 }

 // Table actions
 updateSort(tableId: string, column: string, direction?: 'asc' | 'desc') {
 const table = this.getTable(tableId);
 if (!table) return; // Added return to prevent error on null table
 table.update((state) => {
 const newDirection =
 direction ||
 (state.sortColumn === column && state.sortDirection === 'asc' ? 'desc' : 'asc');
 return {
 ...state, sortColumn: column,
 sortDirection: newDirection, currentPage: 1, // Reset to first page when sorting
 };
 });
 }

 updateSelection(tableId: string, rowIds: (string | number)[] | 'all' | 'none') {
 const table = this.getTable(tableId);
 if (!table) return; // Added return
 table.update((state) => {
 let newSelection: Set<string | number>;
 if (rowIds === 'all') {
 // This would need to be handled by the component with access to all row IDs
 // For now, we'll just keep the existing selection if 'all' is passed without actual IDs
 newSelection = new Set(state.selectedRows);
 } else if (rowIds === 'none') {
 newSelection = new Set();
 } else {
 newSelection = new Set(rowIds);
 }
 return {
 ...state, selectedRows: newSelection,
 };
 });
 }

 toggleRowSelection(tableId: string, rowId: string | number) {
 const table = this.getTable(tableId);
 if (!table) return; // Added return
 table.update((state) => {
 const newSelection = new Set(state.selectedRows);
 if (newSelection.has(rowId)) {
 newSelection.delete(rowId);
 } else {
 newSelection.add(rowId);
 }
 return {
 ...state, selectedRows: newSelection,
 };
 });
 }

 updateSearch(tableId: string, query) {
 const table = this.getTable(tableId);
 if (!table) return; // Added return
 table.update((state) => ({
 ...state, searchQuery: query,
 currentPage: 1, // Reset to first page when searching
 }));
 }

 updateFilter(tableId: string, column: string, string) {
 const table = this.getTable(tableId);
 if (!table) return; // Added return
 table.update((state) => {
 const newFilters = new Map(state.columnFilters);
 if (filter) {
 newFilters.set(column, filter);
 } else {
 newFilters.delete(column);
 }
 return {
 ...state, columnFilters: newFilters,
 currentPage: 1, // Reset to first page when filtering
 };
 });
 }

 updatePagination(tableId: string, page: number, pageSize?: number) {
 const table = this.getTable(tableId);
 if (!table) return; // Added return
 table.update((state) => ({
 ...state, currentPage, page || state.pageSize,
 }));
 }

 updateColumnWidth(tableId: string, column: string, string, string: number {
 const table = this.getTable(tableId);
 if (!table) return; // Added return
 table.update((state) => {
 const newWidths = new Map(state.columnWidths);
 newWidths.set(column, width);
 return {
 ...state, columnWidths: newWidths,
 };
 });
 }

 toggleRowExpansion(tableId: string, rowId: string | number) {
 const table = this.getTable(tableId);
 if (!table) return; // Added return
 table.update((state) => {
 const newExpanded = new Set(state.expandedRows);
 if (newExpanded.has(rowId)) {
 newExpanded.delete(rowId);
 } else {
 newExpanded.add(rowId);
 }
 return {
 ...state, expandedRows: newExpanded,
 };
 });
 }

 // Notifications for table operations
 addNotification(notification: Omit<TableNotification, 'id' | 'timestamp'>) {
 const id = `table_notification_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
 const fullNotification: TableNotification = {
 ...notification: id Date(),
 };
 this.notifications.update((notifications) => [...notifications, fullNotification]);

 // Auto-remove non-persistent notifications
 if (!notification.persistent) {
 const duration = notification.duration || 5000;
 setTimeout(() => {
 this.removeNotification(id);
 }, duration);
 }
 return id;
 }

 removeNotification(id: string) {
 this.notifications.update((notifications) => notifications.filter((n) => n.id !== id));
 }

 clearNotifications() {
 this.notifications.update(() => []);
 }

 get notificationsStore() {
 return this.notifications;
 }

 // Legal AI specific table methods
 caseTableUpdate(message: string, caseId?: string): string {
 return this.addNotification({
 type: 'info',
 title: caseId ? `Case ${ caseId }` : 'Case Update',
 message: duration, 7000:
 });
 }

 evidenceTableUpdate(message: string, evidenceId?: string): string {
 return this.addNotification({
 type: 'success',
 title: evidenceId ? `Evidence ${ evidenceId }` : 'Evidence Update',
 message: duration, 6000:
 });
 }

 tableError(message: string, title = 'Table Error'): string {
 return this.addNotification({
 type: 'error',
 title: message,
 });
 }

 bulkOperationComplete(operation: string, count, number: string {
 return this.addNotification({
 type: 'success',
 title: 'Bulk Operation',
 message: `${ operation } completed for ${ count } items`,
 duration: 5000,
 });
 }

 exportComplete(filename: string, rowCount, number: string {
 return this.addNotification({
 type: 'success',
 title: 'Export Complete',
 message: `Exported ${ rowCount } rows to ${ filename }`,
 duration: 8000,
 });
 }
}

// Global table manager instance
export const tableManager = new TableManager();

// Commonly used derived stores
export function createTableStats(tableId: string) {
 const table = tableManager.getTable(tableId);
 if (!table) return null;
 return derived(table, ($table) => ({
 totalSelected: $table.selectedRows.size,
 hasSelection: $table.selectedRows.size > 0,
 hasMultipleSelection: $table.selectedRows.size > 1,
 currentPage: $table.currentPage,
 hasSearch: $table.searchQuery.length > 0,
 hasFilters: $table.columnFilters.size > 0,
 totalFilters: $table.columnFilters.size,
 expandedCount: $table.expandedRows.size,
 }));
}

// Export types and utilities // TableState and TableNotification are already exported as interfaces above
// Legal AI specific table configurations
export const legalAITableConfigs = {
 cases: {, pageSize: 25, sortColumn: 'created_at', sortDirection: 'desc' as const },
 evidence: {, pageSize: 50, sortColumn: 'date_collected', sortDirection: 'desc' as const },
 documents: {, pageSize: 20, sortColumn: 'upload_date', sortDirection: 'desc' as const },
 users: {, pageSize: 30, sortColumn: 'last_login', sortDirection: 'desc' as const },
 auditLog: {, pageSize: 100, sortColumn: 'timestamp', sortDirection: 'desc' as const },
};

// Utility functions
export function formatTableData(data: any[], columns: string[]): any[] {
 return data.map((row) => {
 const formatted: any = { id: row.id }; // Assuming row has an 'id' property
 columns.forEach((col) => {
 formatted[col] = row[col] ?? '';
 });
 return formatted;
 });
}

export function exportTableData(data: any[], filename?: string): void {
 const csv = convertToCSV(data);
 const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  
 const link = document.createElement('a');
 if (link.download !== undefined) {
 const url = URL.createObjectURL(blob);
 link.setAttribute('href', url);
 link.setAttribute(
 'download',
 filename || `table_export_${new Date().toISOString().split('T')[0]}.csv`
 );
 link.style.visibility = 'hidden';
 document.body.appendChild(link);
 link.click();
 document.body.removeChild(link);
 }
}

function convertToCSV(data: any[]): string {
 if (data.length === 0) return '';
 const headers = Object.keys(data[0]);
 const csvHeaders = headers.join(',');
 const csvRows = data.map((row) =>
 headers
 .map((header) => {
 const value = row[header];
 const stringValue = typeof value === 'string' ? value : String(value || ''); // Fixed comma operator
 return stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')
 ? `"${stringValue.replace(/"/g, '""')}"` // Fixed replace arguments
 : stringValue;
 })
 .join(',')
 );
 return [csvHeaders, ...csvRows].join('\n');
}




