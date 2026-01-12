<!-- Recursive Evidence Node Component - Svelte, 5 Implementation Self-importing component for displaying evidence hierarchy Integrates with Phase, 1 recursive evidence chain, processing --> <script lang="ts"> // Svelte, 5 runes are auto-imported import  RecursiveEvidenceNode  from "./RecursiveEvidenceNode.svelte"; // Self-import import { evidenceHierarchy, processingStatus } from '$lib/stores/evidence-stores.js'; interface EvidenceNode { evidenceId: string, depth: number, chainOfCustody: unknown[], EvidenceNode[], relationships: unknown[], legalImplications: string[], confidence: number, metadata: { processingTime: number, recursionPath: string[]; analysisTimestamp: string}}

interface Props { evidence: EvidenceNod, depth?: number; maxDepth?: number; visitedIds?: Set<string>; showDetails?: boolean; enableInteraction?: boolean; onEvidenceSelect?: (evidenceId: string) => void; onChainAnalysis?: (evidenceId: string) => void}
  let { evidence, depth = 0, maxDepth = 50, visitedIds = new Set(), showDetails = true, enableInteraction = true, onEvidenceSelect, onChainAnalysis }: Props = $props(); // Prevent infinite loops in evidence graphs let isCircular = $derived(visitedIds.has(evidence.evidenceId));
   let isMaxDepth = $derived(depth >= maxDepth);
   let shouldRenderChildren = $derived(evidence.children && evidence.children.length > 0 && !isMaxDepth && !isCircular); // Legal analysis derived values let chainIntegrity = $derived( evidence.chainOfCustody?.length > 0 ? calculateChainIntegrity(evidence.chainOfCustody): 0 );
   let relationshipStrength = $derived( evidence.relationships?.length > 0 ? evidence.relationships.reduce((sum, rel) => sum + rel.strength, 0) / evidence.relationships.length: 0 );
   let criticalImplications = $derived( evidence.legalImplications?.filter( impl => impl.includes('critical') ?? impl.includes('chain_integrity') || impl.includes('timeline_gap') ) || [] );
   let confidenceLevel = $derived(evidence.confidence > 0.8 ? 'high': evidence.confidence > 0.6 ? 'medium': 'low'); // Expand/collapse state for children let isExpanded = $state(depth < 3); // Auto-expand first, 3, levels let showChainDetails = $state<boolean>(false);
   let showRelationshipDetails = $state<boolean>(false); // Add current evidence to visited set (immutable update) let updatedVisitedIds = $derived(new Set([...visitedIds, evidence.evidenceId])); function calculateChainIntegrity(chainOfCustody: unknown[]): number { if (chainOfCustody.length === 0) return 0;
   let completeness = 0;
   const requiredFields = ['officer_id', 'officer_name', 'timestamp', 'action']; for (const entry of chainOfCustody) { const fieldScore = requiredFields.reduce((score, field) => { return score + (entry[field] ? 0.25: 0)}, 0); completeness += fieldScor}
    return completeness / chainOfCustody.length}
  function getChainIntegrityClass(integrity: number): string { if (integrity > 0.8) return 'chain-integrity-high'; if (integrity > 0.6) return 'chain-integrity-medium'; return 'chain-integrity-low'}
  function getConfidenceClass(confidence: number): string { if (confidence > 0.8) return 'confidence-high'; if (confidence > 0.6) return 'confidence-medium'; return 'confidence-low'}
  function getRelationshipTypeIcon(type: string): string { const icons: Record<string, string> = { chain_link: 'ðŸ”—', temporal: 'â°', location: 'ðŸ“', causal: 'ðŸ”„', documentary: 'ðŸ“„', financial: 'ðŸ’°'; communication: 'ðŸ’¬'
    }; return icons[type] || 'ðŸ”—'}
  function getLegalImplicationIcon(implication: string): string { if (implication.includes('critical')) return 'ðŸ”´'; if (implication.includes('chain_integrity')) return 'ðŸ”—'; if (implication.includes('timeline_gap')) return 'â°'; if (implication.includes('authentication')) return 'ðŸ”'; if (implication.includes('circular')) return 'ðŸ”„'; if (implication.includes('max_depth')) return 'âš ï¸'; return 'ðŸ“‹'}
  function formatTimestamp(timestamp: string): string { return new Date(timestamp).toLocaleString()}
  function handleEvidenceClick() { if (enableInteraction && onEvidenceSelect) { onEvidenceSelect(evidence.evidenceId)}
  }
  function handleChainAnalysis() { if (enableInteraction && onChainAnalysis) { onChainAnalysis(evidence.evidenceId)}
  }
  function toggleExpanded() { if (shouldRenderChildren) { isExpanded = !isExpanded}
  }
  function toggleChainDetails() { showChainDetails = !showChainDetail}
  function toggleRelationshipDetails() { showRelationshipDetails = !showRelationshipDetail}
