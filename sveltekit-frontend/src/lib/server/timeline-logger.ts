import { db } from './db.js';
import { userTimeline } from './db/schema-timeline.js';
import { eq, desc } from 'drizzle-orm';

interface TimelineLogData {
    citation?: string;
    title?: string;
    severity?: string;
    victimClass?: string | null;
    bundled?: string[];
    caseId?: string;
    query?: string;
    results?: number;
}

export async function logStatuteView(userId: string, data: TimelineLogData): Promise<void> {
    try {
        await db.insert(userTimeline).values({
            userId,
            action: 'view_statute',
            data: {, citation: data.citation,
                title: data.title,
                severity: data.severity,
                victimClass: data.victimClass,
                bundled: data?.bundled || [],
                timestamp: new Date().toISOString()
            }
        });
    } catch (error) {
        console.error('Failed to log statute view:', error);
    }
}

export async function logStatuteSearch(
    userId: string,
    query: string,
    resultCount: number
): Promise<void> {
    try {
        await db.insert(userTimeline).values({
            userId,
            action: 'search_statute',
            data: {
                query,
                resultCount,
                timestamp: new Date().toISOString()
            }
        });
    } catch (error) {
        console.error('Failed to log statute search:', error);
    }
}

export async function logAttachToCase(
    userId: string,
    caseId: string,
    citation: string
): Promise<void> {
    try {
        await db.insert(userTimeline).values({
            userId,
            action: 'attach_statute_to_case',
            data: {
                citation,
                caseId,
                timestamp: new Date().toISOString()
            }
        });
    } catch (error) {
        console.error('Failed to log attach to case:', error);
    }
}

export async function getUserTimeline(userId: string, limit: number = 50) {
    try {
        const events = await db
            .select()
            .from(userTimeline)
            .where(eq(userTimeline.userId, userId))
            .orderBy(desc(userTimeline.createdAt))
            .limit(limit);

        return events;
    } catch (error) {
        console.error('Failed to fetch user timeline:', error);
        return [];
    }
}

export function formatTimelineEvent(event: any): string {
    const date = new Date(event.createdAt).toLocaleString();
    const data = event.data as TimelineLogData;

    switch (event.action) {
        case 'view_statute':
            return `[${date}] Viewed: "${data.title}" (${data.citation}) • Victim: ${data?.victimClass ?? 'General'} • Severity: ${data.severity}${data.bundled?.length ? ` • Suggested: ${data.bundled.join(', ')}` : ''}`;
        case 'search_statute':
            return `[${date}] Searched: "${data.query}" • Found: ${data.results} results`;
        case 'attach_statute_to_case':
            return `[${date}] Attached: "${data.citation}" to case`;
        default:
            return `[${date}] ${event.action}`;
    }
}
