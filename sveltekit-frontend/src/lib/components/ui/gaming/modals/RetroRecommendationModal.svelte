<script lang="ts">
  interface Recommendation {
    id: string;
    title: string;
    confidence: number;
    category: string;
    description: string;
  }

  interface Props {
    open?: boolean;
    recommendations?: Recommendation[];
    onclose?: () => void;
    onselect?: (rec: Recommendation) => void;
  }

  let {
    open = $bindable(false),
    recommendations = [
      { id: "r1", title: "Review PC 187 Precedents", confidence: 0.94, category: "Legal", description: "Similar murder cases with matching evidence patterns" },
      { id: "r2", title: "Cross-Reference Witness Statements", confidence: 0.87, category: "Evidence", description: "3 witnesses with overlapping testimony timelines" },
      { id: "r3", title: "Analyze Financial Records", confidence: 0.82, category: "Financial", description: "Suspicious transaction patterns detected in period" },
      { id: "r4", title: "Request Expert Testimony", confidence: 0.76, category: "Strategy", description: "Forensic specialist recommended for DNA evidence" },
    ],
    onclose,
    onselect,
  }: Props = $props();

  let selectedRec = $state<Recommendation | null>(null);

  function getConfidenceColor(c: number): string {
    if (c >= 0.9) return "#80ff80";
    if (c >= 0.8) return "#c0ff40";
    if (c >= 0.7) return "#ffc040";
    return "#ff6040";
  }

  function handleSelect(rec: Recommendation) {
    selectedRec = rec;
    if (onselect) onselect(rec);
  }
</script>

{#if open}
  <div class="modal-backdrop" onclick={() => { if (onclose) onclose(); }} role="presentation">
    <div class="modal-container" onclick={(e) => e.stopPropagation()} onkeydown={(e) => e.stopPropagation()} role="dialog" aria-modal="true" tabindex="-1">
      <div class="modal-scanlines"></div>

      <div class="modal-header">
        <div class="header-deco"></div>
        <h2>AI RECOMMENDATIONS</h2>
        <button class="close-btn" onclick={() => { if (onclose) onclose(); }}>X</button>
      </div>

      <div class="modal-body">
        {#each recommendations as rec}
          <button
            class="rec-card"
            class:selected={selectedRec?.id === rec.id}
            onclick={() => handleSelect(rec)}
          >
            <div class="rec-top">
              <span class="rec-category">[{rec.category}]</span>
              <span class="rec-confidence" style="color: {getConfidenceColor(rec.confidence)}">
                {(rec.confidence * 100).toFixed(0)}%
              </span>
            </div>
            <div class="rec-title">{rec.title}</div>
            <div class="rec-desc">{rec.description}</div>
            <div class="confidence-bar">
              <div class="bar-fill" style="width: {rec.confidence * 100}%; background: {getConfidenceColor(rec.confidence)}"></div>
            </div>
          </button>
        {/each}
      </div>

      <div class="modal-footer">
        <span class="footer-text">{recommendations.length} recommendations | AI confidence scoring</span>
        <button class="action-btn" onclick={() => { if (onclose) onclose(); }}>ACCEPT</button>
      </div>
    </div>
  </div>
{/if}

<style>
  .modal-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.85);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 9999;
  }
  .modal-container {
    background: #0d0d1a;
    border: 3px solid #4040c0;
    width: 90%;
    max-width: 500px;
    max-height: 80vh;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    position: relative;
    box-shadow:
      0 0 30px rgba(64, 64, 192, 0.3),
      inset 0 0 40px rgba(0, 0, 0, 0.5);
  }
  .modal-scanlines {
    position: absolute;
    inset: 0;
    background: repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0, 0, 0, 0.06) 2px, rgba(0, 0, 0, 0.06) 4px);
    pointer-events: none;
    z-index: 1;
  }
  .modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 16px;
    background: #1a1a3a;
    border-bottom: 2px solid #4040c0;
    position: relative;
    z-index: 2;
  }
  .header-deco {
    width: 12px;
    height: 12px;
    background: #4040c0;
    transform: rotate(45deg);
  }
  .modal-header h2 {
    font-family: "Press Start 2P", "Courier New", monospace;
    font-size: 0.7rem;
    color: #c0c0ff;
    margin: 0;
    letter-spacing: 2px;
  }
  .close-btn {
    background: #c04040;
    color: white;
    border: 2px solid #a02020;
    width: 24px;
    height: 24px;
    font-family: monospace;
    font-size: 0.7rem;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .close-btn:hover { background: #e04040; }
  .modal-body {
    padding: 12px;
    overflow-y: auto;
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 8px;
    position: relative;
    z-index: 2;
  }
  .rec-card {
    background: #12122a;
    border: 1px solid #2a2a4a;
    padding: 10px;
    cursor: pointer;
    text-align: left;
    width: 100%;
    font-family: "Courier New", monospace;
    color: #c0c0e0;
    transition: border-color 0.15s;
  }
  .rec-card:hover { border-color: #4040c0; }
  .rec-card.selected { border-color: #6060e0; background: #1a1a3a; }
  .rec-top { display: flex; justify-content: space-between; margin-bottom: 4px; }
  .rec-category { font-size: 0.6rem; color: #8080a0; text-transform: uppercase; letter-spacing: 1px; }
  .rec-confidence { font-size: 0.75rem; font-weight: bold; }
  .rec-title { font-size: 0.8rem; color: #e0e0ff; margin-bottom: 4px; }
  .rec-desc { font-size: 0.65rem; color: #808090; line-height: 1.3; }
  .confidence-bar { height: 3px; background: #1a1a3a; margin-top: 6px; border-radius: 1px; overflow: hidden; }
  .bar-fill { height: 100%; transition: width 0.3s; }
  .modal-footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 10px 16px;
    background: #1a1a3a;
    border-top: 1px solid #2a2a4a;
    position: relative;
    z-index: 2;
  }
  .footer-text { font-size: 0.6rem; color: #606080; font-family: monospace; }
  .action-btn {
    background: #4040c0;
    color: #e0e0ff;
    border: 2px solid #2020a0;
    padding: 6px 16px;
    font-family: "Press Start 2P", "Courier New", monospace;
    font-size: 0.6rem;
    cursor: pointer;
    letter-spacing: 1px;
    box-shadow: 2px 2px 0 rgba(0, 0, 0, 0.4);
  }
  .action-btn:hover { background: #5050d0; }
</style>
