import { cache } from '$lib/server/cache/redis';
import { createActor } from 'xstate';
import { documentProcessingMachine, type DocumentProcessingContext } from './document-processing.js';
import { legalCaseManagementMachine, type LegalCaseContext } from './legal-case-management.js';
import type { WorkflowActor } from './shared-types.js';

// Types for workflow orchestration
export interface WorkflowInstance {
    id: string;
    type: 'document-processing' | 'legal-case-management' | 'evidence-analysis' | 'research';
    status: 'pending' | 'running' | 'completed' | 'failed' | 'paused';
    actor: WorkflowActor | null; // Nullable for serialization/persistence
    context: DocumentProcessingContext | LegalCaseContext | Record<string, unknown>;
    createdAt: number;
    updatedAt: number;
    progress: number;
    parentWorkflow?: string;
    childWorkflows: string[];
    dependencies: string[];
    tags: string[];
    metadata: Record<string, unknown>;
}

export interface OrchestrationEvent {
    type: string;
    workflowId: string;
    payload: Record<string, unknown>;
    timestamp: number;
    correlationId?: string;
}

class WorkflowOrchestrator {
    private workflows: Map<string, WorkflowInstance> = new Map();
    private eventQueue: OrchestrationEvent[] = [];
    private running = false;
    private subscribers: Map<string, ((event: OrchestrationEvent) => void)[]> = new Map();

    constructor() {
        console.log('🎬 Workflow Orchestrator initialized');
    }

    // Start a new document processing workflow
    async startDocumentProcessing(
        documentId: string,
        content: string,
        metadata: Record<string, unknown> = {},
        parentWorkflow?: string
    ): Promise<string> {
        const workflowId = `doc_${documentId}_${Date.now()}`;
        console.log(`📄 Starting document processing workflow: ${workflowId}`);

        const actor = createActor(documentProcessingMachine, {
            input: {
                documentId,
                content,
                metadata
            }
        });

        const startSnapshot = actor.getSnapshot();
        const workflow: WorkflowInstance = {
            id: workflowId,
            type: 'document-processing',
            status: 'pending',
            actor: actor as unknown as WorkflowActor, // Cast for simplicity, assuming compatible
            context: startSnapshot?.context ?? {},
            createdAt: Date.now(),
            updatedAt: Date.now(),
            progress: 0,
            parentWorkflow,
            childWorkflows: [],
            dependencies: [],
            tags: ['document', 'processing', 'embeddings'],
            metadata: { documentId, ...metadata }
        };

        this.workflows.set(workflowId, workflow);

        // Set up event listeners
        actor.subscribe((snapshot: any) => {
            this.onWorkflowStateChange(workflowId, snapshot);
        });

        // Start the workflow
        actor.start();
        actor.send({
            type: 'START_PROCESSING',
            documentId,
            content,
            metadata
        });

        workflow.status = 'running';

        // Cache workflow state
        await this.persistWorkflow(workflowId);

        // Emit event
        this.emitEvent({
            type: 'WORKFLOW_STARTED',
            workflowId,
            payload: { type: 'document-processing', documentId },
            timestamp: Date.now()
        });

        return workflowId;
    }

