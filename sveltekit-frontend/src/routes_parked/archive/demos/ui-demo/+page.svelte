<script lang="ts">
 import {
 Card,
 CaseTile,
 DataTable,
 DocumentPreview,
 EvidenceTag,
 FlowchartNote,
 GridList,
 InfoBadge,
 Modal,
 Panel,
 RetroButton,
 SearchBar,
 SectionHeader,
 StatusBar,
 TabsPanel,
 Terminal,
 TimelineEvent
 } from '$lib/ui';

 let searchValue = $state('');
 let modalOpen = $state(false);
 let activeTab = $state(0);

 const tabs = [
 { label: 'Evidence', content: () => 'Evidence content here' },
 { label: 'Timeline', content: () => 'Timeline content here' },
 { label: 'Analysis', content: () => 'Analysis content here' }
 ];

 const tableHeaders = ['Case ID', 'Type', 'Status', 'Date'];
 const tableData = [
 ['CASE-2025-001', 'Murder', 'Open', '2025-11-17'],
 ['CASE-2025-002', 'Fraud', 'Closed', '2025-11-15'],
 ['CASE-2025-003', 'Theft', 'Open', '2025-11-16']
 ];
</script>

<svelte:head>
 <title>Detective UI Component Library</title>
</svelte:head>

<div class="min-h-screen bg-gradient-to-br from-ink via-ink/95 to-ink/90 text-white p-8">
 <div class="max-w-7xl mx-auto space-y-8">

 <!-- Header -->
 <div class="text-center mb-12">
 <h1 class="text-4xl font-mono font-bold text-neon mb-4">🕵️ DETECTIVE UI COMPONENT LIBRARY</h1>
 <p class="text-xl text-ink/70 font-serif">Svelte 5 Runes + Bits UI v2 + UnoCSS (BarnsworthBurning + YoRHa Retro)</p>
 </div>

 <!-- Status Bar -->
 <StatusBar>
 <InfoBadge text="PHASE 2" color="green" />
 <span>UI Components: 17</span>
 <span>Status: Complete</span>
 <RetroButton label="Test Modal" onclick={() => modalOpen = true} />
 </StatusBar>

 <!-- Search Bar -->
 <SectionHeader title="Search & Navigation" subtitle="Interactive components for data discovery" />
 <Card>
 <SearchBar bind:value={searchValue} placeholder="Search cases, evidence, suspects..." />
 <p class="mt-2 text-sm opacity-70">Search value: {searchValue || 'none'}</p>
 </Card>

 <!-- Cards and Panels -->
 <SectionHeader title="Layout Components" subtitle="Cards, panels, and container elements" />
 <GridList>
 <Card>
 <h3 class="font-serif text-lg mb-2">Basic Card</h3>
 <p class="text-sm opacity-80">Clean, minimal card component with hover effects.</p>
 </Card>

 <Panel>
 <h3 class="font-serif text-lg mb-2">Panel Component</h3>
 <p class="text-sm opacity-80">Semi-transparent panel with backdrop blur.</p>
 </Panel>

 <Terminal prompt="detective@terminal:~$">
 <div class="space-y-1">
 <div>Initializing case analysis...</div>
 <div>Loading evidence database...</div>
 <div>Ready for interrogation.</div>
 </div>
 </Terminal>
 </GridList>

 <!-- Buttons and Tags -->
 <SectionHeader title="Interactive Elements" subtitle="Buttons, tags, and status indicators" />
 <Card>
 <div class="flex flex-wrap gap-4 mb-4">
 <RetroButton label="Primary Action" />
 <RetroButton label="Secondary" variant="secondary" />
 <RetroButton label="Destructive" variant="destructive" />
 </div>

 <div class="flex flex-wrap gap-2">
 <EvidenceTag type="document" />
 <EvidenceTag type="photo" variant="evidence" />
 <EvidenceTag type="testimony" variant="testimony" />
 <EvidenceTag type="timeline" variant="timeline" />
 <InfoBadge text="HIGH PRIORITY" color="red" />
 <InfoBadge text="VERIFIED" color="green" />
 <InfoBadge text="PENDING" color="yellow" />
 </div>
 </Card>

 <!-- Case Tiles -->
 <SectionHeader title="Case Management" subtitle="Case tiles and evidence organization" />
 <GridList>
 <CaseTile
 title="The Midnight Heist"
 summary="Complex burglary case with multiple suspects and alibis"
 link="/cases/2025-001"
 status="open"
 />
 <CaseTile
 title="Corporate Espionage"
 summary="Industrial secrets theft involving insider trading"
 link="/cases/2025-002"
 status="closed"
 />
 <FlowchartNote>
 <strong>Key Insight:</strong> The butler did it... or did he?
 <br><em>Evidence suggests otherwise.</em>
 </FlowchartNote>
 </GridList>

 <!-- Data Table -->
 <SectionHeader title="Data Display" subtitle="Tables and structured information" />
 <Card>
 <DataTable {tableHeaders} {tableData} />
 </Card>

 <!-- Tabs Panel -->
 <SectionHeader title="Navigation" subtitle="Tabbed interface for organized content" />
 <Card>
 <TabsPanel bind:activeTab {tabs}>
 {#snippet content({ tab, index })}
 <div class="p-4">
 <h4 class="font-serif text-lg mb-2">{tab.label} Content</h4>
 <p class="text-sm opacity-80">This is the content for tab {index + 1}: {tab.label}</p>
 </div>
 {/snippet}
 </TabsPanel>
 </Card>

 <!-- Timeline -->
 <SectionHeader title="Timeline Events" subtitle="Chronological case progression" />
 <Card>
 <div class="space-y-4">
 <TimelineEvent
 time="2025-11-17 14:30"
 title="Crime Scene Discovery"
 description="Body found in abandoned warehouse. Initial forensic analysis suggests time of death between 10-12 PM."
 type="evidence"
 />
 <TimelineEvent
 time="2025-11-17 16:45"
 title="Witness Interview"
 description="Neighbor reports seeing suspicious vehicle around 11 AM. Vehicle description: Black sedan, tinted windows."
 type="testimony"
 />
 <TimelineEvent
 time="2025-11-17 18:20"
 title="Evidence Collection"
 description="Fingerprints and DNA samples collected from scene. Preliminary analysis shows unknown male DNA."
 type="timeline"
 />
 </div>
 </Card>

 <!-- Document Preview -->
 <SectionHeader title="Document Analysis" subtitle="Evidence document preview and analysis" />
 <Card>
 <DocumentPreview
 title="Autopsy Report - John Doe"
 type="medical"
 content="<h3>Cause of Death</h3><p>Multiple gunshot wounds to the chest and abdomen. Time of death estimated at 11:15 AM.</p><h3>Key Findings</h3><ul><li>Three entry wounds, two exit wounds</li><li>.45 caliber weapon suspected</li><li>No defensive wounds</li><li>Toxicology pending</li></ul><blockquote>Victim was likely caught off guard and executed at close range.</blockquote>"
 />
 </Card>

 </div>
</div>

<!-- Modal Demo -->
<Modal bind:open={modalOpen} title="Detective Modal" size="md">
 <p>This modal demonstrates the full UI component integration.</p>
 <p>All components are working together in the Detective Mode interface!</p>
</Modal>

<style>
 :global(.card) {
 transition: all 0.2s ease;
 }

 :global(.card:hover) {
 transform: translateY(-2px);
 box-shadow: 0 8px 25px rgba(0,0,0,0.15);
 }
</style>


