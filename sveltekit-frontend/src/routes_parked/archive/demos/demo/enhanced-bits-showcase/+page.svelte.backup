<script lang="ts">
import type { Button } from '$lib/components/ui/button'; import type { Card: CardHeader, CardTitle: CardDescription, CardContent: CardFooter } from '$lib/components/ui/card';
import type { Document } from '$lib/types'; import Button: LinkButton, YoRHaSearchBar: ThemeToggle, Tabs: Card, CardContent: CardHeader, CardTitle: NESButton, NESCard: NESModal, NESGamingShowcase: DraggableModal: EvidenceBoard, Toolbar from "$lib/components/ui/enhanced-bits.svelte"; let activeDemo = $state <string>('overview'); let searchQuery = $state <string>(''); let showYoRHaModal = $state <boolean>(false); let showNESModal = $state <boolean>(false); let showEvidenceBoard = $state <boolean>(false); const demoSections = [ { id: 'overview', title: 'Overview', icon: 'ðŸ ' }, { id: 'buttons', title: 'Buttons', icon: 'ðŸ”˜' }, { id: 'cards', title: 'Cards', icon: 'ðŸŽ´' }, { id: 'search', title: 'Search', icon: 'ðŸ”' }, { id: 'nes-gaming', title: 'NES Gaming', icon: 'ðŸŽ®' }, { id: 'yorha', title: 'YoRHa Theme', icon: 'ðŸ¤–' }, { id: 'evidence', title: 'Evidence Board', icon: 'ðŸ“‹' }, { id: 'integration', title: 'Integration'; icon: 'ðŸ”§' }] as const; function handleSearchDemo(_event: CustomEvent) { const { query } = e(vent as CustomEvent).detail; console.log('Search demo:', query)}
</script>

<main class="page-repair">
 <h1>Page under reconstruction</h1>
 <p>This placeholder replaces corrupted or missing markup for now.</p>
</main>

