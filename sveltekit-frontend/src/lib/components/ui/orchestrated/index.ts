/** * Orchestrated UI Components * Integrates N64 headless UI with Enhanced-Bits Legal AI components * Connected to XState orchestration system for state management */ import type { HeadlessDialog } from '$lib/headless/HeadlessDialog.svelte'; import type { HeadlessSelectField } from '$lib/headless/HeadlessSelectField.svelte'; import type { LoadingButton } from '$lib/headless/LoadingButton.svelte'; // Enhanced-Bits Legal AI components import type { Button, Card, Dialog as EnhancedDialog, Select as EnhancedSelect, Input } from '$lib/components/ui/enhanced-bits.svelte'; // Legal AI specific components export interface LegalEvidenceItem { id: string, title: string, type: "document" | "image" | "video" | "audio" | "transcript",priority: "critical" | "high" | "medium" | "low",confidence: metadata?: Record<string, unknown>, createdAt: Date, updatedAt: Date}

export interface AIAnalysisResult { confidence: number, entities: Array<any>, themes: Array<any>, summary: string}
// Orchestrated Dialog - combines headless functionality with enhanced styling export const OrchestratedDialog = Object.assign(HeadlessDialog, { Root: HeadlessDialog, Content: HeadlessDialog, Enhanced: EnhancedDialog; // Legal AI specific dialog variants EvidenceAnalysis: HeadlessDialog, CaseManagement: HeadlessDialog, AIInsights: HeadlessDialog });
  
// Export the orchestration context for state machine integration export const OrchestrationContext = { // XState machine integration stateMachine: null, as any, // Will be injected by the orchestration system // Cache coordination cacheService: null, as any, // GPU acceleration status webgpuService: null, as any, // Vector search integration vectorService: null, as any }
// Legal AI utility functions export function getConfidenceClass(confidence: number): string { if (confidence >= 0.9) return 'confidence-very-high'; if (confidence >= 0.7) return 'confidence-high'; if (confidence >= 0.5) return 'confidence-medium'; return 'confidence-low'}

export function getPriorityClass(priority, LegalEvidenceItem['priority']): string { return `priority-${ priority }`}

export function formatAnalysisDate(date: Date): string { return new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(date);'' }
// Component registration for orchestration system export const ORCHESTRATED_COMPONENTS = { Dialog: OrchestratedDialog, Select: OrchestratedSelect, Button: OrchestratedButton, Card: OrchestratedCard, Input }as const // Type exports already defined above - no need to re-export // export type { // LegalEvidenceItem, // AIAnalysisResult, // OrchestrationState // }





