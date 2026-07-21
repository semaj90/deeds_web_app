import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { db } from '$lib/server/db/client';
import { ldrResearchTasks, ldrResearchResults, ldrSynthesis, deepResearchAuditLog } from '$lib/server/db/schema-postgres';
import { eq } from 'drizzle-orm';

describe('Deep Research Task API', () => {
  let testTaskId: string;
  let testCaseId: string;

  beforeAll(async () => {
    // Create a test task
    testCaseId = 'test-case-' + Date.now();
  });

  afterAll(async () => {
    // Cleanup: delete test task and related records (cascade will handle results/synthesis)
    if (testTaskId) {
      await db.delete(ldrResearchTasks).where(eq(ldrResearchTasks.id, testTaskId));
    }
  });

  it('should create a deep research task', async () => {
    const query = 'What are the key requirements for evidence admissibility?';
    const queryHash = Buffer.from(query).toString('base64').substring(0, 64);

    const [insertedTask] = await db
      .insert(ldrResearchTasks)
      .values({
        userId: 1, // Assuming user 1 exists
        caseId: testCaseId,
        query,
        queryHash,
        status: 'pending',
        rankModel: 'xgboost',
        includeWebSearch: true,
        includeLdr: true,
        topK: 5,
      })
      .returning();

    testTaskId = insertedTask.id;

    expect(insertedTask).toBeDefined();
    expect(insertedTask.status).toBe('pending');
    expect(insertedTask.query).toBe(query);
    expect(insertedTask.rankModel).toBe('xgboost');
  });

  it('should insert research results for a task', async () => {
    if (!testTaskId) {
      throw new Error('Test task ID not set');
    }

    const results = [
      {
        taskId: testTaskId,
        rank: 1,
        candidateId: 'qdrant-chunk-001',
        source: 'qdrant' as const,
        title: 'Evidence Admissibility Standards',
        text: 'Evidence is admissible if it is relevant and probative...',
        url: 'https://example.com/evidence-standards',
        upstreamScore: 0.95,
        mlScore: 0.92,
        finalScore: 0.93,
      },
      {
        taskId: testTaskId,
        rank: 2,
        candidateId: 'web-result-002',
        source: 'web' as const,
        title: 'Federal Rules of Evidence',
        text: 'Rule 401 defines relevant evidence as...',
        url: 'https://www.law.cornell.edu/rules/fre/401',
        upstreamScore: 0.85,
        mlScore: 0.88,
        finalScore: 0.87,
      },
      {
        taskId: testTaskId,
        rank: 3,
        candidateId: 'ldr-research-003',
        source: 'ldr' as const,
        title: 'Recent Case Law on Evidence',
        text: 'In the case of X v. Y, the court ruled...',
        url: null,
        upstreamScore: 0.78,
        mlScore: 0.81,
        finalScore: 0.80,
      },
    ];

    const insertedResults = await db
      .insert(ldrResearchResults)
      .values(results)
      .returning();

    expect(insertedResults).toHaveLength(3);
    expect(insertedResults[0].rank).toBe(1);
    expect(insertedResults[0].mlScore).toBe(0.92);
    expect(insertedResults[2].source).toBe('ldr');
  });

  it('should insert synthesis output', async () => {
    if (!testTaskId) {
      throw new Error('Test task ID not set');
    }

    const synthesis = {
      taskId: testTaskId,
      synthesisText:
        'Evidence is admissible in court if it is relevant and probative. ' +
        'Federal Rules of Evidence Rule 401 defines relevant evidence as evidence having any tendency to make the existence of any fact more or less probable. ' +
        'Recent case law has reinforced these standards while allowing for limited exceptions in specialized circumstances.',
      model: 'gemma4-legal-iq4xs',
      confidence: 0.89,
      citedResultIds: 'qdrant-chunk-001,web-result-002,ldr-research-003',
      keyFindings: [
        'Evidence must be relevant to the issue at hand',
        'Probative value must outweigh prejudicial effect',
        'Hearsay exceptions exist under specific circumstances',
        'Expert testimony requires qualification and reliability',
      ],
    };

    const [insertedSynthesis] = await db
      .insert(ldrSynthesis)
      .values(synthesis)
      .returning();

    expect(insertedSynthesis).toBeDefined();
    expect(insertedSynthesis.taskId).toBe(testTaskId);
    expect(insertedSynthesis.confidence).toBe(0.89);
    expect(insertedSynthesis.keyFindings).toHaveLength(4);
  });

  it('should update task status to completed', async () => {
    if (!testTaskId) {
      throw new Error('Test task ID not set');
    }

    const now = new Date();
    const [updatedTask] = await db
      .update(ldrResearchTasks)
      .set({
        status: 'completed',
        completedAt: now,
        durationMs: 45000,
        mlScore: 0.87,
        totalCandidates: 150,
        updatedAt: now,
      })
      .where(eq(ldrResearchTasks.id, testTaskId))
      .returning();

    expect(updatedTask.status).toBe('completed');
    expect(updatedTask.durationMs).toBe(45000);
    expect(updatedTask.mlScore).toBe(0.87);
  });

  it('should log audit events', async () => {
    if (!testTaskId) {
      throw new Error('Test task ID not set');
    }

    const auditEvents = [
      {
        userId: 1,
        taskId: testTaskId,
        action: 'task_created',
        details: { rankModel: 'xgboost', topK: 5 },
        success: true,
      },
      {
        userId: 1,
        taskId: testTaskId,
        action: 'results_ranked',
        details: { resultCount: 3, averageScore: 0.87 },
        durationMs: 2500,
        success: true,
      },
      {
        userId: 1,
        taskId: testTaskId,
        action: 'synthesis_generated',
        details: { model: 'gemma4-legal-iq4xs', confidence: 0.89 },
        durationMs: 12000,
        success: true,
      },
    ];

    const insertedEvents = await db
      .insert(deepResearchAuditLog)
      .values(auditEvents)
      .returning();

    expect(insertedEvents).toHaveLength(3);
    expect(insertedEvents[0].action).toBe('task_created');
    expect(insertedEvents[1].durationMs).toBe(2500);
    expect(insertedEvents[2].success).toBe(true);
  });

  it('should retrieve task with related results and synthesis', async () => {
    if (!testTaskId) {
      throw new Error('Test task ID not set');
    }

    const taskWithDetails = await db.query.ldrResearchTasks.findFirst({
      where: eq(ldrResearchTasks.id, testTaskId),
      with: {
        results: {
          orderBy: (r) => r.rank,
        },
        synthesis: true,
      },
    });

    expect(taskWithDetails).toBeDefined();
    expect(taskWithDetails?.results).toHaveLength(3);
    expect(taskWithDetails?.synthesis).toBeDefined();
    expect(taskWithDetails?.synthesis?.keyFindings).toHaveLength(4);
  });

  it('should handle cascading deletes correctly', async () => {
    // Create a temporary task to test cascade delete
    const tempQuery = 'Temp test query';
    const tempQueryHash = Buffer.from(tempQuery).toString('base64').substring(0, 64);

    const [tempTask] = await db
      .insert(ldrResearchTasks)
      .values({
        userId: 1,
        caseId: 'temp-case-' + Date.now(),
        query: tempQuery,
        queryHash: tempQueryHash,
        status: 'pending',
      })
      .returning();

    const tempTaskId = tempTask.id;

    // Insert a result for this task
    await db.insert(ldrResearchResults).values({
      taskId: tempTaskId,
      rank: 1,
      candidateId: 'temp-result-001',
      source: 'qdrant',
      text: 'Temporary result',
      upstreamScore: 0.8,
      mlScore: 0.85,
      finalScore: 0.83,
    });

    // Delete the task
    await db.delete(ldrResearchTasks).where(eq(ldrResearchTasks.id, tempTaskId));

    // Verify both task and result are deleted
    const deletedTask = await db.query.ldrResearchTasks.findFirst({
      where: eq(ldrResearchTasks.id, tempTaskId),
    });

    const deletedResults = await db
      .select()
      .from(ldrResearchResults)
      .where(eq(ldrResearchResults.taskId, tempTaskId));

    expect(deletedTask).toBeUndefined();
    expect(deletedResults).toHaveLength(0);
  });
});