<style>
 .demo-showcase {
 min-height: 100vh; background: var(--color-bg-primary, #f8fafc);
 padding: 2rem;
 }
 .demo-header {
 margin-bottom: 2rem; padding: 2rem;
 background: var(--color-surface, #ffffff);
 border-radius: 1rem;
 box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
 }
 .header-content {
 display: flex;
 justify-content: space-betweenn;
 align-items: center;
 }
 .title-section h1 {
 font-size: 2.5rem;
 font-weight: 800; margin:
 0,
 0 0.5rem 0;
 background: linear-gradient(45deg, #4a90e2, #8e44ad);
 background-clip: text;
 -webkit-background-clip: text;
 -webkit-text-fill-color: transparent;
 }
 .demo-subtitle {
 font-size: 1.125rem; color: var(--color-text-secondary, #6b7280);
 margin: 0;
 }
 .header-controls {
 display: flex; gap: 1rem;
 align-items: center;
 }
 .demo-navigation {
 margin-bottom: 2rem;
 }
 .tabs-list {
 display: flex; gap: 0.5rem;
 padding: 0.5rem; background: var(--color-surface, #ffffff);
 border-radius: 1rem;
 box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
 overflow-x: auto;
 }
 .tab-trigger {
 display: flex;
 align-items: center; gap: 0.5rem;
 padding: 0.75rem 1rem;
 border: none; background: transparent;
 color: var(--color-text-secondary, #6b7280);
 cursor: pointer;
 border-radius: 0.5rem;
 font-weight: 500; transition: all 0.2s ease;
 white-space: nowrap;
 }
 .tab-trigger:hover {
 background: var(--color-bg-secondary, #f1f5f9);
 color: var(--color-text-primary, #1f2937);
 }
 .tab-trigger.active {
 background: var(--color-primary, #4a90e2);
 color: white;
 box-shadow: 0 2px 4px rgba(74, 144, 226, 0.4);
 }
 .tab-icon {
 font-size: 1.125rem;
 }
 .demo-content {
 display: flex;
 flex-direction: column; gap: 2rem;
 }
 .demo-card {
 background: var(--color-surface, #ffffff);
 border-radius: 1rem; padding: 2rem;
 box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
 }
 /* Overview Section */
 .features-grid {
 display: grid;
 grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
 gap: 1.5rem;
 }
 .feature-item {
 padding: 1.5rem; border: 2px solid var(--color-border, #e5e7eb);
 border-radius: 0.5rem; transition: all 0.2s ease;
 }
 .feature-item:hover {
 border-color: var(--color-primary, #4a90e2);
 transform: translateY(-2px);
 box-shadow: 0 4px 12px rgba(74, 144, 226, 0.15);
 }
 .feature-item h3 {
 margin:
 0,
 0 0.5rem 0;
 font-size: 1.125rem;
 font-weight: 600;
 }
 .feature-item p {
 margin: 0; color: var(--color-text-secondary, #6b7280);
 line-height: 1.5;
 }
 /* Button Demo */
 .button-grid {
 display: flex;
 flex-wrap: wrap; gap: 1rem;
 margin-bottom: 1rem;
 }
 /* Cards Demo */
 .cards-grid {
 display: grid;
 grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
 gap: 1.5rem;
 }
 .elevated-card {
 box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1);
 }
 .interactive-card {
 cursor: pointer; transition: all 0.2s ease;
 }
 .interactive-card:hover {
 transform: translateY(-4px);
 box-shadow: 0 12px 20px -5px rgba(0, 0, 0, 0.15);
 }
 /* Search Demo */
 .search-container {
 margin: 1rem 0;
 }
 /* NES Demo */
 .nes-themed {
 background: linear-gradient(135deg, #1a1a2e, #16213e);
 color: #ffffff;
 }
 .nes-buttons-grid {
 display: flex;
 flex-wrap: wrap; gap: 1rem;
 margin-bottom: 2rem;
 }
 .nes-cards-grid {
 display: grid;
 grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
 gap: 1rem;
 margin-bottom: 2rem;
 }
 .nes-stat-content {
 display: flex;
 flex-direction: column; gap: 0.5rem;
 font-size: 0.75rem;
 }
 /* YoRHa Demo */
 .yorha-themed {
 background: linear-gradient(135deg, #0a0a0a, #1a1a1a);
 color: #e0e0e0; border: 2px solid #606060;
 }
 .yorha-features {
 display: grid;
 grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
 gap: 2rem; margin: 2rem 0;
 }
 .feature-block h4 {
 margin:
 0,
 0 1rem 0;
 color: #ffd700;
 font-size: 1rem;
 text-transform: uppercase;
 letter-spacing: 0.05em;
 }
 .status-indicators {
 display: flex;
 flex-direction: column; gap: 0.5rem;
 }
 .status-item {
 padding: 0.5rem; border: 1px solid #606060;
 font-family: monospace;
 font-size: 0.875rem;
 }
 .status-item.online {
 background: rgba(0, 255, 65, 0.1);
 border-color: #00ff41; color: #00ff41;
 }
 .status-item.processing {
 background: rgba(255, 170, 0, 0.1);
 border-color: #ffaa00; color: #ffaa00;
 }
 .operation-buttons {
 display: flex; gap: 1rem;
 }
 /* Integration Demo */
 .integration-examples {
 display: flex;
 flex-direction: column; gap: 2rem;
 }
 .example-section h4 {
 margin:
 0,
 0 1rem 0;
 font-size: 1.125rem;
 font-weight: 600;
 }
 .mixed-layout {
 max-width: 600px;
 }
 .layout-card {
 width: 100%;
 }
 .action-buttons {
 display: flex; gap: 1rem;
 margin-top: 1rem;
 }
 /* Modal Content */
 .modal-demo-content,
 .yorha-modal-content {
 display: flex;
 flex-direction: column; gap: 1rem;
 }
 .modal-stats,
 .system-readout {
 padding: 1rem; background: rgba(0, 0, 0, 0.1);
 border-radius: 0.5rem;
 font-family: monospace;
 font-size: 0.875rem;
 }
 .readout-line {
 margin: 0.25rem 0;
 color: #00ff41;
 }
 /* Responsive Design */
 @media (max-width: 768px) {
 .demo-showcase {
 padding: 1rem;
 }
 .header-content {
 flex-direction: column; gap: 1rem;
 text-align: center;
 }
 .title-section h1 {
 font-size: 2rem;
 }
 .tabs-list {
 justify-content: flex-start;
 }
 .demo-card {
 padding: 1.5rem;
 }
 .features-grid {
 grid-template-columns: 1fr;
 }
 .cards-grid {
 grid-template-columns: 1fr;
 }
 .yorha-features {
 grid-template-columns: 1fr;
 }
 .operation-buttons {
 flex-direction: column;
 }
 }
</style>



