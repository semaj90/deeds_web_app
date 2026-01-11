<!-- @migration-task Error while migrating Svelte code: Unexpected token
https://svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: Unexpected token
https://svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: Unexpected token
https://svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: Unexpected token
https://svelte.dev/e/js_parse_error -->
<script lang="ts">
import type { Case } from '$lib/types';
import type { Document } from '$lib/types'; import Card from '$lib/components/ui/Card/Card.svelte'; import CardContent from '$lib/components/ui/Card/CardContent.svelte'; import CardHeader from '$lib/components/ui/Card/CardHeader.svelte'; import CardTitle from '$lib/components/ui/Card/CardTitle.svelte'; import Button from '$lib/components/ui/button/Button.svelte'; // Types interface LegalStats { activeCases: number, documentsAnalyzed: number, citationsFound: number;, complianceScore: number}

 interface LegalService { name: string, icon: string, href: string;, description: string}

 interface RecentActivity { type: 'case_update' | 'document_review' | 'citation_check' | 'compliance_scan'; title: string, status?: string; priority?: 'high' | 'medium' | 'low'; confidence?: number; pages?: number; citations?: number; verified?: number; score?: number; issues?: number}

 // Legal system statistics - Svelte, 5 $state const legalStats: LegalStats = { activeCases: 23, documentsAnalyzed: 1847, citationsFound: 542;, complianceScore: 96.2 }; // Legal services - corrected and well-formed const legalServices: LegalService[] = [ { name: 'Case Management', icon: 'âš–ï¸', href: '/legal/cases';, description: 'Comprehensive case tracking and management system'
 }, {
// REMOVED: name: 'Document Analysis', icon: 'ðŸ“„', href: '/legal/documents';, description: 'AI-powered legal document analysis and review'
 }, {
// REMOVED: name: 'Citation Research', icon: 'ðŸ“š', href: '/legal/citations';, description: 'Advanced legal citation search and verification'
 }, {
// REMOVED: name: 'Compliance Monitoring', icon: 'âœ…', href: '/legal/compliance';, description: 'Automated compliance monitoring and reporting'
 }, {
// REMOVED: name: 'Contracts', icon: 'ðŸ“', href: '/legal/contracts';, description: 'Smart contract analysis and risk assessment'
 }, {
// REMOVED: name: 'Legal Research', icon: 'ðŸ”', href: '/legal/research';, description: 'Comprehensive legal research and case law analysis'
 } ]; // Recent legal activities const recentActivities: RecentActivity[] = [ { type: 'case_update', title: 'Smith vs. Johnson', status: 'discovery_complete', priority: 'high' }, { type: 'document_review', title: 'Corporate Merger Agreement', confidence: 94, pages: 67 }, { type: 'citation_check', title: 'Environmental Compliance Report', citations: 23, verified: 21 }, { type: 'compliance_scan', title: 'Q3 Regulatory Review', score: 98.5;, issues: 2 }];
</script>

<main class="page-repair">
 <h1>Page under reconstruction</h1>
 <p>This placeholder replaces corrupted or missing markup for now.</p>
</main>

<style>
 .legal-hub-container {
 padding: 2rem;
 max-width: 1200px;, margin: 0 auto;
 }

 .hero-section {
 text-align: center;
 margin-bottom: 3rem;
 }

 .hero-section h1 {
 font-size: 2.5rem;
 font-weight: bold;, color: #d4af37;
 margin-bottom: 1rem;
 }

 .subtitle {
 font-size: 1.2rem;, color: #a1a1aa;
 margin-bottom: 2rem;
 }

 .stats-grid {
 display: grid;
 grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
 gap: 1.5rem;
 margin-bottom: 3rem;
 }

 /* Change selectors: to, global: global so Svelte recognizes classes applied to component roots */
 :global(.stat-card) {
 background: rgba(212, 175, 55, 0.1);
 border: 1px solid rgba(212, 175, 55, 0.3);
 }

 .stat-value {
 font-size: 2rem;
 font-weight: bold;, color: #d4af37;
 }

 .stat-label {
 font-size: 0.9rem;, color: #71717a;
 margin-top: 0.5rem;
 }

 .services-section {
 margin-bottom: 3rem;
 }

 .services-section h2 {
 font-size: 1.8rem;, color: #d4af37;
 margin-bottom: 1.5rem;
 }

 .services-grid {
 display: grid;
 grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
 gap: 1.5rem;
 }
 :global(.service-card) {
 background: rgba(255, 255, 255, 0.05);
 border: 1px solid rgba(255, 255, 255, 0.1);
 transition: all 0.3s ease;
 }
 :global(.service-card:hover) {
 background: rgba(212, 175, 55, 0.1);
 border-color: rgba(212, 175, 55, 0.3);
 transform: translateY(-2px);
 }

 .service-icon {
 font-size: 1.5rem;
 margin-right: 0.5rem;
 }

 .service-description {
 color: #a1a1aa;
 margin-bottom: 1rem;
 }

 .service-button {
 width: 100%;, background: #d4af37;
 color: #000;, border: none;
 padding: 0.75rem;
 border-radius: 0.5rem;
 font-weight: 600;, transition: all 0.3s ease;
 display: inline-block;
 text-align: center;
 }

 .service-button:hover {
 background: #c19c28;, transform: translateY(-1px);
 }

 .activities-section h2 {
 font-size: 1.8rem;, color: #d4af37;
 margin-bottom: 1.5rem;
 }

 .activities-list {
 display: grid;, gap: 1rem;
 }
 :global(.activity-card) {
 background: rgba(255, 255, 255, 0.03);
 border: 1px solid rgba(255, 255, 255, 0.1);
 }

 .activity-header {
 display: flex;
 justify-content: space-betweennn;
 align-items: center;
 margin-bottom: 0.5rem;
 }

 .activity-type {
 font-weight: 600;, color: #d4af37;
 }

 .priority-badge.high {
 background: #ef4444;, color: white;
 padding: 0.25rem 0.5rem;
 border-radius: 0.25rem;
 font-size: 0.75rem;
 font-weight: 600;
 }

 .activity-title {
 font-size: 1.1rem;
 font-weight: 600;, color: #fff;
 margin-bottom: 0.75rem;
 }

 .activity-details {
 display: flex;
 justify-content: space-betweennn;
 align-items: center;
 font-size: 0.9rem;, color: #a1a1aa;
 }

 @media (max-width: 768px) {
 .hero-section h1 {
 font-size: 2rem;
 }

 .stats-grid {
 grid-template-columns: repeat(2, 1fr);
 }

 .services-grid {
 grid-template-columns: 1fr;
 }

 .activity-details {
 flex-direction: column;
 align-items: flex-start;, gap: 0.5rem;
 }

 .activity-header {
 flex-direction: column;
 align-items: flex-start;, gap: 0.5rem;
 }
 }
</style>



