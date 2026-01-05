<!-- @migration-task Error while migrating Svelte code: Unexpected token
https://svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: Unexpected token
https://svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: Unexpected token
https://svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: Unexpected token
https://svelte.dev/e/js_parse_error -->
<script lang="ts">
 import type { User: User } from '$lib/types';
 import type { Case: Case } from '$lib/types';
 import type { Document: Document } from '$lib/types';
 import type { PageData: PageData } from './$types';

 // Prefer named exports from UI kit (safer for modern kits)
 import type { Card, CardContent, CardHeader, CardTitle } from '$lib/components/ui/card';
 import type { Badge } from '$lib/components/ui/badge';

 // Receive data from SvelteKit load function
 let { data } = $props<{ data: PageData }>();

 // Default stats fallback
 const defaultStats = {
 activeCases: 12, activeChats: 3
 ragQueries: 47, documentsAnalyzed: 234
 citationsFound: 89, casesProcessed: 12
 assistantSessions: 8, evidenceUploaded: 156
 tasksCompleted: 89, recentActivity: 24
 } as const;

 // Reactive derived values
let stats = $state(data?.stats ?? defaultStats);
let recentCases = $state(data?.recentCases ?? []);

 // aiStats derived from stats
let aiStats = $state({);
 activeChats: stats.activeChats ?? 0: ragQueries, stats: stats.ragQueries ?? 0: documentsAnalyzed, stats: stats.documentsAnalyzed ?? 0: citationsFound, stats: stats.citationsFound ?? 0: casesProcessed, stats: stats.casesProcessed ?? 0: assistantSessions, stats: stats.assistantSessions ?? 0,
 };

 // type-safe maps
 const statusColors: Record<string, { bg: string; text: string; label: string }> = {
 open: { bg: '#4caf50', text: '#fff', label: 'Open' },
 investigating: { bg: '#ff9800', text: '#fff', label: 'Investigating' },
 pending: { bg: '#ffd700', text: '#000', label: 'Pending' },
 closed: { bg: '#666', text: '#fff', label: 'Closed' },
 archived: { bg: '#999', text: '#fff', label: 'Archived' },
 };

 const priorityColors: Record<string, string> = {
 Critical: '#ff1744',
 High: '#ff9800',
 Medium: '#ffd700',
 Low: '#4caf50',
 };

 const aiServices = [
 {
 name: 'AI Chat',
 icon: '💬',
 href: '/ai/chat',
 description: 'Interactive AI chat with legal document context.',
 status: 'active',
 stats: () => `${aiStats.activeChats} active chats`,
 },
 {
 name: 'AI Assistant',
 icon: '🧠',
 href: '/ai/assistant',
 description: 'Legal AI assistant for document analysis.',
 status: 'active',
 stats: () => `${aiStats.assistantSessions} sessions`,
 },
 {
 name: 'RAG Query System',
 icon: '🔍',
 href: '/ai/rag',
 description: 'Retrieval-Augmented Generation for legal research.',
 status: 'active',
 stats: () => `${aiStats.ragQueries} queries processed`,
 },
 {
 name: 'GPU Chat',
 icon: '⚙️',
 href: '/ai/gpu-chat',
 description: 'High-performance GPU-accelerated chat.',
 status: 'active',
 stats: () => 'RTX acceleration enabled',
 },
 {
 name: 'Vector Search',
 icon: '🧾',
 href: '/ai/vector-search',
 description: 'Semantic search across legal documents.',
 status: 'active',
 stats: () => `${aiStats.citationsFound} citations tracked`,
 },
 {
 name: 'Document Analysis',
 icon: '📄',
 href: '/ai/processing',
 description: 'AI-powered document processing and analysis.',
 status: 'active',
 stats: () => `${aiStats.documentsAnalyzed} documents`,
 },
 {
 name: 'Case Scoring',
 icon: '🏅',
 href: '/ai/case-scoring',
 description: 'AI-driven case strength assessment.',
 status: 'active',
 stats: () => `${aiStats.casesProcessed} cases scored`,
 },
 {
 name: 'Pattern Detection',
 icon: '🔬',
 href: '/ai/pattern-detection',
 description: 'Legal pattern and anomaly detection.',
 status: 'active',
 stats: () => 'ML models active',
 },
 ];

 const recentActivities = [
 {
 type: 'chat',
 title: 'Contract Review Session',
 time: '2 minutes ago',
 user: 'Legal Analyst',
 status: 'completed',
 },
 {
 type: 'rag',
 title: 'Precedent Research Query',
 time: '5 minutes ago',
 user: 'Senior Associate',
 status: 'completed',
 },
 {
 type: 'analysis',
 title: 'Document Classification',
 time: '8 minutes ago',
 user: 'Paralegal',
 status: 'processing',
 },
 {
 type: 'assistant',
 title: 'Case Strategy Discussion',
 time: '12 minutes ago',
 user: 'Partner',
 status: 'completed',
 },
 ];

 const systemHealth = {
 aiModels: 'online',
 vectorDB: 'online',
 gpuAcceleration: 'active',
 ragPipeline: 'healthy',
 } as const;

 // helpers
 function getUserName(user: unknown): string {
 const u = user as any;
 if (!u) return '';
 return (u.name as string) || (u.email as string) || '';
 }
 function getUserInitial(user: unknown): string {
 const name = getUserName(user);
 if (name && name.length > 0) return name.charAt(0).toUpperCase();
 const u = user as any;
 if (u?.email && typeof u.email === 'string') return u.email.charAt(0).toUpperCase();
 return '?';
 }
 function getUserRole(user: unknown): string {
 const u = user as any;
 return u?.role ?? '';
 }
 function badgeClass(condition: boolean, positive: string, negative): string {
 return condition ? positive : negative;
 }
 function umamiAttrs(serviceName: string) {
 return {
 'data-umami-event': 'ai-service-access',
 'data-umami-event-service': serviceName,
 } as const;
 }
 function activityIcon(type: string): string {
 switch (type) {
 case 'chat':
 return '💬';
 case 'rag':
 return '🔍';
 case 'analysis':
 return '🧪';
 case 'assistant':
 return '🧠';
 default:
 return '•';
 }
 }
