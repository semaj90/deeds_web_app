/**
 * Upload state store using Svelte 5 $state
 */

import { writable, derived } from 'svelte/store';
import type { UploadState, ProcessingEvent } from '../services/types.js';

// Initial state
const initialState: UploadState = {
 evidenceId: null,
 jobId: null,
 filename: null,
 fileSize: null,
 uploadProgress: 0,
 processingStage: null,
 processingPercentage: 0,
 eta: null,
 status: 'idle',
 error: null,
 metrics: {
 cpu: 0,
 memory: 0,
 gpu: 0,
 },
};

// Create writable store
export const uploadStore = writable<UploadState>(initialState);

// Derived stores
export const isUploading = derived(uploadStore, ($state) => $state.status === 'uploading');
export const isProcessing = derived(uploadStore, ($state) => $state.status === 'processing');
export const isComplete = derived(uploadStore, ($state) => $state.status === 'completed');
export const hasError = derived(uploadStore, ($state) => $state.status === 'failed');

// Store actions
export const uploadActions = {
 /**
 * Start upload
 */
 startUpload(evidenceId: string, jobId: string, filename: string, fileSize: number) {
 uploadStore.update((state) => ({
 ...state,
 evidenceId,
 jobId,
 filename,
 fileSize,
 status: 'uploading',
 uploadProgress: 0,
 error: null,
 }));
 },

 /**
 * Update upload progress
 */
 updateUploadProgress(progress: number) {
 uploadStore.update((state) => ({
 ...state,
 uploadProgress: Math.min(100, progress),
 }));
 },

 /**
 * Start processing
 */
 startProcessing(jobId: string) {
 uploadStore.update((state) => ({
 ...state,
 jobId,
 status: 'processing',
 processingPercentage: 0,
 processingStage: 'classification',
 error: null,
 }));
 },

 /**
 * Update processing event
 */
 updateProcessingEvent(event: ProcessingEvent) {
 uploadStore.update((state) => ({
 ...state,
 processingStage: event.stage,
 processingPercentage: event.percentage,
 eta: event.eta_seconds,
 metrics: event.metrics || state.metrics,
 }));
 },

 /**
 * Complete processing
 */
 completeProcessing() {
 uploadStore.update((state) => ({
 ...state,
 status: 'completed',
 processingPercentage: 100,
 eta: null,
 }));
 },

 /**
 * Handle error
 */
 setError(error: string) {
 uploadStore.update((state) => ({
 ...state,
 status: 'failed',
 error,
 }));
 },

 /**
 * Reset state
 */
 reset() {
 uploadStore.set(initialState);
 },
};
