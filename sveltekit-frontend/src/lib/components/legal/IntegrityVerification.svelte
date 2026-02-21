<!--
  Integrity Verification Component
  Displays evidence integrity status, hash verification, and AI analysis results
-->
<script lang="ts">
  interface Props {
    integrityStatus: string;
    verificationResults: any;
    originalHash: string;
    currentHash: string;
    aiAnalysis: any;
    showDetails?: boolean;
  }

  let {
    integrityStatus = 'pending',
    verificationResults = null,
    originalHash = '',
    currentHash = '',
    aiAnalysis = null,
    showDetails = false
  }: Props = $props();

  function getStatusDisplay(status: string) {
    switch (status) {
      case 'verified': return { label: 'Verified', color: 'status-verified' };
      case 'compromised': return { label: 'Compromised', color: 'status-compromised' };
      case 'requires-attention': return { label: 'Requires Attention', color: 'status-warning' };
      case 'pending': return { label: 'Pending', color: 'status-pending' };
      default: return { label: status, color: 'status-pending' };
    }
  }

  let statusDisplay = $derived(getStatusDisplay(integrityStatus));
  let hashMatch = $derived(originalHash && currentHash ? originalHash === currentHash : null);
</script>

<div class="integrity-verification">
  <div class="status-banner {statusDisplay.color}">
    <div class="status-info">
      <h4>Integrity Status: {statusDisplay.label}</h4>
      {#if hashMatch !== null}
        <p>Hash Match: {hashMatch ? 'Yes - Evidence is intact' : 'No - Possible tampering'}</p>
      {/if}
    </div>
  </div>

  {#if showDetails}
    {#if originalHash || currentHash}
      <div class="detail-section">
        <h5>Hash Verification</h5>
        <div class="hash-grid">
          <div class="hash-item">
            <span class="hash-label">Original Hash</span>
            <code class="hash-value">{originalHash || 'N/A'}</code>
          </div>
          <div class="hash-item">
            <span class="hash-label">Current Hash</span>
            <code class="hash-value">{currentHash || 'N/A'}</code>
          </div>
        </div>
      </div>
    {/if}

    {#if verificationResults}
      <div class="detail-section">
        <h5>Verification Results</h5>
        {#if verificationResults.aiAnalysisScore != null}
          <div class="result-item">
            <span class="result-label">AI Analysis Score</span>
            <div class="score-bar">
              <div class="score-fill" style="width: {verificationResults.aiAnalysisScore * 100}%"></div>
            </div>
            <span class="score-value">{(verificationResults.aiAnalysisScore * 100).toFixed(0)}%</span>
          </div>
        {/if}
        {#if verificationResults.tamperedIndicators?.length > 0}
          <div class="result-item">
            <span class="result-label">Tamper Indicators</span>
            <ul class="indicator-list">
              {#each verificationResults.tamperedIndicators as indicator}
                <li>{indicator}</li>
              {/each}
            </ul>
          </div>
        {/if}
      </div>
    {/if}

    {#if aiAnalysis}
      <div class="detail-section">
        <h5>AI Analysis</h5>
        {#if aiAnalysis.riskLevel}
          <p class="result-label">Risk: <span class="risk-badge risk-{aiAnalysis.riskLevel}">{aiAnalysis.riskLevel}</span></p>
        {/if}
        {#if aiAnalysis.confidence != null}
          <p class="result-label">Confidence: <strong>{(aiAnalysis.confidence * 100).toFixed(0)}%</strong></p>
        {/if}
        {#if aiAnalysis.models}
          <p class="result-label">Models: <code>{aiAnalysis.models.join(', ')}</code></p>
        {/if}
      </div>
    {/if}
  {/if}
</div>

<style>
  .integrity-verification { display: flex; flex-direction: column; gap: 1rem; }
  .status-banner { display: flex; align-items: center; gap: 1rem; padding: 1rem; border-radius: 0.5rem; border: 1px solid; }
  .status-verified { background: rgba(16,185,129,0.1); border-color: rgba(16,185,129,0.3); color: #10b981; }
  .status-compromised { background: rgba(239,68,68,0.1); border-color: rgba(239,68,68,0.3); color: #ef4444; }
  .status-warning { background: rgba(245,158,11,0.1); border-color: rgba(245,158,11,0.3); color: #f59e0b; }
  .status-pending { background: rgba(59,130,246,0.1); border-color: rgba(59,130,246,0.3); color: #3b82f6; }
  .status-info h4 { margin: 0; font-weight: 600; }
  .status-info p { margin: 0.25rem 0 0 0; font-size: 0.875rem; opacity: 0.8; }
  .detail-section { padding: 1rem; background: rgba(255,255,255,0.02); border: 1px solid #333; border-radius: 0.5rem; }
  .detail-section h5 { color: #fff; margin: 0 0 0.75rem 0; font-size: 0.875rem; font-weight: 600; }
  .hash-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; }
  .hash-item { display: flex; flex-direction: column; gap: 0.25rem; }
  .hash-label { font-size: 0.75rem; color: #9ca3af; }
  .hash-value { font-family: monospace; font-size: 0.75rem; color: #d1d5db; background: rgba(0,0,0,0.3); padding: 0.5rem; border-radius: 0.25rem; word-break: break-all; }
  .result-item { display: flex; flex-direction: column; gap: 0.25rem; margin-bottom: 0.5rem; }
  .result-label { font-size: 0.75rem; color: #9ca3af; }
  .score-bar { height: 6px; background: #333; border-radius: 4px; overflow: hidden; }
  .score-fill { height: 100%; background: linear-gradient(90deg, #10b981, #3b82f6); border-radius: 4px; }
  .score-value { font-size: 0.875rem; font-weight: 600; color: #fff; }
  .risk-badge { display: inline-block; padding: 0.125rem 0.5rem; border-radius: 0.25rem; font-size: 0.75rem; font-weight: 600; text-transform: uppercase; }
  .risk-low { background: rgba(16,185,129,0.15); color: #10b981; }
  .risk-medium { background: rgba(245,158,11,0.15); color: #f59e0b; }
  .risk-high { background: rgba(239,68,68,0.15); color: #ef4444; }
  .indicator-list { margin: 0.25rem 0 0 1.25rem; padding: 0; font-size: 0.875rem; color: #ef4444; }
</style>
