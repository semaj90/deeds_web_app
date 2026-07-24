/**
 * A2A (Agent-to-Agent) Task Coordinator
 *
 * Manages hierarchical task delegation and execution across:
 * - OpenCode agents (MCP tools)
 * - Gemma4 synthesis agents
 * - AsyncLambda workers (Redis queue)
 * - Error-fixing agents
 *
 * Implements task inbox/outbox with:
 * - Dependency tracking
 * - Priority scheduling
 * - Result correlation
 * - Witness chain for audit trail
 */

import { Redis } from 'ioredis';

export interface A2ATask {
  task_id: string;
  agent_id: string;
  parent_task_id?: string;
  child_tasks: string[];
  task_kind:
    | 'orchestrate_pipeline'
    | 'execute_stage'
    | 'fix_error'
    | 'fetch_context'
    | 'synthesize_summary';
  status: 'queued' | 'assigned' | 'executing' | 'completed' | 'failed';
  priority: number; // 1=critical, 5=low
  payload: Record<string, unknown>;
  result?: Record<string, unknown>;
  witness_chain: string[];
  created_at: string;
  assigned_at?: string;
  completed_at?: string;
  error?: string;
}

export interface A2AAgent {
  agent_id: string;
  agent_type: 'opencode_mcp' | 'gemma4' | 'async_lambda' | 'error_fixer';
  status: 'available' | 'busy' | 'error';
  current_task?: string;
  completed_tasks: number;
  failed_tasks: number;
  heartbeat: string;
}

export class A2ATaskCoordinator {
  private redis: Redis;
  private taskQueuePrefix: string = 'a2a:task';
  private agentRegistryPrefix: string = 'a2a:agent';
  private heartbeatInterval: number = 30000; // 30s

  constructor(redis: Redis) {
    this.redis = redis;
  }

  /**
   * Register an agent with the coordinator
   */
  async registerAgent(agentId: string, agentType: A2AAgent['agent_type']): Promise<A2AAgent> {
    const agent: A2AAgent = {
      agent_id: agentId,
      agent_type: agentType,
      status: 'available',
      completed_tasks: 0,
      failed_tasks: 0,
      heartbeat: new Date().toISOString(),
    };

    const agentKey = `${this.agentRegistryPrefix}:${agentId}`;
    await this.redis.set(agentKey, JSON.stringify(agent), 'EX', 300); // 5min TTL

    console.log(`[A2A] Agent registered: ${agentId} (${agentType})`);
    return agent;
  }

  /**
   * Enqueue a task for execution
   */
  async enqueueTask(params: {
    task_kind: A2ATask['task_kind'];
    payload: Record<string, unknown>;
    priority?: number;
    parent_task_id?: string;
    target_agent_type?: A2AAgent['agent_type'];
  }): Promise<A2ATask> {
    const task_id = `task:${Date.now()}:${Math.random().toString(36).slice(2, 9)}`;
    const priority = params.priority || 3;

    const task: A2ATask = {
      task_id,
      agent_id: '', // Assigned during pickup
      parent_task_id: params.parent_task_id,
      child_tasks: [],
      task_kind: params.task_kind,
      status: 'queued',
      priority,
      payload: params.payload,
      witness_chain: [
        `[${new Date().toISOString()}] Task enqueued by coordinator`,
      ],
      created_at: new Date().toISOString(),
    };

    // Store in Redis queue
    const queueKey = `${this.taskQueuePrefix}:queue:${priority}`;
    await this.redis.lpush(queueKey, JSON.stringify(task));

    // Index by task_id for fast lookup
    const taskKey = `${this.taskQueuePrefix}:${task_id}`;
    await this.redis.set(taskKey, JSON.stringify(task), 'EX', 3600);

    // Link to parent if applicable
    if (params.parent_task_id) {
      const parentKey = `${this.taskQueuePrefix}:${params.parent_task_id}`;
      const parentJson = await this.redis.get(parentKey);
      if (parentJson) {
        const parent = JSON.parse(parentJson);
        parent.child_tasks.push(task_id);
        await this.redis.set(parentKey, JSON.stringify(parent), 'EX', 3600);
      }
    }

    console.log(`[A2A] Task enqueued: ${task_id} (${params.task_kind}, priority ${priority})`);
    return task;
  }