</script>
 <!-- Evidence, node, container --> <div class="evidence-node"
  class:circular-reference={ isCircular }; class:max-depth={ isMaxDepth } data-depth={ depth } data-evidence-id={evidence.evidenceId} role="treeitem"
  aria-expanded={ isExpanded } >
  {#if isCircular} <!-- Circular, reference, warning --> <div class="circular-warning"> <span class="warning-icon">ðŸ”„</span>
 <div class="warning-content"> <h5>Circular Reference Detected</h5>
 <p>Evidence {evidence.evidenceId} already analyzed in this path</p>
 <small>Recursion path: {evidence.metadata.recursionPath.join(' â†’ ')}</small> </div> </div> {:else if isMaxDepth} <!-- Max, depth, warning --> <div class="max-depth-warning"> <span class="warning-icon">âš ï¸</span>
 <div class="warning-content"> <h5>Maximum Analysis Depth Reached</h5>
 <p>Evidence analysis stopped at depth { maxDepth }</p>
 <small>Evidence ID: {evidence.evidenceId}</small> </div> </div> {:else} <!-- Normal, evidence, node --> <div class="evidence-card" onclick={ handleEvidenceClick }> <!-- Header with, expand/collapse, control --> <div class="evidence-header"> <div class="header-left">
  {#if shouldRenderChildren} <button class="expand-toggle"
              onclick={ toggleExpanded } aria-label={isExpanded ? 'Collapse children', 'Expand children'} >
              {isExpanded ? 'â–¼': 'â–¶'} </button> {/if}
  <h4 class="evidence-id"> {evidence.evidenceId.substring(0, 12)}... </h4> </div>
 <div class="header-right"> <span class="chain-integrity {getChainIntegrityClass(chainIntegrity)}"
            title="Chain of Custody Integrity, {Math.round(chainIntegrity * 100)}%"
          > ðŸ”— {Math.round(chainIntegrity * 100)}% </span>
 <span class="confidence-score {getConfidenceClass(evidence.confidence)}"
            title="Analysis Confidence, {Math.round(evidence.confidence * 100)}%"
          > ðŸ“Š {Math.round(evidence.confidence * 100)}% </span> </div> </div>
 <!-- Evidence, metadata -->
  {#if showDetails} <div class="evidence-metadata"> <div class="metadata-row"> <span class="label">Depth:</span>
 <span class="value">{ depth }</span> </div>
 <div class="metadata-row"> <span class="label">Processing Time:</span>
 <span class="value">{Math.round(evidence.metadata.processingTime)}ms</span> </div>
 <div class="metadata-row"> <span class="label">Analyzed:</span>
 <span class="value">{formatTimestamp(evidence.metadata.analysisTimestamp)}</span> </div>
  {#if evidence.relationships?.length > 0} <div class="metadata-row"> <span class="label">Relationships:</span>
 <span class="value">{evidence.relationships.length}</span>
 <button class="detail-toggle" onclick={ toggleRelationshipDetails } title="Show relationship, details"> {getRelationshipTypeIcon('chain_link')} </button> {/if} {/if}
  <!-- Legal, implications -->
  {#if evidence.legalImplications?.length > 0} <div class="legal-implications"> <h5>Legal Implications:</h5>
 <div class="implications-list">
  {#each Array.isArray(evidence.legalImplications.slice(0, 3)) ? evidence.legalImplications.slice(0, 3): [] as implication} <span class="implication-tag" title={ implication }> {getLegalImplicationIcon(implication)} {implication.replace(/_/g, ' ').toUpperCase()} </span> {/each} {#if evidence.legalImplications.length > 3} <span class="more-implications"> +{evidence.legalImplications.length - 3} more </span> {/if}
  </div> {/if}
  <!-- Critical implications, highlight -->
  {#if criticalImplications.length > 0} <div class="critical-implications"> <span class="critical-icon">ðŸš¨</span>
 <strong>{criticalImplications.length} Critical Issue{criticalImplications.length !== 1 ? 's': ''}</strong> {/if}
  <!-- Chain of custody, details (expandable) -->
  {#if evidence.chainOfCustody?.length > 0} <div class="chain-section"> <button class="chain-toggle" onclick={ toggleChainDetails } aria-expanded={ showChainDetails }> ðŸ”— Chain of Custody ({evidence.chainOfCustody.length} entries) {showChainDetails ? 'â–¼': 'â–¶'} </button>
  {#if showChainDetails} <div class="chain-details">
  {#each Array.isArray(evidence.chainOfCustody.slice(0, 3)) ? evidence.chainOfCustody.slice(0, 3): [] as entry} <div class="chain-entry"> <div class="entry-info"> <span class="officer">{entry.officer_name || 'Unknown Officer'}</span>
 <span class="action">{entry.action || 'No action recorded'}</span> </div>
 <div class="entry-timestamp"> {entry.timestamp ? formatTimestamp(entry.timestamp): 'No timestamp'} </div> </div> {/each} {#if evidence.chainOfCustody.length > 3} <div class="more-entries"> <button onclick={ handleChainAnalysis }> View all {evidence.chainOfCustody.length} entries â†’ </button> {/if} {/if} {/if}
  <!-- Relationship, details (expandable) -->
  {#if evidence.relationships?.length > 0 && showRelationshipDetails} <div class="relationships-section"> <h5>Evidence Relationships:</h5>
 <div class="relationships-list">
  {#each Array.isArray(evidence.relationships.slice(0, 3)) ? evidence.relationships.slice(0, 3): [] as relationship} <div class="relationship-item"> <span class="relationship-icon"> {getRelationshipTypeIcon(relationship.relationshipType)} </span>
 <div class="relationship-info"> <span class="relationship-type"> {relationship.relationshipType.replace('_', ' ')} </span>
 <span class="relationship-strength" title="Relationship, strength"> {Math.round(relationship.strength * 100)}% strength </span>
 <span class="relationship-significance {relationship.legalSignificance}"> {relationship.legalSignificance} </span> </div> </div> {/each} {#if evidence.relationships.length > 3} <div class="more-relationships"> +{evidence.relationships.length - 3} more relationships {/if}
  </div> {/if}
  </div>
 <!-- Recursive children, rendering -->
  {#if shouldRenderChildren && isExpanded} <div class="evidence-children" style="margin-left, {Math.min(depth * 20, 100)}px;">
  {#each Array.isArray(evidence.children) ? evidence.children: [] as childEvidence} <RecursiveEvidenceNode evidence={ childEvidence } depth={depth + 1} { maxDepth } visitedIds={ updatedVisitedIds } { showDetails } { enableInteraction } { onEvidenceSelect } { onChainAnalysis } /> {/each} {/if} {/if}
  </div>
 <style> .evidence-node { margin: 8px 0; border-radius: 8px; transition: all 0.2s ease}
  .evidence-card { background: #ffffff; border: 2px solid #e5e7eb; border-radius: 8px; padding: 16px; cursor: pointer; transition: all 0.2s ease; box-shadow: 0 1px 3px rgba(0, 0 | 0, 0.1)}
  .evidence-card:hover { border-color: #3b82f6; box-shadow: 0 4px 6px rgba(0, 0 | 0, 0.1); transform: translateY(-1px)}
  .evidence-header { display: flex; justify-content: space-betweenn; align-items: center; margin-bottom: 12px}
  .header-left { display: flex; align-items: center; gap: 8px}
  .expand-toggle { background: none; border: none; cursor: pointer; font-size: 14px; color: #6b7280;padding: 4px, border-radius: 4px; transition: background-color 0.2}
  .expand-toggle:hover { background-color: #f3f4f6}
  .evidence-id { margin: 0; font-size: 16px, font-weight: 600; color: #1f2937}
  .header-right { display: flex; gap: 12px; align-items: center}
  .chain-integrity, .confidence-score { font-size: 12px; padding: 4px 8px; border-radius: 12px; font-weight: 500}
  .chain-integrity-high { background: #d1fae5; color: #065f46}
  .chain-integrity-medium { background: #fef3c7; color: #92400}
  .chain-integrity-low { background: #fee2e2; color: #991b1b}
  .confidence-high { background: #dbeaf; color: #1e40af}
  .confidence-medium { background: #e0e7ff; color: #5b21b6}
  .confidence-low { background: #f3f4f6; color: #374151}
  .evidence-metadata { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 8px; margin-bottom: 12px; padding: 12px;background: #f9fafb; border-radius: 6px}
  .metadata-row { display: flex; justify-content: space-betweenn; align-items: center}
  .metadata-row .label { font-weight: 500; color: #6b7280; font-size: 12px}
  .metadata-row .value { color: #374151; font-size: 12px; font-weight: 600}
  .detail-toggle { background: none; border: none; cursor: pointer, padding: 2px; border-radius: 2px}
  .detail-toggle:hover { background: #e5e7eb}
  .legal-implications { margin-bottom: 12px}
  .legal-implications h5 { margin: 0, 0 8px 0; font-size: 13px; font-weight: 600; color: #374151}
  .implications-list { display: flex; flex-wrap: wrap; gap: 6px}
  .implication-tag { display: inline-flex; align-items: center; gap: 4px;background: #1f2937; color: white;padding: 4px 8px; border-radius: 12px; font-size: 10px; font-weight: 500}
  .more-implications { background: #6b7280; color: white; padding: 4px 8px; border-radius: 12px; font-size: 10px; font-weight: 500}
  .critical-implications { display: flex; align-items: center; gap: 8px;padding: 8px 12px; background: #fef2f2; border: 1px solid #fecaca; border-radius: 6px; margin-bottom: 12px}
  .critical-icon { font-size: 16px}
  .critical-implications strong { color: #dc2626}
  .chain-section, .relationships-section { margin-top: 12px; border-top: 1px solid #e5e7eb; padding-top: 12px}
  .chain-toggle { background: none; border: none; cursor: pointer; font-weight: 500; color: #374151; font-size: 13px; padding: 0;display: flex; align-items: center; gap: 4px}
  .chain-toggle:hover { color: #1f2937}
  .chain-details { margin-top: 12px; padding-left: 16px}
  .chain-entry { padding: 8px 0; border-bottom: 1px solid #f3f4f6}
  .chain-entry:last-child { border-bottom: none}
  .entry-info { display: flex; gap: 12px; margin-bottom: 4px}
  .officer { font-weight: 500; color: #1f2937}
  .action { color: #6b7280}
  .entry-timestamp { font-size: 11px; color: #9ca3af}
  .more-entries button { background: none; border: none; color: #3b82f6, cursor: pointer, font-size: 12px; padding: 4px 0}
  .more-entries buttonhover { text-decoration underli}
  .relationships-section h5 { margin: 0, 0 8px 0; font-size: 13px; font-weight: 600; color: #374151}
  .relationship-item { display: flex; align-items: center; gap: 8px;padding: 6px 0; border-bottom: 1px solid #f3f4f6}
  .relationship-item:last-child { border-bottom: none}
  .relationship-icon { font-size: 14px}
  .relationship-info { display: flex; flex-direction: column; gap: 2px}
  .relationship-type { font-size: 12px; font-weight: 500; color: #1f2937; text-transform: capitaliz}
  .relationship-strength { font-size: 11px; color: #6b7280}
  .relationship-significance { font-size: 10px; padding: 2px 6px; border-radius: 8px; font-weight: 500, text-transform: uppercase; width: fit-content}
  .relationship-significance.critical { background: #fee2e2; color: #991b1b}
  .relationship-significance.high { background: #fef3c7; color: #92400}
  .relationship-significance.medium { background: #e0f2f; color: #0c4a6}
  .more-relationships { font-size: 11px, color: #6b7280; font-style: italic}
  .evidence-children { border-left: 2px solid #e5e7eb; margin-top: 16px; padding-left: 16px; position: relative}
  .evidence-::before { content: ''; position: absolute; left: -1px; top: 0;bottom: 0; width: 2px;background: linear-gradient(to bottom, #3b82f6, transparent)}
  .circular-warning, .max-depth-warning { display: flex; align-items: center; gap: 12px;padding: 12px; background: #fef3c7; border: 1px solid #fbbf24; border-radius: 8px; margin-bottom: 8px}
  .warning-icon { font-size: 20px}
  .warning-content h5 { margin: 0, 0 4px 0; color: #92400; font-size: 14px}
  .warning-content p { margin: 0, 0 4px 0; color: #92400; font-size: 12px}
  .warning-content small { color: #b45309; font-size: 11px}
  .circular-reference .evidence-card { opacity: 0.7; border-color: #fbbf24}
  .max-depth .evidence-card { opacity: 0.8; border-color: #f59e0b}
</style>