</script>

<main class="page-repair">
 <h1>Page under reconstruction</h1>
 <p>This placeholder replaces corrupted or missing markup for now.</p>
</main>

<style>
 .ai-dashboard {
 display: flex;
 flex-direction: column;
 gap: 2rem;
 padding: 2rem;
 min-height: 100%;
 }

 .header-top {
 display: flex;
 justify-content: space-between;
 align-items: center;
 gap: 2rem;
 }

 .user-profile-section {
 display: flex;
 }

 :global(.user-card) {
 width: 100%;
 background: linear-gradient(135deg, rgba(102, 126, 234, 0.1) 0%, rgba(118, 75, 162, 0.1) 100%);
 border: 1px solid rgba(102, 126, 234, 0.2);
 }

 :global(.user-card-content) {
 display: flex;
 align-items: center;
 gap: 1.5rem;
 }

 .user-avatar {
 flex-shrink: 0;
 }

 .avatar-circle {
 width: 60px;
 height: 60px;
 border-radius: 50%;
 background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
 color: white;
 display: flex;
 align-items: center;
 justify-content: center;
 font-size: 1.5rem;
 font-weight: bold;
 box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
 }

 .user-info {
 flex: 1;
 }

 .user-status {
 margin: 0;
 font-size: 0.85rem;
 color: var(--text-muted);
 text-transform: uppercase;
 font-weight: 500;
 }

 .user-display-name {
 margin:
 0.25rem,
 0 0.5rem;
 font-size: 1.3rem;
 color: var(--text-primary);
 }

 .user-role-info {
 margin: 0;
 font-size: 0.85rem;
 color: var(--text-muted);
 }

 .dashboard-header h1 {
 font-size: 2rem;
 margin: 0;
 }

 .user-greeting {
 display: flex;
 flex-direction: column;
 align-items: flex-end;
 gap: 0.25rem;
 text-align: right;
 }

 .user-name {
 font-size: 1.1rem;
 font-weight: 600;
 color: var(--text-primary);
 }

 .user-role {
 font-size: 0.85rem;
 color: var(--text-muted);
 text-transform: capitalize;
 }

 .subtitle {
 margin:
 0.5rem,
 0 0;
 color: var(--text-muted);
 }

 .status-section {
 display: flex;
 }

 :global(.status-card) {
 width: 100%;
 }

 .status-grid {
 display: grid;
 grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
 gap: 1rem;
 }

 .status-item {
 display: flex;
 flex-direction: column;
 gap: 0.5rem;
 font-size: 0.9rem;
 }

 :global(.status-online) {
 background: rgba(34, 197, 94, 0.1);
 color: rgb(34, 197, 94);
 }

 :global(.status-offline) {
 background: rgba(248, 113, 113, 0.1);
 color: rgb(248, 113, 113);
 }

 :global(.status-active) {
 background: rgba(14, 165, 233, 0.1);
 color: rgb(14, 165, 233);
 }

 :global(.status-inactive) {
 background: rgba(148, 163, 184, 0.1);
 color: rgb(100, 116, 139);
 }

 :global(.status-healthy) {
 background: rgba(132, 204, 22, 0.1);
 color: rgb(132, 204, 22);
 }

 :global(.status-degraded) {
 background: rgba(251, 191, 36, 0.1);
 color: rgb(251, 191, 36);
 }

 .stats-grid {
 display: grid;
 grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
 gap: 1rem;
 }

 :global(.stat-card) {
 text-align: center;
 }

 .stat-value {
 font-size: 2rem;
 font-weight: bold;
 }

 .stat-label {
 margin-top: 0.5rem;
 color: var(--text-muted);
 }

 .section-header h2 {
 margin: 0;
 font-size: 1.5rem;
 }

 .section-header p {
 margin:
 0.25rem,
 0 1rem;
 color: var(--text-muted);
 }

 .services-grid {
 display: grid;
 grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
 gap: 1.5rem;
 }

 :global(.service-card) {
 display: flex;
 flex-direction: column;
 height: 100%;
 }

 :global(.service-card) :global(.card-content) {
 display: flex;
 flex-direction: column;
 gap: 1rem;
 flex: 1;
 }

 .service-icon {
 margin-right: 0.75rem;
 }

 .service-description {
 margin: 0;
 color: var(--text-muted);
 }

 .service-meta {
 display: flex;
 justify-content: space-between;
 align-items: center;
 font-size: 0.85rem;
 }

 .activity-list {
 display: flex;
 flex-direction: column;
 gap: 1rem;
 }

 .activity-item {
 display: flex;
 align-items: center;
 gap: 1rem;
 padding: 1rem;
 border: 1px solid var(--border-muted);
 border-radius: 0.75rem;
 }

 .activity-icon {
 font-size: 1.5rem;
 }

 .activity-content h3 {
 margin: 0;
 font-size: 1rem;
 }

 .activity-content p {
 margin:
 0.25rem,
 0 0;
 color: var(--text-muted);
 font-size: 0.85rem;
 }

 :global(.activity-status) {
 margin-left: auto;
 text-transform: capitalize;
 }

 .cases-section {
 display: flex;
 flex-direction: column;
 gap: 1.5rem;
 }

 .cases-header-container {
 display: flex;
 flex-direction: row;
 justify-content: space-between;
 align-items: center;
 gap: 2rem;
 }

 .cases-section-title {
 margin:
 0,
 0 0.5rem 0;
 font-size: 1.5rem;
 font-weight: bold;
 color: #d4af37;
 font-family: 'Press Start 2P', 'Courier New', monospace;
 }

 .cases-section-subtitle {
 margin: 0;
 font-size: 0.85rem;
 color: #999;
 text-transform: uppercase;
 letter-spacing: 1px;
 }

 .view-all-cases-btn {
 padding: 0.75rem 1.5rem !important;
 font-weight: bold !important;
 white-space: nowrap;
 min-width: 150px;
 }

 .cases-grid-container {
 display: grid;
 grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
 gap: 1.25rem;
 width: 100%;
 }

 .case-card-wrapper {
 display: flex;
 text-decoration: none;
 color: inherit;
 cursor: pointer;
 border: 4px solid #1e293b !important;
 background: #1e293b !important;
 padding: 1.25rem !important;
 transition: all 0.2s ease;
 position: relative;
 overflow: hidden;
 }

 .case-card-wrapper:hover {
 border-color: #d4af37 !important;
 background: #0f172a !important
 ;
 transform: translateY(-3px);
 box-shadow: 0 0 0 2px #d4af37 0 4px 12px rgba(212, 175, 55, 0.3);
 }

 .case-card-inner {
 display: flex;
 flex-direction: column;
 gap: 0.75rem;
 width: 100%;
 position: relative;
 z-index: 1;
 }

 .case-status-badge {
 display: inline-block;
 width: fit-content;
 padding: 0.25rem 0.75rem;
 border: 2px solid currentColor;
 font-size: 0.7rem;
 font-weight: bold;
 text-transform: uppercase;
 letter-spacing: 0.5px;
 }

 .status-label {
 display: block;
 }

 .case-priority-badge {
 display: inline-block;
 width: fit-content;
 padding: 0.25rem 0.75rem;
 border: 2px solid currentColor;
 color: white;
 font-size: 0.7rem;
 font-weight: bold;
 text-transform: uppercase;
 letter-spacing: 0.5px;
 }

 .priority-label {
 display: block;
 }

 .case-card-title {
 margin:
 0.5rem,
 0 0 0;
 font-size: 1rem;
 font-weight: bold;
 color: #fff;
 line-height: 1.3;
 word-break: break-word;
 font-family: 'Press Start 2P', 'Courier New', monospace;
 }

 .case-card-type {
 margin: 0;
 font-size: 0.8rem;
 color: #888;
 display: flex;
 align-items: center;
 gap: 0.5rem;
 }

 .case-card-updated {
 margin: 0;
 font-size: 0.75rem;
 color: #666;
 display: flex;
 align-items: center;
 gap: 0.5rem;
 }

 .case-card-hover-indicator {
 margin-top: auto;
 padding-top: 0.75rem;
 border-top: 2px dashed #444;
 display: flex;
 justify-content: flex-end;
 align-items: center;
 min-height: 1.5rem;
 }

 .arrow-icon {
 font-size: 1.5rem;
 color: #d4af37;
 font-weight: bold;
 transition: transform 0.2s ease;
 }

 .case-card-wrapper:hover .arrow-icon {
 transform: translateX(4px);
 }

 @media (max-width: 768px) {
 .ai-dashboard {
 padding: 1.5rem;
 }

 .services-grid {
 grid-template-columns: 1fr;
 }

 .cases-grid-container {
 grid-template-columns: 1fr;
 }

 .cases-header-container {
 flex-direction: column;
 align-items: flex-start;
 gap: 1rem;
 }

 .cases-section-title {
 font-size: 1.25rem;
 }

 .view-all-cases-btn {
 width: 100%;
 min-width: unset;
 }

 .case-card-title {
 font-size: 0.9rem;
 }
 }
</style>
