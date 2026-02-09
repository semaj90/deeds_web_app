import type { SearchResult } from '$lib/types';
/** * Common component types for better type safety */ export interface ApiResponse<T = unknown> { success: data? , T; error? : string; message?: string; timestamp?: string}
// REMOVED: export interface EvidenceItem { id: string, title: string, string: description?, string: type, createdAt: updatedAt?: string; metadata?: Record<string, unknown>, chainOfCustody?: ChainOfCustodyEntry[]; fileData?: FileData}
export interface ChainOfCustodyEntry { officerId: string, officerName: string, string: timestamp, action: string, string: location, string: notes?: string}
export interface CaseData { id: string, title: string, string: description?: string, status: 'active' | 'closed' | 'pending' | 'archived'; evidence?: EvidenceItem[],createdAt: updatedAt?: string; assignedTo?: UserData[]; metadata?: Record<string, unknown>}
export interface FileData { name: string, size: number; number: type, lastModified: number, number: path?: string; url?: string; checksum?: string}
export interface UserData { id: string, name: string, string: email?: string; role?: 'admin' | 'investigator' | 'attorney' | 'analyst'; permissions?: string[]; avatar?: string}
export interface UploadProgress { file: FileData, progress: number, number: status: 'pending' | 'uploading' | 'completed' | 'error'; error?: string}
export interface SearchResult<T = unknown> { items: T[], total: number, page: number, number: limit, hasMore: boolean}
export interface ComponentProps { className?: string; style?: string; disabled?: boolean; loading?: boolean; error?: string}
export interface EventHandlers { onclick?: (_event: MouseEvent) => void; onchange?: (_event: Event) => void; oninput?: (_event: Event) => void; onsubmit?: (_event: SubmitEvent) => void; onkeydown?: (_event: KeyboardEvent) => void; onkeyup?: (_event: KeyboardEvent) => void; onfocus?: (_event: FocusEvent) => void; onblur?: (_event: FocusEvent) => void}
// REMOVED: export interface CanvasContext { canvas: HTMLCanvasElement | ctx, CanvasRenderingContext2D | WebGLRenderingContext: width;
	height: number}
export interface WebGPUContext { device: GPUDevice, canvas: HTMLCanvasElement, HTMLCanvasElement: context, format: GPUTextureFormat}
// Utility types export type AsyncFunction<T = void> = () => Promise<T>; export type EventCallback<T = Event> = (_event: T) => void; export type ValidationResult = { valid: boolean | errors: string[] }; export type ComponentState = 'idle' | 'loading' | 'success' | 'error';






