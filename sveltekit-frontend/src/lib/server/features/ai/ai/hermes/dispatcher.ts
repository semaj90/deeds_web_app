/**
 * Hermes Dispatcher
 * 
 * Orchestrates the execution of Hermes Skills by resolving them 
 * into primitive Tool calls.
 */

import { STABLE_TOOLS } from '../../../../ai/hermes/tools/registry.js';
import { HERMES_SKILLS, type SkillRecipe } from '../../../../ai/hermes/skills/registry.js';
import { db } from '$lib/server/db/client';
import { kagDagRuns, kagDagNodes } from '$lib/server/db/schema';
import { sql } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';

export interface ToolResult {
  tool: string;
  ok: boolean;
  data: any;
  durationMs: number;
  error?: string;
}

export interface SkillResult {
  skillId: string;
  ok: boolean;
  toolResults: ToolResult[];
  totalDurationMs: number;
}

export class HermesDispatcher {
  /**
   * Executes a specific skill by its ID.
   */
  async executeSkill(skillId: string, input: any, ctx: any): Promise<SkillResult> {
    const t0 = performance.now();
    const recipe = HERMES_SKILLS[skillId];
    const runId = ctx.runId || uuidv4();

    if (!recipe) {
      return {
        skillId,
        ok: false,
        toolResults: [],
        totalDurationMs: 0
      };
    }

    // Initialize run if not provided (standalone skill call)
    if (!ctx.runId) {
      await db.insert(kagDagRuns).values({
        id: runId,
        query: input.query || skillId,
        queryHash: input.queryHash || 'skill-' + skillId,
        status: 'running',
        model: 'hermes-dispatcher',
        metadata: { 
          skillId, 
          input,
          parentTaskId: ctx.parentTaskId,
          runId: ctx.runId // Original runId if it existed
        }
      }).catch(e => console.error('Failed to log kagDagRun:', e));
    }

    const toolResults: ToolResult[] = [];

    const resolveToolArgs = (toolReq: SkillRecipe['tools'][number]) => {
      if (!toolReq.args) return {};
      return typeof toolReq.args === 'function'
        ? toolReq.args({ ...input, ...ctx, results: toolResults })
        : toolReq.args;
    };

    if (recipe.parallel) {
      // Parallel execution
      const promises = recipe.tools.map(async (toolReq, idx) => {
        const toolStart = performance.now();
        const toolDef = STABLE_TOOLS[toolReq.name];
        const nodeKey = `${skillId}:${toolReq.name}:${idx}`;

        if (!toolDef) {
          const tr = { tool: toolReq.name, ok: false, data: null, durationMs: 0, error: `Tool ${toolReq.name} not found` };
          await db.insert(kagDagNodes).values({ runId, nodeKey, nodeType: 'tool', status: 'failed', error: { message: tr.error } }).catch(() => {});
          return tr;
        }

        try {
          const args = resolveToolArgs(toolReq);
          const data = await toolDef.handler(args, ctx);
          const duration = performance.now() - toolStart;
          const tr = { tool: toolReq.name, ok: true, data, durationMs: duration };
          await db.insert(kagDagNodes).values({ runId, nodeKey, nodeType: 'tool', input: args, output: { result: 'success' }, status: 'completed', durationMs: Math.round(duration), finishedAt: new Date() }).catch(() => {});
          return tr;
        } catch (err: any) {
          const duration = performance.now() - toolStart;
          const tr = { tool: toolReq.name, ok: false, data: null, durationMs: duration, error: err.message || String(err) };
          await db.insert(kagDagNodes).values({ runId, nodeKey, nodeType: 'tool', status: 'failed', durationMs: Math.round(duration), error: { message: tr.error }, finishedAt: new Date() }).catch(() => {});
          return tr;
        }
      });
      toolResults.push(...(await Promise.all(promises)));
    } else {
      // Sequential execution
      for (const toolReq of recipe.tools) {
        const toolStart = performance.now();
        const toolDef = STABLE_TOOLS[toolReq.name];
        const nodeKey = `${skillId}:${toolReq.name}:${toolResults.length}`;

        if (!toolDef) {
          const tr = { tool: toolReq.name, ok: false, data: null, durationMs: 0, error: `Tool ${toolReq.name} not found` };
          toolResults.push(tr);
          await db.insert(kagDagNodes).values({ runId, nodeKey, nodeType: 'tool', status: 'failed', error: { message: tr.error } }).catch(() => {});
          if (recipe.stopOnFailure) break;
          continue;
        }

        try {
          const args = resolveToolArgs(toolReq);
          const data = await toolDef.handler(args, ctx);
          const duration = performance.now() - toolStart;
          
          toolResults.push({ tool: toolReq.name, ok: true, data, durationMs: duration });

          await db.insert(kagDagNodes).values({ runId, nodeKey, nodeType: 'tool', input: args, output: { result: 'success' }, status: 'completed', durationMs: Math.round(duration), finishedAt: new Date() }).catch(() => {});
        } catch (err: any) {
          const duration = performance.now() - toolStart;
          const tr = { tool: toolReq.name, ok: false, data: null, durationMs: duration, error: err.message || String(err) };
          toolResults.push(tr);

          await db.insert(kagDagNodes).values({ runId, nodeKey, nodeType: 'tool', status: 'failed', durationMs: Math.round(duration), error: { message: err.message || String(err) }, finishedAt: new Date() }).catch(() => {});
          if (recipe.stopOnFailure) break;
        }
      }
    }

    const totalDurationMs = performance.now() - t0;
    const ok = toolResults.every(r => r.ok);

    // Update run status if this was the root call
    if (!ctx.runId) {
      await db.update(kagDagRuns)
        .set({ 
          status: ok ? 'completed' : 'failed',
          totalDurationMs: Math.round(totalDurationMs),
          finishedAt: new Date()
        })
        .where(sql`${kagDagRuns.id} = ${runId}`).catch(() => {});
    }

    return {
      skillId,
      ok,
      toolResults,
      totalDurationMs
    };
  }

  /**
   * Executes a batch of skills.
   */
  async executeBatch(skills: Array<{ id: string; input: any }>, ctx: any): Promise<SkillResult[]> {
    const t0 = performance.now();
    const runId = uuidv4();

    // Log the entire batch as one run
    await db.insert(kagDagRuns).values({
      id: runId,
      query: 'Batch Execution',
      queryHash: 'batch-' + Date.now(),
      status: 'running',
      model: 'hermes-dispatcher',
      metadata: { skillCount: skills.length }
    }).catch(() => {});

    const results = await Promise.all(
      skills.map(s => this.executeSkill(s.id, s.input, { ...ctx, runId }))
    );

    const ok = results.every(r => r.ok);
    await db.update(kagDagRuns)
      .set({ 
        status: ok ? 'completed' : 'failed',
        totalDurationMs: Math.round(performance.now() - t0),
        finishedAt: new Date()
      })
      .where(sql`${kagDagRuns.id} = ${runId}`).catch(() => {});

    return results;
  }
}

export const hermesDispatcher = new HermesDispatcher();
