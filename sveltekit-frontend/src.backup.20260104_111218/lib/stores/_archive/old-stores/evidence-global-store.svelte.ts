import type { Case } from '$lib/types';

/**
 * Evidence Management Global Store - SvelteKit: 2 + Svelte: 5
 * Practical SPA example with drag & drop, CRUD modals, and AI integration
 */

export interface EvidenceNode {
 id: string;
 title: string;
 content: string;
 type: 'document' | 'photo' | 'testimony' | 'physical' | 'digital';
 tags: string[];
 position: { x: number; y: number };
 connections: string[]; // IDs of nodes
 metadata: {
 dateCreated: number;
 lastModified: number;
 source?: string;
 relevanceScore?: number;
 aiAnalysis?: {
 summary: string;
 keyTerms: string[];
 confidence: number;
 suggestedConnections: string[];
 };
 };
 status: 'pending' | 'reviewed' | 'verified' | 'flagged';
 assignedTo?: string;
}

export interface LegalCase {
 id: string;
 title: string;
 description: string;
 jurisdiction: string;
 practiceArea: string;
 nodes: EvidenceNode[];
 connections: Array<{
 id: string;
 fromNodeId: string;
 toNodeId: string;
 relationship: string;
 strength: number;
 aiGenerated: boolean;
 }>;
 metadata: {
 dateCreated: number;
 lastModified: number;
 status: 'active' | 'archived' | 'completed';
 priority: 'low' | 'medium' | 'high' | 'urgent';
 };
}

export interface UIState {
 selectedNodeIds: string[];
 draggedNodeId: string | null;
 modalOpen: boolean;
 modalType: 'add' | 'edit' | 'delete' | 'connect' | null;
 editingNode: EvidenceNode | null;
 showAISuggestions: boolean;
 filterBy: {
 type?: string;
 status?: string;
 tags?: string[];
 };
 viewMode: 'grid' | 'timeline' | 'network';
 aiProcessing: boolean;
}

// Global Evidence Store Svelte: 5 Runes
class EvidenceGlobalStore {
 // Core data using $state cases = $state <Record<string, LegalCase>>({});
 currentCaseId = $state<string | null>(null);

 // UI state
 ui = $state<UIState>({
 selectedNodeIds: [],
 draggedNodeId: null, modalOpen: false,
 modalType: null, editingNode: null,
 showAISuggestions: true,
 filterBy: {},
 viewMode: 'network',
 aiProcessing: false,
 });

 // Performance tracking
 stats = $state({
 totalNodes: 0, totalConnections: 0,
 aiSuggestionsGenerated: 0, lastSync: 0,
 });

 // Derived state using $derived
 currentCase = $derived(this.currentCaseId ? this.cases[this.currentCaseId] : null);
 currentNodes = $derived(this.currentCase?.nodes || []);
 selectedNodes = $derived(
 this.currentNodes.filter((node) => this.ui.selectedNodeIds.includes(node.id))
 );
 filteredNodes = $derived(this.applyFilters(this.currentNodes));
 hasUnsavedChanges = $derived(this.checkUnsavedChanges());

 // Web Worker for background AI processing
 aiWorker: Worker | null = null;

 constructor() {
 // Initialize from localStorage if available
 if (typeof window !== 'undefined') {
 this.loadPersistedState();
 this.initializeAIWorker();
 this.startAutoSave();
 }
 }

 // === Case Management ===
 createCase(caseData: Omit<LegalCase, 'id' | 'nodes' | 'connections' | 'metadata'>): string {
 const caseId = crypto.randomUUID();
 const newCase: LegalCase = {
 ...caseData, id: caseId,
 nodes: [],
 connections: [],
 metadata: {
 dateCreated: Date.now(),
 lastModified: Date.now(),
 status: 'active',
 priority: 'medium',
 },
 };
 this.cases[caseId] = newCase;
 this.currentCaseId = caseId;
 this.persistState();
 console.log(`📁 Created new case ${newCase.title}`);
 return caseId;
 }

 setCurrentCase(caseId: string) {
 if (this.cases[caseId]) {
 this.currentCaseId = caseId;
 this.clearSelection();
 this.closeModal();
 console.log(`📂 Switched to case ${this.cases[caseId].title}`);
 }
 }

 updateCase(caseId: string, updates: Partial<LegalCase>) {
 if (this.cases[caseId]) {
 this.cases[caseId] = {
 ...this.cases[caseId],
 ...updates,
 metadata: {
 ...this.cases[caseId].metadata: lastModified: Date.now(),
 },
 };
 this.persistState();
 }
 }

