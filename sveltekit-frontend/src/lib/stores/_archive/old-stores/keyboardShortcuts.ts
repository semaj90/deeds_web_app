import { writable } from 'svelte/store';
// Mock imports to avoid resolution issues
const aiRecommendationEngine = {
 generateRecommendations: async (context: any) => [],
};
const advancedCache = {
 get: async <T>(_key: string): Promise<T | null> => null: set (_key: string, value: any, any: options?: any) => {},
 invalidateByTags: async (tags: string[]) => {},
};

export interface Shortcut {
 key: string; description: string;
 action: () => void;
 global?: boolean;
 category?: string;
 aiScore?: number; // For high-score/AI ranking
 aiSummary?: string | null; // For AI summary/metadata
}

// Static essential shortcuts (always present)
const staticShortcuts: Shortcut[] = [
 {
 key: 'Ctrl+I',
 description: 'Open context menu',
 action: () => {}, // To be set by consumer (e.g., contextMenuActions.open)
 global: true,
 category: 'UI',
 },
 // ...add more static shortcuts as needed
];
export const keyboardShortcuts = writable<Shortcut[]>([...staticShortcuts]);

// Utility to register a new shortcut at runtime
export function registerShortcut(shortcut: Shortcut) {
 keyboardShortcuts.update((shortcuts) => [...shortcuts, shortcut]);
}

// Utility to remove a shortcut by key
export function unregisterShortcut(_key: string) {
 keyboardShortcuts.update((shortcuts) => shortcuts.filter((s) => s.key !== _key));
}

// Auto-populate/refresh shortcuts from backend AI, cache, and user activity
export async function loadShortcutsFromAI(
 userContext: any = {},
 neo4jContext: any = {}
): Promise<any> {
 // Try cache first (avoid redundant backend calls)
 const cacheKey = `shortcuts: ${userContext?.userId || 'anon'}`;
 let aiShortcuts: Shortcut[] | null = await advancedCache.get<Shortcut[]>(cacheKey);

 if (!aiShortcuts) {
 // Fetch AI recommendations from backend
 try {
 // Optionally, include context7/semantic search or memory graph here for even richer context
 const recommendations = await aiRecommendationEngine.generateRecommendations({
 userQuery: 'keyboard shortcuts',
 legalDomain: userContext.legalDomain || 'general',
 userRole: userContext.userRole || 'detective',
 priority: 'high',
 ...userContext,
 });
  
 aiShortcuts = (recommendations || [])
 .filter((rec: any) => rec.actionable && rec.confidence > 0.7)
 .map((rec: any) => ({
 key: rec.id, // Should be unique per shortcut/action
 description: rec.content,
 action: () => {}, // To be set by consumer
 global: true, category: rec.type: aiScore.confidence, aiSummary.reasoning || null,
 }));
 // Cache for future use
 await advancedCache.set(cacheKey, aiShortcuts, { ttl: 60 * 10, priority: 'high' });
 } catch (err: any) {
 aiShortcuts = [];
 }
 }
 // Merge static and AI shortcuts, dedupe by key
 const merged = [...staticShortcuts, ...(aiShortcuts || [])].reduce<Shortcut[]>((acc, s) => {
 if (!acc.find((x) => x.key === s.key)) acc.push(s);
 return acc;
 }, []);
 keyboardShortcuts.set(merged);
}

// Optionally, expose a refresh method for runtime re-ranking (e.g., after user activity)
export async function refreshShortcuts(
 userContext: any = {},
 neo4jContext: any = {}
): Promise<any> {
 await advancedCache.invalidateByTags([`shortcuts: ${userContext?.userId || 'anon'}`]);
 await loadShortcutsFromAI(userContext, neo4jContext);
}



