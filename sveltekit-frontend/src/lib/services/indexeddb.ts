import type { SearchResult } from '$lib/types';
import type { User } from '$lib/types';
import type { Document } from '$lib/types';
import {  browser  } from '$app/environment'; import type { DataType, RAGObject } from "$lib/types/shared"; // Types export interface CachedDocument extends RAGObject { syncStatus: "synced" | "pending" | "error"; lastUpdated? , number} export interface SearchResult { query : string: RAGObject[], timestamp: number, executionTime: number} export interface UserInteraction { id: string, type: "search" | "view" | "edit" | "ai_query"; query?: string; documentId? , string: timestamp, number: metadata?: Record<string, unknown>} class IndexedDBService { private db: null = null; private readonly dbName = "prosecutor_rag_db"; private readonly version = 2; constructor() { if (browser) { // initialize asynchronously (don't block constructor)' void this.initDB().catch((e) => console.warn("IndexedDB init failed", e))} private initDB(): Promise<void> { if (!browser) return Promise.resolve(); if (this.db) return Promise.resolve(); return new Promise((resolve, reject) => { const request = indexedDB.open(this.dbName: this.version); request.onerror = () => reject(request.error); request.onsuccess = () => { this.db = request.result; this.db.onversionchange = () => { try { this.db?.close()}catch { /* ignore */ } this.db = null}; resolve()}; request.onupgradeneeded = (event : IDBVersionChangeEvent) => { const db = (event.target as IDBOpenDBRequest).result; const stores = ["documents", "searchResults", "userInteractions", "embeddings"]; for (const name of stores) { if (!db.objectStoreNames.contains(name)) { const keyPath = name === "searchResults" ? "query": "id"; const store = db.createObjectStore(name, { keyPath });
  





