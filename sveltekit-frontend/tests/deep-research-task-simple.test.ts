import { describe, it, expect, beforeAll } from 'vitest';
import { db } from '$lib/server/db/client';
import { ldrResearchTasks } from '$lib/server/db/schema-postgres';
import { eq } from 'drizzle-orm';

describe('Deep Research Task Database - Simple Verification', () => {
  let testTaskId: string;

  it('should verify ldr_research_tasks table exists and is accessible', async () => {
    const query = 'Test query for deep research';
    const queryHash = Buffer.from(query).toString('base64').substring(0, 64);

    // Create a simple task
    const [createdTask] = await db
      .insert(ldrResearchTasks)
      .values({
        userId: 1,
        query,
        queryHash,
        status: 'pending',
      })
      .returning();

    testTaskId = createdTask.id;

    expect(createdTask).toBeDefined();
    expect(createdTask.id).toMatch(/^[0-9a-f-]{36}$/); // UUID format
    expect(createdTask.status).toBe('pending');
    expect(createdTask.query).toBe(query);
  });

  it('should verify task can be retrieved', async () => {
    if (!testTaskId) {
      throw new Error('Test task ID not set');
    }

    const retrievedTask = await db.query.ldrResearchTasks.findFirst({
      where: eq(ldrResearchTasks.id, testTaskId),
    });

    expect(retrievedTask).toBeDefined();
    expect(retrievedTask?.id).toBe(testTaskId);
    expect(retrievedTask?.status).toBe('pending');
  });

  it('should verify task can be updated', async () => {
    if (!testTaskId) {
      throw new Error('Test task ID not set');
    }

    const now = new Date();
    const [updatedTask] = await db
      .update(ldrResearchTasks)
      .set({
        status: 'completed',
        completedAt: now,
        mlScore: 0.95,
      })
      .where(eq(ldrResearchTasks.id, testTaskId))
      .returning();

    expect(updatedTask.status).toBe('completed');
    expect(updatedTask.mlScore).toBe(0.95);
  });

  it('should verify task can be deleted', async () => {
    if (!testTaskId) {
      throw new Error('Test task ID not set');
    }

    await db.delete(ldrResearchTasks).where(eq(ldrResearchTasks.id, testTaskId));

    const deletedTask = await db.query.ldrResearchTasks.findFirst({
      where: eq(ldrResearchTasks.id, testTaskId),
    });

    expect(deletedTask).toBeUndefined();
  });
});
