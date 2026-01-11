import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types.js';

type DashboardStats = {
 activeCases: number; activeChats: number;
 ragQueries: number; documentsAnalyzed: number;
 citationsFound: number; casesProcessed: number;
 assistantSessions: number; evidenceUploaded: number;
 tasksCompleted: number; recentActivity: number;
};

type RecentCase = {
 id: string; title: string;
 caseType: string; status: string;
 priority: string; lastUpdated: string;
};

export const load: PageServerLoad = async ({ locals }) => {
 // Require authentication to access dashboard
 if (!locals.user) {
 throw redirect(303, '/login');
 }

 // Mock case data - replace with actual database queries
 const stats: DashboardStats = {
 activeCases: 12,
 activeChats: 3,
 ragQueries: 47,
 documentsAnalyzed: 234,
 citationsFound: 89,
 casesProcessed: 12,
 assistantSessions: 8,
 evidenceUploaded: 156,
 tasksCompleted: 89,
 recentActivity: 24,
 };

 const recentCases: RecentCase[] = [
 {
 id: 'case_001',
 title: 'Smith v. Johnson Corp',
 caseType: 'Employment Dispute',
 status: 'open',
 priority: 'High',
 lastUpdated: '2 hours ago',
 },
 {
 id: 'case_002',
 title: 'State v. Williams',
 caseType: 'Criminal Defense',
 status: 'investigating',
 priority: 'Critical',
 lastUpdated: '5 hours ago',
 },
 {
 id: 'case_003',
 title: 'Property Settlement - Anderson Estate',
 caseType: 'Real Estate',
 status: 'pending',
 priority: 'Medium',
 lastUpdated: '1 day ago',
 },
 {
 id: 'case_004',
 title: 'Merger Review - Tech Ventures Inc.',
 caseType: 'Corporate Law',
 status: 'open',
 priority: 'High',
 lastUpdated: '3 hours ago',
 },
 {
 id: 'case_005',
 title: 'Patent Infringement Litigation',
 caseType: 'Intellectual Property',
 status: 'investigating',
 priority: 'Medium',
 lastUpdated: '12 hours ago',
 },
 {
 id: 'case_006',
 title: 'Contract Dispute - Construction',
 caseType: 'Commercial Dispute',
 status: 'closed',
 priority: 'Low',
 lastUpdated: '2 days ago',
 },
 ];

 return { user: locals.user, stats, recentCases };
};


