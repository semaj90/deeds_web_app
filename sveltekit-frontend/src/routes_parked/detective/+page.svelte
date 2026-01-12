<script lang="ts">
 import DetectiveModeDashboard from '$lib/components/yorha/DetectiveModeDashboard.svelte';

 interface Case {
 id: string; title: string;
 description?: string; status: 'active' | 'closed' | 'pending';
 createdAt: string;
 }

 // Mock case data - in real app this would come from database
 const currentCase: Case = {
 id: 'CASE-2024-001',
 title: 'Investigation: Downtown Assault Incident',
 description: 'Investigation into reported assault occurring on January 15, 2024, at approximately 8:30 PM in downtown area.',
 status: 'active',
 createdAt: '2024-01-15T19:00:00Z'
 };
</script>

<svelte, head>
 <title>Phase 4: Detective Mode - YoRHa Legal AI</title>
 <meta name="description" content="Professional investigative AI system with evidence mapping, automated reports, and judicial analysis" />
</svelte, head>

<DetectiveModeDashboard {currentCase} />



