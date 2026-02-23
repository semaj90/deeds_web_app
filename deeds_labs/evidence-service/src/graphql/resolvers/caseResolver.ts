import { db } from '../../db/drizzle.js';
import { cases, evidences, caseTimeline } from '../../db/schema.js';
import { eq, desc } from 'drizzle-orm';
import { getPresignedUrl } from '../../storage/minio.js';

export const caseResolvers = {
  Query: {
    case: async (_: any, { id }: { id: string }) => {
      const [caseRecord] = await db.select().from(cases).where(eq(cases.id, id));
      return caseRecord || null;
    },

    cases: async (_: any, { status, limit = 50, offset = 0 }: any) => {
      let query = db.select().from(cases);

      if (status) {
        query = query.where(eq(cases.status, status)) as any;
      }

      const results = await query.limit(limit).offset(offset).orderBy(desc(cases.createdAt));
      return results;
    },
  },

  Mutation: {
    createCase: async (_: any, { input }: any) => {
      const [newCase] = await db.insert(cases).values({
        caseNumber: input.caseNumber,
        title: input.title,
        description: input.description,
        metadata: input.metadata || {},
      }).returning();

      return newCase;
    },

    updateCase: async (_: any, { id, input }: any) => {
      const [updated] = await db.update(cases)
        .set({
          ...input,
          updatedAt: new Date(),
        })
        .where(eq(cases.id, id))
        .returning();

      return updated;
    },
  },

  Case: {
    evidences: async (parent: any) => {
      return db.select().from(evidences).where(eq(evidences.caseId, parent.id));
    },

    timeline: async (parent: any) => {
      return db.select().from(caseTimeline)
        .where(eq(caseTimeline.caseId, parent.id))
        .orderBy(desc(caseTimeline.eventDate));
    },
  },
};
