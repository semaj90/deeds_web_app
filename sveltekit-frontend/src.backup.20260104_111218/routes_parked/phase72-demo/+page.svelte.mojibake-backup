<script lang="ts">
  import type { EvidenceNode } from '$lib/evidence-canvas/case-similarity-service';
  import EvidenceCanvas from '$lib/evidence-canvas/evidence-canvas.svelte';
  import { onMount } from 'svelte';

  let caseId = $state('demo-case-001');
  let caseType = $state('contract-dispute');
  let jurisdiction = $state('federal');

  let demoNodes = $state<EvidenceNode[]>([]);
  let demoEdges = $state<any[]>([]);

  onMount(() => {
    // Generate demo data
    generateDemoData();
  });

  function generateDemoData() {
    // Create sample evidence nodes
    demoNodes = [
      {
        id: 'witness_001',
        type: 'witness',
        title: 'John Smith Testimony',
        content: 'Witness observed the contract signing on March 15, 2023',
        x: 100,
        y: 100,
        size: 25,
        metadata: {
          date: '2023-03-15',
          credibility: 0.9,
          source: 'deposition'
        }
      },
      {
        id: 'document_001',
        type: 'document',
        title: 'Service Agreement Contract',
        content: 'Master service agreement between parties dated January 1, 2023',
        x: 300,
        y: 150,
        size: 25,
        metadata: {
          date: '2023-01-01',
          type: 'contract',
          pages: 15
        }
      },
      {
        id: 'email_001',
        type: 'digital',
        title: 'Email Correspondence',
        content: 'Email chain discussing contract terms and amendments',
        x: 200,
        y: 300,
        size: 20,
        metadata: {
          date: '2023-02-10',
          sender: 'john.doe@company.com',
          recipients: ['jane.smith@lawfirm.com']
        }
      },
      {
        id: 'expert_001',
        type: 'expert',
        title: 'Financial Expert Report',
        content: 'Analysis of contract valuation and breach damages',
        x: 400,
        y: 250,
        size: 22,
        metadata: {
          date: '2023-06-01',
          expert: 'Dr. Sarah Johnson',
          qualifications: 'CPA, MBA'
        }
      },
      {
        id: 'physical_001',
        type: 'physical',
        title: 'Signed Contract Copy',
        content: 'Physical copy of signed contract with wet signatures',
        x: 150,
        y: 400,
        size: 20,
        metadata: {
          date: '2023-01-15',
          location: 'stored in evidence room',
          condition: 'good'
        }
      }
    ];

    // Create sample evidence edges
    demoEdges = [
      {
        source: 'witness_001',
        target: 'document_001',
        type: 'supports',
        weight: 0.9,
        metadata: {
          relationship: 'observed signing',
          strength: 'strong'
        }
      },
      {
        source: 'email_001',
        target: 'document_001',
        type: 'references',
        weight: 0.7,
        metadata: {
          relationship: 'discusses terms',
          strength: 'moderate'
        }
      },
      {
        source: 'expert_001',
        target: 'document_001',
        type: 'analyzes',
        weight: 0.95,
        metadata: {
          relationship: 'valuation analysis',
          strength: 'very strong'
        }
      },
      {
        source: 'physical_001',
        target: 'document_001',
        type: 'corroborates',
        weight: 0.85,
        metadata: {
          relationship: 'physical evidence',
          strength: 'strong'
        }
      },
      {
        source: 'witness_001',
        target: 'email_001',
        type: 'communicated',
        weight: 0.6,
        metadata: {
          relationship: 'email exchange',
          strength: 'moderate'
        }
      }
    ];
  }

  function handleCaseChange() {
    // Regenerate demo data based on case type
    generateDemoData();
  }
</script>

<svelte:head>
  <title>Phase 72 Hybrid - Evidence Canvas Demo</title>
</svelte:head>

