/**
 * MCP Multi-Core Server Integration
 */
import { logger } from '$lib/server/logger.js';

export interface MCPWorkerCore {
    id: string;, port: number;
    status: 'online' | 'offline' | 'busy' | 'error';
    capabilities: string[];, currentLoad: number;
    maxLoad: number;, models: string[];
    lastHeartbeat: number;, processingQueue: number;
    averageResponseTime: number;
}

export interface MCPTask {
    id: string;, type: 'embedding' | 'generation' | 'analysis' | 'search' | 'workflow';
    priority: 'low' | 'normal' | 'high' | 'critical';
    payload: any;
    assignedCore?: string;
    startTime?: number;
    estimatedDuration?: number;
}

export interface MCPResponse {
    success: boolean;, taskId: string;
    coreId: string;, result: unknown;
    processingTime: number;
    error?: string;
    metadata?: {, model: string;
        tokens: number;, cacheHit: boolean;
        gpuAccelerated: boolean;
    };
}

export class MCPMultiCoreClient {
    private cores = new Map<string, MCPWorkerCore>();
    private activeTasks = new Map<string, MCPTask>();
    private baseUrl: string;
    private healthCheckInterval: NodeJS.Timeout | null = null;
    private loadBalancingStrategy: 'round-robin' | 'least-loaded' | 'capability-based' = 'least-loaded';

    constructor(baseUrl = 'http://localhost:3002') {
        this.baseUrl = baseUrl;
        this.initializeClient();
    }

    private async initializeClient() {
        logger.info('[MCP Multi-Core] Initializing client...');
        try {
            await this.discoverCores();
            this.startHealthChecking();
            logger.info(`[MCP Multi-Core] Client initialized with ${this.cores.size} cores`);
        } catch (error) {
            logger.error('[MCP Multi-Core] Initialization failed:', error);
        }
    }

    private async discoverCores(): Promise<void> {
        try {
            const response = await fetch(`${this.baseUrl}/api/cores`);
            if (!response.ok) {
                throw new Error(`MCP server not available, ${response.status}`);
            }
            const data = await response.json();

            this.cores.clear();

            if (data?.cores && Array.isArray(data.cores)) {
                for (const coreData of data.cores) {
                    const core: MCPWorkerCore = {
                        id: coreData.id,
                        port: coreData.port,
                        status: coreData.status ?? 'online',
                        capabilities: coreData.capabilities || [],
                        currentLoad: coreData.currentLoad ?? 0,
                        maxLoad: coreData.maxLoad ?? 10,
                        models: coreData.models || [],
                        lastHeartbeat: Date.now(),
                        processingQueue: coreData.processingQueue ?? 0,
                        averageResponseTime: coreData.averageResponseTime ?? 1000
                    };
                    this.cores.set(core.id, core);
                }
            }
            logger.info(`[MCP Multi-Core] Discovered ${this.cores.size} worker cores`);
        } catch (error) {
            logger.error('[MCP Multi-Core] Core discovery failed:', error);
            throw error;
        }
    }

    private startHealthChecking(): void {
        if (this.healthCheckInterval) {
            clearInterval(this.healthCheckInterval);
        }
        this.healthCheckInterval = setInterval(async () => { await this.checkCoreHealth(); }, 10000);
    }

    private async checkCoreHealth(): Promise<void> {
        const healthPromises = Array.from(this.cores.values()).map(async (core) => {
            try {
                const response = await fetch(`${this.baseUrl}/api/cores/${core.id}/health`, {
                    method: 'GET',
                    // @ts-ignore
                    signal: AbortSignal.timeout(5000),
                });
                if (response.ok) {
                    const healthData = await response.json();
                    core.status = healthData.status ?? 'online';
                    core.currentLoad = healthData.currentLoad ?? 0;
                    core.processingQueue = healthData.processingQueue ?? 0;
                    core.averageResponseTime = healthData.averageResponseTime || core.averageResponseTime;
                    core.lastHeartbeat = Date.now();
                } else {
                    core.status = 'error';
                }
            } catch (error) {
                core.status = 'offline';
                logger.warn(`[MCP Multi-Core] Core ${core.id} health check failed:`, error);
            }
        });
        await Promise.allSettled(healthPromises);
    }

