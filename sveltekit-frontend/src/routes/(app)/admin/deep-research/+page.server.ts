import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db/client';
import { ldrResearchTasks, ldrResearchResults, ldrSynthesis } from '$lib/server/db/schema-postgres';
import { eq, desc, sql } from 'drizzle-orm';

export const load: PageServerLoad = async ({ locals, url }) => {
  if (!locals.user?.id) {
    throw error(401, 'Unauthorized');
  }

  // Check admin role
  const user = await db.query.users.findFirst({
    where: (u, { eq: eqOp }) => eqOp(u.id, locals.user!.id),
  });

  if (!user || !['admin', 'prosecutor'].includes(user.role)) {
    throw error(403, 'Forbidden');
  }

  const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '50'), 100);
  const offset = parseInt(url.searchParams.get('offset') ?? '0');
  const status = url.searchParams.get('status');
  const userId = url.searchParams.get('userId');

  // Build query
  let query = db.select().from(ldrResearchTasks);

  if (status) {
    query = query.where(eq(ldrResearchTasks.status, status));
  }

  if (userId) {
    query = query.where(eq(ldrResearchTasks.userId, parseInt(userId)));
  }

  // Fetch tasks with counts
  const tasks = await query
    .orderBy(desc(ldrResearchTasks.createdAt))
    .limit(limit)
    .offset(offset);

  // For each task, fetch results and synthesis
  const tasksWithDetails = await Promise.all(
    tasks.map(async (task) => {
      const results = await db
        .select()
        .from(ldrResearchResults)
        .where(eq(ldrResearchResults.taskId, task.id))
        .orderBy(ldrResearchResults.rank);

      const synthesis = await db.query.ldrSynthesis.findFirst({
        where: (s, { eq: eqOp }) => eqOp(s.taskId, task.id),
      });

      return { ...task, results, synthesis };
    }),
  );

  // Get total count
  const [{ count: totalCount }] = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(ldrResearchTasks);

  // Get status distribution
  const [statusDistribution] = await db
    .select({
      status: ldrResearchTasks.status,
      count: sql<number>`COUNT(*)`,
    })
    .from(ldrResearchTasks)
    .groupBy(ldrResearchTasks.status);

  return {
    tasks: tasksWithDetails,
    totalCount,
    limit,
    offset,
    status,
    userId,
    statusDistribution,
  };
};

export const actions = {
  retryTask: async ({ request, locals }) => {
    if (!locals.user?.id) {
      return error(401, 'Unauthorized');
    }

    const formData = await request.formData();
    const taskId = formData.get('taskId') as string;

    if (!taskId) {
      return { error: 'Missing taskId' };
    }

    // Reset task status to pending
    await db
      .update(ldrResearchTasks)
      .set({
        status: 'pending',
        errorMessage: null,
        updatedAt: new Date(),
      })
      .where(eq(ldrResearchTasks.id, taskId));

    return { success: true };
  },

  deleteTask: async ({ request, locals }) => {
    if (!locals.user?.id) {
      return error(401, 'Unauthorized');
    }

    const formData = await request.formData();
    const taskId = formData.get('taskId') as string;

    if (!taskId) {
      return { error: 'Missing taskId' };
    }

    // Delete task (cascade will delete results, synthesis, etc.)
    await db.delete(ldrResearchTasks).where(eq(ldrResearchTasks.id, taskId));

    return { success: true };
  },
};
