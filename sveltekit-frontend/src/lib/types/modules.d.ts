/**
 * Module declarations for packages without proper TypeScript types.
 *
 * fuse.js and lokijs ship their own types (fuse.d.ts and @types/lokijs).
 * Previous augmentations here caused declaration merging conflicts
 * (e.g., Collection<E, T> requiring 2 type args). Removed in Session 29.
 */

// Tauri API module declarations (optional dependencies)
declare module '@tauri-apps/api/tauri' {
 export function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T>;
 export const convertFileSrc: (filePath: string, protocol?: string) => string;
}
declare module '@tauri-apps/api/fs' {
 export interface FileEntry {
 path: string;
 name?: string;
 children?: FileEntry[];
 }
 export function readTextFile(filePath: string): Promise<string>;
 export function writeTextFile(filePath: string, data: string): Promise<void>;
 export function readDir(dir: string, options?: { recursive?: boolean }): Promise<FileEntry[]>;
 export function createDir(dir: string, options?: { recursive?: boolean }): Promise<void>;
 export function removeFile(file: string): Promise<void>;
 export function exists(path: string): Promise<boolean>;
}
declare module '@tauri-apps/api/core' {
 export function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T>;
}



