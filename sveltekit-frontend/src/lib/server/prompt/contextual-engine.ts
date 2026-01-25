import type { UserProfile } from '$lib/server/db/schema/user-management';
import { db } from '$lib/server/db/unified-client'; // Unified client
import { users, userProfiles } from '$lib/server/db/schema/user-management';
import { eq } from 'drizzle-orm';

export interface ContextOptions {
    jurisdictionHint?: boolean;
    practiceAreasHint?: boolean;
    tone?: 'formal' | 'concise' | 'explanatory';
}

export async function buildUserContextPrompt(userId?: string, opts: ContextOptions = {}): Promise<string> {
    if (!userId) return '';
    try {
        const rows = await db
            .select()
            .from(users)
            .leftJoin(userProfiles, eq(users.id, userProfiles.userId))
            .where(eq(users.id, userId))
            .limit(1);

        if (!rows?.length) return '';

        const u = rows[0].users;
        const p = rows[0].user_profiles;

        const lines: string[] = ['You are assisting a legal professional. Personalize responses as appropriate.'];

        // @ts-ignore
        if (opts?.jurisdictionHint && u?.jurisdiction) {
            // @ts-ignore
            lines.push(`Primary jurisdiction: ${u.jurisdiction}.`);
        }

        // @ts-ignore
        if (opts?.practiceAreasHint && Array.isArray(u?.practiceAreas)) {
             // @ts-ignore
            lines.push(`Practice areas: ${u.practiceAreas.join(', ')}.`);
        }

        if (p?.experienceLevel) {
            lines.push(`Experience level: ${p.experienceLevel}.`);
        }

        if (p?.specializations?.length) {
            lines.push(`Specializations: ${p.specializations.join(', ')}.`);
        }

        if (opts.tone) {
            lines.push(`Use a ${opts.tone} tone.`);
        }

        return lines.join(' ');
    } catch {
        return '';
    }
}