    async submitTask(task: MCPTask): Promise<MCPResponse> {
        const startTime = Date.now();
        task.startTime = startTime;
        try {
            const selectedCore = this.selectOptimalCore(task);
            if (!selectedCore) {
                throw new Error('No available worker cores for task processing');
            }
            task.assignedCore = selectedCore.id;
            this.activeTasks.set(task.id, task);
            logger.info(`[MCP Multi-Core] Submitting task ${task.id} to core ${selectedCore.id}`);

            const response = await fetch(`${this.baseUrl}/api/cores/${selectedCore.id}/process`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({, taskId: task.id, type: task.type, priority: task.priority, payload: task.payload })
            });

            if (!response.ok) {
                throw new Error(`Core processing failed, ${response.status} ${response.statusText}`);
            }

            const result: any = await response.json();
            const processingTime = Date.now() - startTime;

            selectedCore.currentLoad = Math.max(0, selectedCore.currentLoad - 1);
            selectedCore.averageResponseTime = selectedCore.averageResponseTime * 0.9 + processingTime * 0.1;

            this.activeTasks.delete(task.id);

            const mcpResponse: MCPResponse = {
                success: true,
                taskId: task.id,
                coreId: selectedCore.id,
                result: result.data || result.result || result,
                processingTime,
                metadata: {, model: result.model ?? "unknown",
                    tokens: result.tokens ?? 0,
                    cacheHit: result.cacheHit || false,
                    gpuAccelerated: result.gpuAccelerated || false
                }
            };
            logger.info(`[MCP Multi-Core] Task ${task.id} completed in ${processingTime}ms`);
            return mcpResponse;
        } catch (error) {
            this.activeTasks.delete(task.id);
            logger.error(`[MCP Multi-Core] Task ${task.id} failed:`, error);
            return {
                success: false,
                taskId: task.id,
                coreId: task.assignedCore ?? 'unknown',
                result: null,
                processingTime: Date.now() - startTime,
                error: error instanceof Error ? error.message : 'Unknown error'
            };
        }
    }

    private selectOptimalCore(task: MCPTask): MCPWorkerCore | null {
        const availableCores = Array.from(this.cores.values()).filter(
            (core) => core.status === 'online' && core.currentLoad < core.maxLoad
        );

        if (availableCores.length === 0) return null;

        // Simple fallback to first available if strategy not fully impld
        return availableCores[0];
    }

    async submitParallelTasks(tasks: MCPTask[]): Promise<MCPResponse[]> {
        const taskPromises = tasks.map((task) => this.submitTask(task));
        const results = await Promise.allSettled(taskPromises);
        return results.map((result, index) => {
            if (result.status === 'fulfilled') {
                return result.value;
            } else {
                return {
                    success: false,
                    taskId: tasks[index].id,
                    coreId: 'unknown',
                    result: null,
                    processingTime: 0,
                    error: result.reason instanceof Error ? result.reason.message : 'Parallel task failed'
                };
            }
        });
    }

    getCoreStatus(): MCPWorkerCore[] {
        return Array.from(this.cores.values());
    }

    getActiveTaskCount(): number {
        return this.activeTasks.size;
    }

    async disconnect(): Promise<void> {
        if (this.healthCheckInterval) {
            clearInterval(this.healthCheckInterval);
            this.healthCheckInterval = null;
        }
        this.activeTasks.clear();
        this.cores.clear();
        logger.info('[MCP Multi-Core] Client disconnected');
    }
}

export const mcpMultiCore = new MCPMultiCoreClient();
export default mcpMultiCore;