  /**
   * Assign task to available agent
   */
  async assignTask(agentId: string): Promise<A2ATask | null> {
    try {
      // Find highest priority task
      for (let priority = 1; priority <= 5; priority++) {
        const queueKey = `${this.taskQueuePrefix}:queue:${priority}`;
        const taskJson = await this.redis.rpop(queueKey);

        if (taskJson) {
          const task = JSON.parse(taskJson);
          task.agent_id = agentId;
          task.status = 'assigned';
          task.assigned_at = new Date().toISOString();
          task.witness_chain.push(`[${new Date().toISOString()}] Task assigned to agent ${agentId}`);

          // Update task in Redis
          const taskKey = `${this.taskQueuePrefix}:${task.task_id}`;
          await this.redis.set(taskKey, JSON.stringify(task), 'EX', 3600);

          // Mark agent as busy
          const agentKey = `${this.agentRegistryPrefix}:${agentId}`;
          const agentJson = await this.redis.get(agentKey);
          if (agentJson) {
            const agent = JSON.parse(agentJson);
            agent.status = 'busy';
            agent.current_task = task.task_id;
            await this.redis.set(agentKey, JSON.stringify(agent), 'EX', 300);
          }

          console.log(`[A2A] Task assigned: ${task.task_id} → ${agentId}`);
          return task;
        }
      }

      return null;
    } catch (err) {
      console.error(`[A2A] Assign task failed: ${err}`);
      return null;
    }
  }

  /**
   * Update task progress
   */
  async updateTaskProgress(
    taskId: string,
    progress: { status: A2ATask['status']; result?: Record<string, unknown>; error?: string }
  ): Promise<void> {
    try {
      const taskKey = `${this.taskQueuePrefix}:${taskId}`;
      const taskJson = await this.redis.get(taskKey);

      if (!taskJson) {
        return;
      }

      const task = JSON.parse(taskJson);
      task.status = progress.status;

      if (progress.result) {
        task.result = progress.result;
      }

      if (progress.error) {
        task.error = progress.error;
      }

      task.witness_chain.push(
        `[${new Date().toISOString()}] Task ${progress.status}: ${progress.error || 'success'}`
      );

      if (progress.status === 'completed' || progress.status === 'failed') {
        task.completed_at = new Date().toISOString();

        // Mark agent as available
        if (task.agent_id) {
          const agentKey = `${this.agentRegistryPrefix}:${task.agent_id}`;
          const agentJson = await this.redis.get(agentKey);
          if (agentJson) {
            const agent = JSON.parse(agentJson);
            agent.status = 'available';
            agent.current_task = undefined;
            if (progress.status === 'completed') {
              agent.completed_tasks++;
            } else {
              agent.failed_tasks++;
            }
            await this.redis.set(agentKey, JSON.stringify(agent), 'EX', 300);
          }
        }
      }

      await this.redis.set(taskKey, JSON.stringify(task), 'EX', 3600);
      console.log(`[A2A] Task updated: ${taskId} → ${progress.status}`);
    } catch (err) {
      console.error(`[A2A] Update task progress failed: ${err}`);
    }
  }

  /**
   * Get task by ID
   */
  async getTask(taskId: string): Promise<A2ATask | null> {
    try {
      const taskKey = `${this.taskQueuePrefix}:${taskId}`;
      const taskJson = await this.redis.get(taskKey);
      return taskJson ? JSON.parse(taskJson) : null;
    } catch (err) {
      console.warn(`[A2A] Get task failed: ${err}`);
      return null;
    }
  }

  /**
   * Get agent status
   */
  async getAgent(agentId: string): Promise<A2AAgent | null> {
    try {
      const agentKey = `${this.agentRegistryPrefix}:${agentId}`;
      const agentJson = await this.redis.get(agentKey);
      return agentJson ? JSON.parse(agentJson) : null;
    } catch (err) {
      console.warn(`[A2A] Get agent failed: ${err}`);
      return null;
    }
  }

  /**
   * Get all active agents
   */
  async getActiveAgents(): Promise<A2AAgent[]> {
    try {
      const pattern = `${this.agentRegistryPrefix}:*`;
      const keys = await this.redis.keys(pattern);

      const agents: A2AAgent[] = [];
      for (const key of keys) {
        const agentJson = await this.redis.get(key);
        if (agentJson) {
          agents.push(JSON.parse(agentJson));
        }
      }

      return agents;
    } catch (err) {
      console.warn(`[A2A] Get active agents failed: ${err}`);
      return [];
    }
  }

  /**
   * Health check: refresh agent heartbeat
   */
  async heartbeat(agentId: string): Promise<boolean> {
    try {
      const agentKey = `${this.agentRegistryPrefix}:${agentId}`;
      const agentJson = await this.redis.get(agentKey);

      if (!agentJson) {
        return false; // Agent not registered
      }

      const agent = JSON.parse(agentJson);
      agent.heartbeat = new Date().toISOString();
      await this.redis.set(agentKey, JSON.stringify(agent), 'EX', 300);

      return true;
    } catch (err) {
      console.warn(`[A2A] Heartbeat failed: ${err}`);
      return false;
    }
  }
}
