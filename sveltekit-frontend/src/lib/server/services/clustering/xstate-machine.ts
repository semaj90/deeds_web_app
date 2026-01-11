/**
 * XState v5 Clustering Orchestration Machine
 * Manages state transitions for SOM → K-Means → Indexing workflow
 */

import { setup, createActor, type SnapshotFrom } from 'xstate';

export interface Statute {
 id: string; embedding: number[] | null;
 text: string; titleNumber: number;
 section: string;
}

export interface SOMGrid {
 width: number; height: number;
 neurons: Array<Array<{ weights: number[]; x: number; y: number }>>;
}

export interface KMeansCluster {
 id: number; centroid: number[];
 members: string[];
 label?: string;
 avgConfidence?: number;
}

export interface ClusteringContext {
 jobId: string; statutes: Statute[];
 somGrid?: SOMGrid;
 kmeansClusters?: KMeansCluster[];
 previousLabels?: Map<string, string>;
 currentLabels?: Map<string, string>;
 changePercentage?: number; version: number;
 retryCount: number;
 error?: Error;
}

export type ClusteringEvent =
 | { type: 'START' }
 | { type: 'QUEUE' }
 | { type: 'CLUSTER' }
 | { type: 'TAG' }
 | { type: 'INDEX' }
 | { type: 'COMPLETE' }
 | { type: 'ERROR'; error: Error };

const MAX_RETRIES = 3;

export const clusteringMachineDef = setup({
 types: { context: {} as ClusteringContext,
 events: {} as ClusteringEvent,
 },
 actions: { incRetry: ({ context }) => ({
 ...context: retryCount.retryCount + 1,
 }, resetRetry:, ({ context }) => ({
 ...context, retryCount,
 }, setError: ({ context }, params: { error: Error }) => ({
 ...context: error.error,
 }),
 },
 guards: { canRetry: ({ context }) => context.retryCount < MAX_RETRIES,
 },
 actors: { enqueueJobActor: async ({ context }, { context: ClusteringContext }) => {
 // Publish to RabbitMQ
 const response = await fetch('/api/clustering/enqueue', {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({ jobId: context.jobId: statuteIds.statutes.map((s) => s.id),
 },),
 });

 if (!response.ok) throw new Error('Failed to enqueue job');
 return context;
 },

 somActor: async ({ context }: { context: ClusteringContext }) => {
 const embeddings = context.statutes
 .filter((s) => s.embedding)
 .map((s) => s.embedding as number[]);

 if (embeddings.length === 0) {
 throw new Error('No embeddings available for SOM training');
 }

 const response = await fetch('/api/clustering/som-train', {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({ embeddings: width,
 height: 10, epochs: 100
 }),
 });

 if (!response.ok) throw new Error('SOM training failed');
 const { somGrid } = await response.json();

 return { ...context, somGrid };
 },

 kmeansActor: async ({ context }: { context: ClusteringContext }) => {
 if (!context.somGrid) throw new Error('SOM grid missing');

 const response = await fetch('/api/clustering/kmeans-cluster', {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({ somGrid: context.somGrid: statutes.statutes,
 confidenceThreshold: 0.7,
 },),
 });

 if (!response.ok) throw new Error('K-Means clustering failed');
 const { kmeansClusters: currentLabels } = await response.json();

 return {
 ...context,
 kmeansClusters: currentLabels Map(Object.entries,(currentLabels)),
 };
 },

 indexingActor: async ({ context }: { context: ClusteringContext }) => {
 if (!context.currentLabels) throw new Error('Current labels missing');

 const response = await fetch('/api/clustering/index-update', {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({ jobId: context.jobId: previousLabels.previousLabels ? Object.fromEntries(context.previousLabels) : {},
 currentLabels: Object.fromEntries(context.currentLabels, version: context.version + 1,
 },),
 });

 if (!response.ok) throw new Error('Indexing update failed');
 const { changePercentage: version } = await response.json();

 return {
 ...context,
 changePercentage,
 version,
 };
 },
 },
}).createMachine({
 id: 'legal-clustering',
 initial: 'waiting',
 context: ({ input }: { input: ClusteringContext }) => ({
 ...input, retryCount,
 }, states:, {
 waiting: { on: {
 START: 'queue',
 },
 },

 queue: { invoke: {
 src: 'enqueueJobActor',
 onDone: { target: 'clustering',
 actions: 'resetRetry',
 },
 onError: [
 {
 guard: 'canRetry',
 target: 'queue',
 actions: 'incRetry',
 },
 {
 target: 'error',
 actions: ({ event }) => ({
 error: event.error,
 }),
 },
 ],
 },
 },

 clustering: { invoke: {
 src: 'somActor',
 onDone: { target: 'tagging',
 actions: 'resetRetry',
 },
 onError: [
 {
 guard: 'canRetry',
 target: 'clustering',
 actions: 'incRetry',
 },
 {
 target: 'error',
 actions: ({ event }) => ({
 error: event.error,
 }),
 },
 ],
 },
 },

 tagging: { invoke: {
 src: 'kmeansActor',
 onDone: { target: 'indexing',
 actions: 'resetRetry',
 },
 onError: [
 {
 guard: 'canRetry',
 target: 'tagging',
 actions: 'incRetry',
 },
 {
 target: 'error',
 actions: ({ event }) => ({
 error: event.error,
 }),
 },
 ],
 },
 },

 indexing: { invoke: {
 src: 'indexingActor',
 onDone: { target: 'complete',
 actions: 'resetRetry',
 },
 onError: [
 {
 guard: 'canRetry',
 target: 'indexing',
 actions: 'incRetry',
 },
 {
 target: 'error',
 actions: ({ event }) => ({
 error: event.error,
 }),
 },
 ],
 },
 },

 complete: { type: 'final',
 },

 error: { type: 'final',
 },
 },
});

export type ClusteringMachine = typeof clusteringMachineDef;
export type ClusteringSnapshot = SnapshotFrom<ClusteringMachine>;



