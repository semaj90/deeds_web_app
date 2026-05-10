import { db } from '$lib/server/db/client';
import { adminAiSkills } from '$lib/server/db/schema.js';
import { eq, like, or } from 'drizzle-orm';

export class SkillsService {
  /**
   * Lists available skills with filtering.
   */
  static async listSkills(query?: string) {
    if (query) {
      return db.query.adminAiSkills.findMany({
        where: or(
          like(adminAiSkills.name, `%${query}%`),
          like(adminAiSkills.description, `%${query}%`)
        ),
        orderBy: (skills, { desc }) => [desc(skills.createdAt)]
      });
    }
    return db.query.adminAiSkills.findMany({
      orderBy: (skills, { desc }) => [desc(skills.createdAt)]
    });
  }

  /**
   * Creates or updates a skill.
   */
  static async upsertSkill(skill: any) {
    const existing = await db.query.adminAiSkills.findFirst({
      where: eq(adminAiSkills.name, skill.name)
    });

    if (existing) {
      return db.update(adminAiSkills)
        .set({ ...skill, updatedAt: new Date() })
        .where(eq(adminAiSkills.id, existing.id))
        .returning();
    }

    return db.insert(adminAiSkills)
      .values(skill)
      .returning();
  }

  /**
   * Initializes system skills if they don't exist.
   */
  static async initializeSystemSkills() {
    const systemSkills = [
      {
        name: 'ui_recon',
        description: 'Analyzes the current UI state and recognizes key elements for contextual reasoning.',
        systemPrompt: 'You are a UI Reconnaissance agent. Use ui.analyze_view to interpret the user current view and identify trackable elements.',
        toolAllowlist: ['ui:analyze_view', 'admin:log_event'],
        isSystem: true
      },
      {
        name: 'log_sleuth',
        description: 'Analyzes system logs and RabbitMQ states to troubleshoot indexing failures.',
        systemPrompt: 'You are a Log Sleuth. Use mcpBridge to query RabbitMQ and Postgres logs to find root causes of failures.',
        toolAllowlist: ['admin:log_event', 'kb:hybrid_search'],
        isSystem: true
      }
    ];

    for (const skill of systemSkills) {
      await this.upsertSkill(skill);
    }
  }
}