<div class="demo-container">
  <header class="demo-header">
    <h1>Phase 72 Hybrid: WebGPU Evidence Canvas</h1>
    <p>Demonstrating GPU-accelerated legal case visualization and AI-powered analysis</p>
  </header>

  <div class="demo-controls">
    <div class="control-group">
      <label for="case-type">Case Type:</label>
      <select id="case-type" bind:value={caseType} onchange={handleCaseChange}>
        <option value="contract-dispute">Contract Dispute</option>
        <option value="personal-injury">Personal Injury</option>
        <option value="intellectual-property">Intellectual Property</option>
        <option value="employment">Employment</option>
        <option value="real-estate">Real Estate</option>
      </select>
    </div>

    <div class="control-group">
      <label for="jurisdiction">Jurisdiction:</label>
      <select id="jurisdiction" bind:value={jurisdiction} onchange={handleCaseChange}>
        <option value="federal">Federal</option>
        <option value="state">State</option>
        <option value="international">International</option>
      </select>
    </div>

    <div class="demo-info">
      <h3>Demo Features</h3>
      <ul>
        <li><strong>WebGPU Acceleration:</strong> GPU-powered graph layout and similarity analysis</li>
        <li><strong>Interactive Visualization:</strong> Click and drag to explore evidence relationships</li>
        <li><strong>AI Suggestions:</strong> Intelligent recommendations based on evidence patterns</li>
        <li><strong>Real-time Analysis:</strong> Dynamic similarity computation and clustering</li>
        <li><strong>Multi-modal Evidence:</strong> Support for documents, witnesses, digital evidence, and more</li>
      </ul>
    </div>
  </div>

  <div class="canvas-section">
    <EvidenceCanvas
      {caseId}
      {caseType}
      {jurisdiction}
      initialNodes={demoNodes}
      initialEdges={demoEdges}
    />
  </div>

  <footer class="demo-footer">
    <p>
      <strong>Phase 72 Hybrid</strong> combines WebGPU evidence visualization with agentic error-fixing
      to create self-healing legal AI systems. This demo showcases the evidence canvas component.
    </p>
    <p>
      <a href="/phase72-docs" target="_blank">View Full Documentation</a> |
      <a href="/api-demo" target="_blank">API Reference</a> |
      <a href="/benchmarks" target="_blank">Performance Benchmarks</a>
    </p>
  </footer>
</div>

<style>
  .demo-container {
    height: 100vh;
    display: flex;
    flex-direction: column;
    background: #1a1a1a;
    color: #ffffff;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  }

  .demo-header {
    background: linear-gradient(135deg, #2a2a2a 0%, #1a1a1a 100%);
    padding: 2rem;
    text-align: center;
    border-bottom: 1px solid #444;
  }

  .demo-header h1 {
    margin: 0 0 0.5rem 0;
    color: #4fc3f7;
    font-size: 2.5rem;
    font-weight: 300;
  }

  .demo-header p {
    margin: 0;
    color: #cccccc;
    font-size: 1.1rem;
  }

  .demo-controls {
    display: flex;
    gap: 2rem;
    padding: 1.5rem 2rem;
    background: #2a2a2a;
    border-bottom: 1px solid #444;
    align-items: flex-start;
  }

  .control-group {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .control-group label {
    color: #cccccc;
    font-size: 0.9rem;
    font-weight: 500;
  }

  .control-group select {
    padding: 0.5rem;
    background: #333;
    border: 1px solid #555;
    border-radius: 4px;
    color: #ffffff;
    font-size: 0.9rem;
    min-width: 150px;
  }

  .demo-info {
    flex: 1;
  }

  .demo-info h3 {
    margin: 0 0 1rem 0;
    color: #4fc3f7;
    font-size: 1.1rem;
  }

  .demo-info ul {
    margin: 0;
    padding-left: 1.5rem;
  }

  .demo-info li {
    margin-bottom: 0.5rem;
    color: #cccccc;
    line-height: 1.4;
  }

  .demo-info strong {
    color: #ffffff;
  }

  .canvas-section {
    flex: 1;
    position: relative;
  }

  .demo-footer {
    background: #2a2a2a;
    padding: 1.5rem 2rem;
    border-top: 1px solid #444;
    text-align: center;
  }

  .demo-footer p {
    margin: 0 0 1rem 0;
    color: #cccccc;
    line-height: 1.5;
  }

  .demo-footer a {
    color: #4fc3f7;
    text-decoration: none;
    margin: 0 1rem;
  }

  .demo-footer a:hover {
    text-decoration: underline;
  }

  @media (max-width: 768px) {
    .demo-controls {
      flex-direction: column;
      gap: 1rem;
    }

    .demo-header h1 {
      font-size: 2rem;
    }

    .demo-header p {
      font-size: 1rem;
    }
  }
</style>