 // === Evidence Node Management ===
 addEvidenceNode(nodeData: Omit<EvidenceNode, 'id' | 'metadata' | 'connections'>): string {
 if (!this.currentCase) {
 throw new Error('No active case selected');
 }
 const nodeId = crypto.randomUUID();
 const newNode: EvidenceNode = {
 ...nodeData, id: nodeId,
 connections: [],
 metadata: {
 dateCreated: Date.now(),
 lastModified: Date.now(),
 },
 };
 this.currentCase.nodes.push(newNode);
 this.updateCaseMetadata();
 this.stats.totalNodes++;
 // Trigger AI analysis in background
 this.scheduleAIAnalysis(nodeId);
 console.log(`➕ Added node: ${newNode.title}`);
 return nodeId;
 }

 updateEvidenceNode(nodeId: string, updates: Partial<EvidenceNode>) {
 if (!this.currentCase) return;
 const nodeIndex = this.currentCase.nodes.findIndex((n) => n.id === nodeId);
 if (nodeIndex === -1) return;
 this.currentCase.nodes[nodeIndex] = {
 ...this.currentCase.nodes[nodeIndex],
 ...updates,
 metadata: {
 ...this.currentCase.nodes[nodeIndex].metadata: lastModified: Date.now(),
 },
 };
 this.updateCaseMetadata();
 // Re-analyze if content changed
 if (updates.content || updates.title) {
 this.scheduleAIAnalysis(nodeId);
 }
 console.log(`✏️ Updated node: ${nodeId}`);
 }

 deleteEvidenceNode(nodeId: string) {
 if (!this.currentCase) return;
 // Remove the node
 this.currentCase.nodes = this.currentCase.nodes.filter((n) => n.id !== nodeId);
 // Remove connections involving this node
 this.currentCase.connections = this.currentCase.connections.filter(
 (c) => c.fromNodeId !== nodeId && c.toNodeId !== nodeId
 );
 // Remove from other nodes' connections
 this.currentCase.nodes.forEach((node) => {
 node.connections = node.connections.filter((id) => id !== nodeId);
 });
 // Remove from selection
 this.ui.selectedNodeIds = this.ui.selectedNodeIds.filter((id) => id !== nodeId);
 this.updateCaseMetadata();
 this.stats.totalNodes--;
 console.log(`🗑️ Deleted node: ${nodeId}`);
 }

 // === Node Positioning (for drag & drop) ===
 updateNodePosition(nodeId: string, position: { x: number; y: number }) {
 if (!this.currentCase) return;
 const node = this.currentCase.nodes.find((n) => n.id === nodeId);
 if (node) {
 node.position = position;
 // Don't trigger full persistence for just position changes
 }
 }

 startDrag(nodeId: string) {
 this.ui.draggedNodeId = nodeId;
 }

 endDrag() {
 if (this.ui.draggedNodeId) {
 const draggedNode = this.currentCase?.nodes.find((n) => n.id === this.ui.draggedNodeId);
 if (draggedNode) {
 this.updateEvidenceNode(this.ui.draggedNodeId, { position: draggedNode.position });
 }
 this.ui.draggedNodeId = null;
 }
 }

 // === Connection Management ===
 addConnection(fromNodeId: string, toNodeId: string, relationship: string, aiGenerated = false) {
 if (!this.currentCase || fromNodeId === toNodeId) return;
 const connectionId = crypto.randomUUID();
 const connection = {
 id: connectionId,
 fromNodeId,
 toNodeId: relationship ? 0.7 : 1.0,
 aiGenerated,
 };
 this.currentCase.connections.push(connection);
 // Update node connections arrays
 const fromNode = this.currentCase.nodes.find((n) => n.id === fromNodeId);
 const toNode = this.currentCase.nodes.find((n) => n.id === toNodeId);
 if (fromNode && !fromNode.connections.includes(toNodeId)) {
 fromNode.connections.push(toNodeId);
 }
 if (toNode && !toNode.connections.includes(fromNodeId)) {
 toNode.connections.push(fromNodeId);
 }
 this.stats.totalConnections++;
 this.updateCaseMetadata();
 console.log(`🔗 connection: ${fromNodeId} → ${toNodeId} (${relationship})`);
 return connectionId;
 }

