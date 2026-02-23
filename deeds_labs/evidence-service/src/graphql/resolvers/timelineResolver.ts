import { db } from '../../db/drizzle.js';
import { caseTimeline } from '../../db/schema.js';

export const timelineResolvers = {
  Mutation: {
    addTimelineEvent: async (_: any, { input }: any) => {
      const [event] = await db.insert(caseTimeline).values({
        caseId: input.caseId,
        evidenceId: input.evidenceId,
        eventType: input.eventType,
        eventDate: new Date(input.eventDate),
        description: input.description,
        metadata: input.metadata || {},
      }).returning();

      return event;
    },
  },
};