    // Start a new legal case management workflow
    async startLegalCaseManagement(
        title: string,
        description: string,
        caseType: string,
        jurisdiction: string,
        createdBy: string,
        parentWorkflow?: string
    ): Promise<string> {
        const workflowId = `case_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        console.log(`⚖️ Starting legal case workflow: ${workflowId}`);

        const actor = createActor(legalCaseManagementMachine);

        const workflow: WorkflowInstance = {
            id: workflowId,
            type: 'legal-case-management',
            status: 'pending',
            actor: actor as unknown as WorkflowActor,
            context: (actor.getSnapshot() as any).context || {},
            createdAt: Date.now(),
            updatedAt: Date.now(),
            progress: 0,
            parentWorkflow,
            childWorkflows: [],
            dependencies: [],
            tags: ['legal', 'case', 'management'],
            metadata: { title, caseType, jurisdiction, createdBy }
        };

        this.workflows.set(workflowId, workflow);

        // Set up event listeners
        actor.subscribe((snapshot: any) => {
            this.onWorkflowStateChange(workflowId, snapshot);
        });

        // Start the workflow
        actor.start();
        actor.send({
            type: 'CREATE_CASE',
            title,
            description,
            caseType,
            jurisdiction,
            createdBy
        });

        workflow.status = 'running';

        // Cache workflow state
        await this.persistWorkflow(workflowId);

        // Emit event
        this.emitEvent({
            type: 'WORKFLOW_STARTED',
            workflowId,
            payload: { type: 'legal-case-management', title, caseType },
            timestamp: Date.now()
        });

        return workflowId;
    }

    // Send event to a specific workflow
    async sendToWorkflow(workflowId: string, event: { type: string, [key: string]: any }): Promise<boolean> {
        const workflow = this.workflows.get(workflowId);
        if (!workflow || !workflow.actor) {
            console.warn(`⚠️ Workflow not found: ${workflowId}`);
            return false;
        }

        console.log(`📥 Sending event to workflow ${workflowId}: ${event.type}`);

        try {
            workflow.actor.send(event as any);
            workflow.updatedAt = Date.now();
            await this.persistWorkflow(workflowId);

            this.emitEvent({
                type: 'EVENT_SENT',
                workflowId,
                payload: { eventType: event.type },
                timestamp: Date.now()
            });

            return true;
        } catch (error) {
            console.error(`❌ Failed to send event to workflow ${workflowId}:`, error);
            return false;
        }
    }

    // Get workflow status
    getWorkflowStatus(workflowId: string): WorkflowInstance | null {
        const workflow = this.workflows.get(workflowId);
        if (!workflow) return null;

        // Update with current actor state
        if (workflow.actor) {
            const snapshot = workflow.actor.getSnapshot();
            workflow.context = snapshot.context as any;
            workflow.progress = (snapshot.context as any)?.progress ?? 0;
        }
        return workflow;
    }

    // Get all workflows
    getAllWorkflows(): WorkflowInstance[] {
        return Array.from(this.workflows.values()).map(workflow => {
            if (workflow.actor) {
                const snapshot = workflow.actor.getSnapshot();
                workflow.context = snapshot.context as any;
                workflow.progress = (snapshot.context as any)?.progress ?? 0;
            }
            return workflow;
        });
    }

    // Get workflows by type
    getWorkflowsByType(type: WorkflowInstance['type']): WorkflowInstance[] {
        return this.getAllWorkflows().filter(workflow => workflow.type === type);
    }

    // Get workflows by status
    getWorkflowsByStatus(status: WorkflowInstance['status']): WorkflowInstance[] {
        return this.getAllWorkflows().filter(workflow => workflow.status === status);
    }

    // Pause a workflow
    async pauseWorkflow(workflowId: string): Promise<boolean> {
        const workflow = this.workflows.get(workflowId);
        if (!workflow) return false;

        workflow.status = 'paused';
        workflow.updatedAt = Date.now();
        await this.persistWorkflow(workflowId);

        this.emitEvent({
            type: 'WORKFLOW_PAUSED',
            workflowId,
            payload: {},
            timestamp: Date.now()
        });

        return true;
    }

    // Resume a workflow
    async resumeWorkflow(workflowId: string): Promise<boolean> {
        const workflow = this.workflows.get(workflowId);
        if (!workflow || workflow.status !== 'paused') return false;

        workflow.status = 'running';
        workflow.updatedAt = Date.now();
        await this.persistWorkflow(workflowId);

        this.emitEvent({
            type: 'WORKFLOW_RESUMED',
            workflowId,
            payload: {},
            timestamp: Date.now()
        });

        return true;
    }

    // Cancel a workflow
    async cancelWorkflow(workflowId: string): Promise<boolean> {
        const workflow = this.workflows.get(workflowId);
        if (!workflow) return false;

        if (workflow.actor) {
            workflow.actor.stop();
        }

        workflow.status = 'failed';
        workflow.updatedAt = Date.now();
        await this.persistWorkflow(workflowId);

        this.emitEvent({
            type: 'WORKFLOW_CANCELLED',
            workflowId,
            payload: {},
            timestamp: Date.now()
        });

        return true;
    }

    // Create workflow dependencies
    async createDependency(workflowId: string, dependsOnWorkflowId: string): Promise<boolean> {
        const workflow = this.workflows.get(workflowId);
        const dependencyWorkflow = this.workflows.get(dependsOnWorkflowId);

        if (!workflow || !dependencyWorkflow) return false;

        if (!workflow.dependencies.includes(dependsOnWorkflowId)) {
            workflow.dependencies.push(dependsOnWorkflowId);
            workflow.updatedAt = Date.now();
            await this.persistWorkflow(workflowId);
        }
        return true;
    }

    // Create parent-child workflow relationship
    async createChildWorkflow(parentWorkflowId: string, childWorkflowId: string): Promise<boolean> {
        const parentWorkflow = this.workflows.get(parentWorkflowId);
        const childWorkflow = this.workflows.get(childWorkflowId);

        if (!parentWorkflow || !childWorkflow) return false;

        if (!parentWorkflow.childWorkflows.includes(childWorkflowId)) {
            parentWorkflow.childWorkflows.push(childWorkflowId);
            parentWorkflow.updatedAt = Date.now();
            await this.persistWorkflow(parentWorkflowId);
        }

        childWorkflow.parentWorkflow = parentWorkflowId;
        childWorkflow.updatedAt = Date.now();
        await this.persistWorkflow(childWorkflowId);

        return true;
    }

    // Subscribe to workflow events
    subscribe(eventType: string, callback: (event: OrchestrationEvent) => void): () => void {
        if (!this.subscribers.has(eventType)) {
            this.subscribers.set(eventType, []);
        }
        this.subscribers.get(eventType)!.push(callback);

        // Return unsubscribe function
        return () => {
            const subscribers = this.subscribers.get(eventType);
            if (subscribers) {
                const index = subscribers.indexOf(callback);
                if (index > -1) {
                    subscribers.splice(index, 1);
                }
            }
        };
    }

    // Event handling
    private onWorkflowStateChange(workflowId: string, snapshot: any): void {
        const workflow = this.workflows.get(workflowId);
        if (!workflow) return;

        workflow.context = snapshot.context;
        workflow.progress = snapshot.context?.progress ?? 0;
        workflow.updatedAt = Date.now();

        // Update status based on state
        if (snapshot.matches('completed') || snapshot.matches('archived')) {
            workflow.status = 'completed';
            this.emitEvent({
                type: 'WORKFLOW_COMPLETED',
                workflowId,
                payload: { finalContext: snapshot.context },
                timestamp: Date.now()
            });
        } else if (
            snapshot.matches('error') ||
            snapshot.matches('failed') ||
            snapshot.matches('validationError') ||
            snapshot.matches('creationError')
        ) {
            workflow.status = 'failed';
            this.emitEvent({
                type: 'WORKFLOW_FAILED',
                workflowId,
                payload: { error: snapshot.context.errors },
                timestamp: Date.now()
            });
        } else if (workflow.status === 'paused') {
            // Keep paused status
        } else {
            workflow.status = 'running';
        }

        // Emit progress update
        this.emitEvent({
            type: 'WORKFLOW_PROGRESS',
            workflowId,
            payload: {
                progress: workflow.progress,
                stage: snapshot.context?.processingStage || snapshot.context?.workflowStage || snapshot.value
            },
            timestamp: Date.now()
        });

        // Auto-persist on significant changes
        this.persistWorkflow(workflowId);
    }

    private emitEvent(event: OrchestrationEvent): void {
        console.log(`📡 Orchestrator event: ${event.type} (${event.workflowId})`);

        // Add to event queue
        this.eventQueue.push(event);

        // Keep only last 1000 events
        if (this.eventQueue.length > 1000) {
            this.eventQueue.shift();
        }

        // Notify subscribers
        const subscribers = this.subscribers.get(event.type) || [];
        const allSubscribers = this.subscribers.get('*') || [];

        [...subscribers, ...allSubscribers].forEach(callback => {
            try {
                callback(event);
            } catch (error) {
                console.error('❌ Subscriber error:', error);
            }
        });
    }

    // Persistence
    private async persistWorkflow(workflowId: string): Promise<void> {
        const workflow = this.workflows.get(workflowId);
        if (!workflow) return;

        try {
            // Create serializable version (exclude actor)
            const serializable = {
                ...workflow,
                actor: null // Don't serialize the actor
            };
            await cache.set(`workflow:${workflowId}`, serializable, 86400); // 24h TTL
        } catch (error) {
            console.error(`❌ Failed to persist workflow ${workflowId}:`, error);
        }
    }

    // Load workflow from cache
    async loadWorkflow(workflowId: string): Promise<WorkflowInstance | null> {
        try {
            const cached = await cache.get<WorkflowInstance>(`workflow:${workflowId}`);
            if (!cached) return null;

            // Restore actor based on type
            let actor: any;
            switch (cached.type) {
                case 'document-processing': {
                    actor = createActor(documentProcessingMachine);
                    break;
                }
                case 'legal-case-management': {
                    actor = createActor(legalCaseManagementMachine);
                    break;
                }
                default:
                    console.warn(`⚠️ Unknown workflow type: ${cached.type}`);
                    return null;
            }

            // Restore workflow
            const workflow: WorkflowInstance = {
                ...cached,
                actor
            };

            this.workflows.set(workflowId, workflow);

            // Set up event listeners
            actor.subscribe((snapshot: any) => {
                this.onWorkflowStateChange(workflowId, snapshot);
            });

            return workflow;
        } catch (error) {
            console.error(`❌ Failed to load workflow ${workflowId}:`, error);
            return null;
        }
    }

    // Orchestration statistics
    getStatistics(): {
        total: number;
        byType: Record<string, number>;
        byStatus: Record<string, number>;
        averageProgress: number;
        totalEvents: number;
    } {
        const workflows = this.getAllWorkflows();
        const byType: Record<string, number> = {};
        const byStatus: Record<string, number> = {};
        let totalProgress = 0;

        workflows.forEach(workflow => {
            byType[workflow.type] = (byType[workflow.type] ?? 0) + 1;
            byStatus[workflow.status] = (byStatus[workflow.status] ?? 0) + 1;
            totalProgress += workflow.progress;
        });

        return {
            total: workflows.length,
            byType,
            byStatus,
            averageProgress: workflows.length > 0 ? totalProgress / workflows.length : 0,
            totalEvents: this.eventQueue.length
        };
    }

    // Cleanup completed workflows
    async cleanup(olderThanMs: number = 24 * 60 * 60 * 1000): Promise<number> {
        const cutoff = Date.now() - olderThanMs;
        let cleaned = 0;

        for (const [workflowId, workflow] of this.workflows) {
            if (
                workflow.status === 'completed' &&
                workflow.updatedAt < cutoff
            ) {
                if (workflow.actor) {
                    workflow.actor.stop();
                }
                this.workflows.delete(workflowId);
                await cache.del(`workflow:${workflowId}`);
                cleaned++;
            }
        }
        console.log(`🧹 Cleaned up ${cleaned} completed workflows`);
        return cleaned;
    }

    // Shutdown orchestrator
    async shutdown(): Promise<void> {
        console.log('🛑 Shutting down workflow orchestrator...');
        for (const [workflowId, workflow] of this.workflows) {
            if (workflow.actor) {
                workflow.actor.stop();
            }
            await this.persistWorkflow(workflowId);
        }
        this.workflows.clear();
        this.subscribers.clear();
        this.eventQueue.length = 0;
        console.log('✅ Workflow orchestrator shutdown complete');
    }
}

// Singleton instance
export const workflowOrchestrator = new WorkflowOrchestrator();
export default workflowOrchestrator;