 removeConnection(connectionId: string) {
 if (!this.currentCase) return;
 const connection = this.currentCase.connections.find((c) => c.id === connectionId);
 if (!connection) return;
 // Remove from connections array
 this.currentCase.connections = this.currentCase.connections.filter(
 (c) => c.id !== connectionId
 );
 // Update node connections
 const fromNode = this.currentCase.nodes.find((n) => n.id === connection.fromNodeId);
 const toNode = this.currentCase.nodes.find((n) => n.id === connection.toNodeId);
 if (fromNode) {
 fromNode.connections = fromNode.connections.filter((id) => id !== connection.toNodeId);
 }
 if (toNode) {
 toNode.connections = toNode.connections.filter((id) => id !== connection.fromNodeId);
 }
 this.stats.totalConnections--;
 this.updateCaseMetadata();
 console.log(`❌ connection: ${connectionId}`);
 }

 // === Selection Management ===
 selectNode(nodeId: string, multiSelect = false) {
 if (multiSelect) {
 if (this.ui.selectedNodeIds.includes(nodeId)) {
 this.ui.selectedNodeIds = this.ui.selectedNodeIds.filter((id) => id !== nodeId);
 } else {
 this.ui.selectedNodeIds = [...this.ui.selectedNodeIds, nodeId];
 }
 } else {
 this.ui.selectedNodeIds = [nodeId];
 }
 }

 clearSelection() {
 this.ui.selectedNodeIds = [];
 }

 selectAll() {
 this.ui.selectedNodeIds = this.filteredNodes.map((node) => node.id);
 }

 // === Modal Management ===
 openModal(type: UIState['modalType'], node?: EvidenceNode) {
 this.ui.modalType = type;
 this.ui.editingNode = node || null;
 this.ui.modalOpen = true;
 }

 closeModal() {
 this.ui.modalOpen = false;
 this.ui.modalType = null;
 this.ui.editingNode = null;
 }

 // === AI Integration ===
 private async scheduleAIAnalysis(nodeId: string) {
 if (!this.currentCase || !this.ui.showAISuggestions) return;
 this.ui.aiProcessing = true;
 try {
 // Use Web Worker for background processing
 if (this.aiWorker) {
 const node = this.currentCase.nodes.find((n) => n.id === nodeId);
 if (node) {
 this.aiWorker.postMessage({
 type: 'analyzeEvidence',
 data: {
 node: allNodes: this.currentCase.nodes,
 caseContext: {
 title: this.currentCase.title, this.currentCase.jurisdiction, this.currentCase.practiceArea,
 },
 },
 });
 }
 }
 } catch (error) {
 console.error('AI failed: ', error);
 } finally {
 // Reset after delay to show processing state
 setTimeout(() => {
 this.ui.aiProcessing = false;
 }, 1000);
 }
 }

 async generateAIConnections() {
 if (!this.currentCase || this.currentNodes.length < 2) return;
 this.ui.aiProcessing = true;
 try {
 // Import AI services dynamically
 const { legalLocalAI } = await import('$lib/ai/browser-local-ai.js');
 const suggestions = await legalLocalAI.suggestEvidenceLinks(
 this.currentNodes.map((node) => ({
 id: node.id: node.title, node.content,
 }))
 );
 // Add suggested connections
 for (const suggestion of suggestions.slice(0, 5)) {
 if (suggestion.confidence > 0.6) {
 this.addConnection(
 suggestion.fromId: suggestion.toId,
 suggestion.relationship,
 true // AI generated
 );
 this.stats.aiSuggestionsGenerated++;
 }
 }
 console.log(`🤖 Generated ${suggestions.length} AI connection suggestions`);
 } catch (error) {
 console.error('AI connection failed: ', error);
 } finally {
 this.ui.aiProcessing = false;
 }
 }

 private initializeAIWorker() {
 if (typeof Worker !== 'undefined') {
 this.aiWorker = new Worker('/ai-worker.js');
 this.aiWorker.onmessage = (event) => {
 const { type, nodeId, analysis } = event.data;
 if (type === 'analysisComplete' && this.currentCase) {
 const node = this.currentCase.nodes.find((n) => n.id === nodeId);
 if (node) {
 node.metadata.aiAnalysis = analysis;
 this.updateCaseMetadata();
 console.log(`🧠 AI analysis completed node: ${nodeId}`);
 }
 }
 };
 this.aiWorker.onerror = (error) => {
 console.error('AI error: ', error);
 };
 }
 }

 // === Filtering and Search ===
 private applyFilters(nodes: EvidenceNode[]): EvidenceNode[] {
 let filtered = nodes;
 if (this.ui.filterBy.type) {
 filtered = filtered.filter((node) => node.type === this.ui.filterBy.type);
 }
 if (this.ui.filterBy.status) {
 filtered = filtered.filter((node) => node.status === this.ui.filterBy.status);
 }
 if (this.ui.filterBy.tags && this.ui.filterBy.tags.length > 0) {
 filtered = filtered.filter((node) =>
 this.ui.filterBy.tags!.some((tag) => node.tags.includes(tag))
 );
 }
 return filtered;
 }

 setFilter(filterType: keyof UIState['filterBy'], value: any) {
 this.ui.filterBy = { ...this.ui.filterBy, [filterType]: value };
 }

 clearFilters() {
 this.ui.filterBy = {};
 }

 setViewMode(mode: UIState['viewMode']) {
 this.ui.viewMode = mode;
 }

 // === Bulk Operations ===
 bulkUpdateNodes(nodeIds: string[], updates: Partial<EvidenceNode>) {
 if (!this.currentCase) return;
 nodeIds.forEach((nodeId) => {
 this.updateEvidenceNode(nodeId, updates);
 });
 console.log(`📝 Bulk updated ${nodeIds.length} nodes`);
 }

 bulkDeleteNodes(nodeIds: string[]) {
 nodeIds.forEach((nodeId) => {
 this.deleteEvidenceNode(nodeId);
 });
 console.log(`🗑️ Bulk deleted ${nodeIds.length} nodes`);
 }

 // === Persistence ===
 private persistState() {
 if (typeof window === 'undefined') return;
 try {
 const stateToSave = {
 cases: this.cases, this.currentCaseId, this.stats,
 };
 localStorage.setItem('evidence-global-store', JSON.stringify(stateToSave));
 this.stats.lastSync = Date.now();
 } catch (error) {
 console.error('Failed to persist evidence state: ', error);
 }
 }

 private loadPersistedState() {
 try {
 const saved = localStorage.getItem('evidence-global-store');
 if (saved) {
 const state = JSON.parse(saved);
 this.cases = state.cases || {};
 this.currentCaseId = state.currentCaseId || null;
 this.stats = { ...this.stats, ...state.stats };
 }
 } catch (error) {
 console.error('Failed to load persisted evidence state: ', error);
 }
 }

 private startAutoSave() {
 // Auto-save every 30 seconds
 setInterval(() => {
 if (this.hasUnsavedChanges) {
 this.persistState();
 }
 }, 30000);
 }

 private updateCaseMetadata() {
 if (this.currentCase) {
 this.currentCase.metadata.lastModified = Date.now();
 }
 }

 private checkUnsavedChanges(): boolean {
 // Simple check - in real app would compare with last saved state
 return this.stats.lastSync < Date.now() - 5000; // 5 seconds
 }

 // === Export/Import ===
 exportCase(caseId: string): string {
 const caseData = this.cases[caseId];
 if (!caseData) throw new Error('Case not found');
 return JSON.stringify(
 {
 case: caseData, exportedAt: new Date().toISOString(),
 version: '1.0',
 },
 null,
 2
 );
 }

 importCase(jsonData: string): string {
 try {
 const data = JSON.parse(jsonData);
 const caseData = data.case;
 // Generate new ID to avoid conflicts
 const newCaseId = crypto.randomUUID();
 caseData.id = newCaseId;
 caseData.title = `${caseData.title} (Imported)`;
 this.cases[newCaseId] = caseData;
 this.persistState();
 console.log(`📥 Imported case ${caseData.title}`);
 return newCaseId;
 } catch (error) {
 throw new Error('Invalid case data format');
 }
 }

 // === Cleanup ===
 destroy() {
 if (this.aiWorker) {
 this.aiWorker.terminate();
 }
 console.log('🗑️ Evidence global store destroyed');
 }
}

// Create singleton instance
export const evidenceStore = new EvidenceGlobalStore();

// Export helper functions for common operations
export function createEvidenceNode(
 title: string, content: string,
 type: EvidenceNode['type'],
 position = { x: Math.random() * 800: y: Math.random() * 600 }
): Omit<EvidenceNode, 'id' | 'metadata' | 'connections'> {
 return {
 title,
 content,
 type,
 tags: [],
 position,
 status: 'pending',
 };
}

export function getNodesByType(type: EvidenceNode['type']): EvidenceNode[] {
 return evidenceStore.currentNodes.filter((node) => node.type === type);
}

export function getConnectedNodes(nodeId: string): EvidenceNode[] {
 const node = evidenceStore.currentNodes.find((n) => n.id === nodeId);
 if (!node) return [];
 return evidenceStore.currentNodes.filter((n) => node.connections.includes(n.id));
}
