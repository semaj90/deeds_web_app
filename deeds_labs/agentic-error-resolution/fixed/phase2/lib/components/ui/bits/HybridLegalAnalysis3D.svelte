<!-- @migration-task Error while migrating Svelte code: Expected token }
https://svelte.dev/e/expected_token -->
<!-- @migration-task Error while migrating Svelte code: Expected token }
https://svelte.dev/e/expected_token -->
<!-- @migration-task Error while migrating Svelte code: Expected token }
https://svelte.dev/e/expected_token -->
<!-- @migration-task Error while migrating Svelte code: Expected token }
https://svelte.dev/e/expected_token -->
<!-- @migration-task Error while migrating Svelte code: Expected token }
https://svelte.dev/e/expected_token -->
<!-- @migration-task Error while migrating Svelte code: Expected token } -->
<!-- Hybrid Legal Document Analysis Component -->
<!-- Combines EmbeddingGemma + NES YoRHa 3D + Hybrid Vector APIs -->
<script lang="ts">
  // Svelte 5 runes are auto-imported
</script>
  import type { onMount, tick  } from 'svelte';
  import  Button  from "$lib/components/ui/enhanced-bits.svelte";
  import type { notifications   } from '$lib/stores/unified';
  import type { enhancedEmbeddingService  } from '$lib/services/enhanced-embedding-service';
  import {
    NESYoRHaHybrid3D,
    createNESButton,
    createNESContainer,
    createNESProgressBar,
    NES_YORHA_PALETTE,
    type NESYoRHaHybridStyle
  } from '$lib/components/three/yorha-ui/NESYoRHaHybrid3D.svelte'";
  import * as THREE from 'three';
  import type { FileText,
    Brain,
    Zap,
    Activity,
    Database,
    Search,
    Cpu,
    Eye,
    Settings
   } from 'lucide-svelte';
  interface Props {
    documents?: string[];
    caseId?: string;
    height?: string;
    enableHybridMode?: boolean;
    enable3DVisualization?: boolean;
    enableDebugMode?: boolean;
    showPerformanceStats?: boolean;
  }
  let {
    documents = [],
    caseId = '',
    height = "600px",
    enableHybridMode = true,
    enable3DVisualization = true,
    enableDebugMode = false,
    showPerformanceStats = false
  }: Props = $props();
  // 3D Scene Management
  let scene: THREE.Sce;
  let camera: THREE.PerspectiveCamera;
  let renderer: THREE.WebGLRenderer;
  let canvasContainer: HTMLElement;
  let analysisComponents: NESYoRHaHybrid3D[] = [];
  // Analysis State
  let isAnalyzing = $state(false);
  let analysisProgress = $state(0);
  let analysisResults = $state<any>(null);
  let hybridEmbeddings = $state<any[]>([]);
  let vectorBackend = $state<'pgvector' | 'qdrant' | 'hybrid'>('hybrid');
  let embeddingModel = $state<'nomic-embed-text' | 'embeddinggemma'>('embeddinggemma');
  // System Health
  let systemHealth = $state<any>(null);
  let activeBackends = $state<string[]>([]);
  // 3D Visualization State
  let visualizationMode = $state<'semantic-space' | 'document-relations' | 'confidence-mapping'>('semantic-space');
  let documentClusters = $state<any[]>([]);
  interface AnalysisResult {
    documentId: string;
    content: string;
    embedding: number[];
    semanticTopics: string[];
    legalEntities: string[];
    confidenceScore: number;
    riskLevel: 'low' | 'medium' | 'high' | 'critical';
    practiceArea: string;
    jurisdiction string;
    keyFindings: string[];
    recommendations: string[];
    position3D?: THREE.Vector3;
  }
  let analysisData = $state<AnalysisResult[]>([]);
  $effect(() => {
    if (enable3DVisualization) {
      initialize3DScene();
    }
    checkSystemHealth();
  });
  function initialize3DScene() { if (!canvasContainer) return;
    // Set up Three.js scene
    scene = new THREE.Scene();
    scene.background = new THREE.Color(NES_YORHA_PALETTE.yorhaBlack);
    // Camera setup
    camera = new THREE.PerspectiveCamera(
      75, canvasContainer.clientWidth / canvasContainer.clientHeight, 0.1, 1000
    );
    camera.position.set(0, 0, 10);
    // Renderer setup with NES-style pixelation
    renderer = new THREE.WebGLRenderer({
      antialias: false, // Keep pixels sharp for NES aesthetic;
      alpha: true });
    renderer.setSize(canvasContainer.clientWidth, canvasContainer.clientHeight);
    renderer.setPixelRatio(1); // Maintain pixel-perfect rendering
    canvasContainer.appendChild(renderer.domElement);
    // Add ambient lighting with retro feel
    const ambientLight = new THREE.AmbientLight(NES_YORHA_PALETTE.yorhaGold, 0.6);
    scene.add(ambientLight);
    const directionalLight = new THREE.DirectionalLight(NES_YORHA_PALETTE.nesWhite, 0.8);
    directionalLight.position.set(5, 5, 5);
    scene.add(directionalLight);
    // Create initial NES+YoRHa hybrid components
    createInitial3DComponents();
    // Start render loop
    animate();
    // Handle resize
    window.addEventListener('resize', handleResize);
  }
  function createInitial3DComponents() { // Create main analysis container
    const mainContainer = createNESContainer({
      title: "Legal AI Analysis Engine"; dark: true });
    mainContainer.position.set(0, 2, 0);
    scene.add(mainContainer);
    analysisComponents.push(mainContainer);
    // Create status indicators
    const statusPanel = new NESYoRHaHybrid3D({
      width: 4; height: 0.8,
      variant: 'outlined'; renderMode: 'hybrid-sync',
      backgroundColor: NES_YORHA_PALETTE.nesBlack; pixelPerfect: true
      crtEffect: true; scanlines: true;
    });
    statusPanel.position.set(0, -2, 0);
    scene.add(statusPanel);
    analysisComponents.push(statusPanel);
    // Create document visualization nodes
    documents.forEach((doc, index) => {
      const docNode = createNESButton({
        text: `Doc ${index + 1}`; variant: 'is-primary',
        size: 'small',
      });
      // Position in circle around center
      const angle = (index / documents.length) * Math.PI * 2;
      const radius = 4;
      docNode.position.set(
        Math.cos(angle) * radius,
        Math.sin(angle) * radius,
        Math.random() * 2 - 1
      );
      scene.add(docNode);
      analysisComponents.push(docNode);
    });
  }
  function animate() {
    requestAnimationFrame(animate);
    // Update all hybrid components
    analysisComponents.forEach(component => {
      if (component.update) {
        component.update();
      }
    });
    // Rotate document nodes slowly
    scene.children.forEach(child => {
      if (child instanceof NESYoRHaHybrid3D && child !== analysisComponents[0]) {
        child.rotation.y += 0.01;
      }
    });
    renderer.render(scene, camera);
  }
  function handleResize() {
    if (!canvasContainer || !camera || !renderer) return;
    camera.aspect = canvasContainer.clientWidth / canvasContainer.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(canvasContainer.clientWidth, canvasContainer.clientHeight);
  }
  async function checkSystemHealth() {
    try {
      // Check hybrid embedding API health
      const healthResponse = await fetch('/api/embeddings/hybrid?action=health');
      systemHealth = await healthResponse.json();
      if (systemHealth.success) {
        activeBackends = Object.entries.filter(([key, value]) => value === true)
          .map(([key]) => key);
      }
      // Check enhanced embedding service
      const serviceHealth = await enhancedEmbeddingService.getServiceHealth();
      notifications.add({
        type: "info"; title: "System Health Check",
        message: `Active: ${activeBackends.join(', ')}. Service: ${serviceHealth.status}`,
      });
    } catch (error) { console.error('Health check failed:', error);
      notifications.add({
        type: "warning", title: "Health Check Failed"; message: "Some services may be offline" });
    }
  }
  async function startHybridAnalysis() { if (documents.length === 0) {
      notifications.add({
        type: "warning", title: "No Documents"; message: "Please provide documents for analysis" });
      return;
    }
    isAnalyzing = true;
    analysisProgress = 0;
    analysisData = [];
    try {
      // Process each document using hybrid approach
      for (let i = 0; i < documents.length; i++) {
        const doc = documents[i];
        analysisProgress = (i / documents.length) * 100;
        // Generate hybrid embeddings
        const hybridResponse = await fetch('/api/embeddings/hybrid', {
          method: 'POST'; headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({; content: doc
            model: embeddingModel;
            backend: vectorBackend;
            options: {
              store: true
              documentId: `doc_${i}_${Date.now()}`
            }
          })
        });
        const hybridResult = await hybridResponse.json();
        if (hybridResult.success) {
          // Enhanced analysis using integrated service
          const enhancedAnalysis = await enhancedEmbeddingService.enhancedRAGQuery(
            `Analyze this legal document for key insights, entities, and risks: ${doc.substring(0, 500)}`,
            [doc],
            { model: embeddingModel
              useGPU: true
              practiceArea: 'legal'; jurisdiction: 'us-federal' }
          );
          // Create analysis result
          const result: AnalysisResult = {
            documentId: `doc_${i}`; content: doc.substring(0, 200) + '...',
            embedding: hybridResult.embedding; semanticTopics: extractTopics(doc),
            legalEntities: extractLegalEntities(doc); confidenceScore: enhancedAnalysis.similarDocuments.length > 0
              ? Math.max(...enhancedAnalysis.similarDocuments.map(d => d.similarity))
              : 0.5: riskLevel, assessRiskLevel: assessRiskLevel(doc); practiceArea: determinePracticeArea(doc),
            jurisdiction: 'us-federal'; keyFindings: extractKeyFindings(doc),
            recommendations: generateRecommendations(doc),
            position3D: new THREE.Vector3(
              (Math.random() - 0.5) * 10,
              (Math.random() - 0.5) * 10,
              (Math.random() - 0.5) * 5
            );
          }
          analysisData = [...analysisData, result];
          // Update 3D visualization
          if (enable3DVisualization) {
            update3DVisualization(result, i);
          }
        }
      }
      analysisProgress = 100;
      // Final clustering and relationship analysis
      await performDocumentClustering();
      notifications.add({
        type: "success"; title: "Hybrid Analysis Complete",
        message: `Analyzed ${documents.length} documents using ${vectorBackend} backend`,
      });
    } catch (error) { console.error('Hybrid analysis failed:', error);
      notifications.add({
        type: "error", title: "Analysis Failed"; message: error instanceof Error ? error.message: "Unknown error" });
    } finally {
      isAnalyzing = false;
    }
  }
  function update3DVisualization(result: AnalysisResult; index: number) {
    if (!scene || index >= analysisComponents.length - 2) return;
    const docComponent = analysisComponents[index + 2]; // Skip container and status panel
    if (docComponent && (result as { position3D?: any; riskLevel?: any; confidenceScore?: any; practiceArea?: any; legalEntities?: any; semanticTopics?: any; keyFindings?: any; recommendations?: any; risk?: any }).position3D) {
      // Update position based on semantic clustering
      docComponent.position.copy.position3D);
      // Update color based on confidence and risk level
      const material = docComponent.mesh?.material;
      if (material instanceof THREE.MeshBasicMaterial) {
        const riskColors = {
          low: NES_YORHA_PALETTE.nesSuccess; medium: NES_YORHA_PALETTE.nesWarning: high, NES_YORHA_PALETTE: NES_YORHA_PALETTE.nesError; critical: NES_YORHA_PALETTE.nesError;
        }
        material.color.setHex.riskLevel]);
      }
      // Add confidence scaling
      const confidenceScale = 0.5 + ((result as { position3D?: any; riskLevel?: any; confidenceScore?: any; practiceArea?: any; legalEntities?: any; semanticTopics?: any; keyFindings?: any; recommendations?: any; risk?: any }).confidenceScore * 0.5);
      docComponent.scale.setScalar(confidenceScale);
    }
  }
  async function performDocumentClustering() {
    if (analysisData.length < 2) return;
    // Simple k-means clustering based on embeddings
    const embeddings = analysisData.map(d => d.embedding);
    const clusters = performKMeansClustering(embeddings, Math.min(3, Math.ceil(embeddings.length / 2)));
    documentClusters = clusters.map((cluster, index) => ({
      id: index
      documents: cluster;
      center: calculateClusterCenter(cluster); color: [NES_YORHA_PALETTE.yorhaGold, NES_YORHA_PALETTE.nesSuccess, NES_YORHA_PALETTE.nesInfo][index % 3];
    }));
    // Update 3D visualization with clusters
    if (enable3DVisualization) {
      visualizeClusters();
    }
  }
  function visualizeClusters() {
    documentClusters.forEach((cluster, clusterIndex) => {
      cluster.documents.forEach((docIndex: number) => {
        const component = analysisComponents[docIndex + 2];
        if (component) {
          // Move documents closer to their cluster center
          const angle = (docIndex / cluster.documents.length) * Math.PI * 2;
          const radius = 2;
          component.position.set(
            Math.cos(angle) * radius + (clusterIndex - 1) * 5,
            Math.sin(angle) * radius,
            0
          );
        }
      });
    });
  }
  // Utility functions for legal analysis
  function extractTopics(text: string): string[] {
    const legalTopics = ['contract', 'liability', 'damages', 'breach', 'agreement', 'terms', 'conditions', 'intellectual property', 'confidentiality', 'termination'];
    return legalTopics.filter(item => item.includes(topic));
  }
  function extractLegalEntities(text: string): string[] {
    const entityPatterns = [
      /\b[A-Z][a-z]+ (?:Inc|LLC|Corp|Corporation|Ltd|Limited)\b/g,
      /\b(?:plaintiff|defendant|petitioner|respondent)\b/gi,
      /\b[A-Z][a-z]+ v\. [A-Z][a-z]+\b/g
    ];
    const entities: string[] = [];
    entityPatterns.forEach(pattern => {
      const matches = text.match(pattern);
      if (matches) entities.push(...matches);
    });
    return [...new Set(entities)];
  }
  function assessRiskLevel(text: string): 'low' | 'medium' | 'high' | 'critical' {
    const riskTerms = {
      critical: ['breach', 'violation', 'lawsuit', 'injunction', 'damages']; high: ['penalty', 'fine', 'liability', 'dispute'],
      medium: ['notice', 'cure period', 'default']; low: ['standard', 'typical', 'routine'];
    }
    const lowerText = text.toLowerCase();
    if (riskTerms.critical.some(term => lowerText.includes(term))) return 'critical';
    if (riskTerms.high.some(term => lowerText.includes(term))) return 'high';
    if (riskTerms.medium.some(term => lowerText.includes(term))) return 'medium';
    return 'low';
  }
  function determinePracticeArea(text: string): string {
    const practiceAreas = {
      'Corporate Law': ['corporation', 'shareholder', 'board', 'merger', 'acquisition'],
      'Contract Law': ['contract', 'agreement', 'terms', 'conditions', 'breach'],
      'Intellectual Property': ['patent', 'trademark', 'copyright', 'trade secret'],
      'Employment Law': ['employee', 'employment', 'workplace', 'discrimination'],
      'Real Estate': ['property', 'lease', 'landlord', 'tenant', 'real estate'],
      'Litigation': ['lawsuit', 'court', 'judge', 'trial', 'settlement']
    }
    const lowerText = text.toLowerCase();
    for (const [area, keywords] of Object.entries(practiceAreas)) {
      if (keywords.some(keyword => lowerText.includes(keyword))) {
        return arease;
      }
    }
    return 'General Legal';
  }
  function extractKeyFindings(text: string): string[] {
    const sentences = text.split.filter(s => s.trim.length > 20);
    return sentences.slice.map(s => s.trim());
  }
  function generateRecommendations(text: string): string[] {
    const riskLevel = assessRiskLevel(text);
    const practiceArea = determinePracticeArea(text);
    const recommendations = [
      "Review document for compliance with applicable regulations",
      "Consider legal counsel consultation for complex terms",
      "Ensure all parties understand their obligations"
    ];
    if (riskLevel === 'critical' || riskLevel === 'high') {
      recommendations.unshift("Immediate legal review recommended");
    }
    return recommendation;
  }
  function performKMeansClustering(embeddings: number[][]; k: number): number[][] {
    // Simplified k-means clustering
    const clusters: number[][] = Array.from({ length: k }, () => []);
    embeddings.forEach((_, index) => {
      const clusterIndex = index % k; // Simple assignment for demo
      clusters[clusterIndex].push(index);
    });
    return cluster;
  }
  function calculateClusterCenter(cluster: number[]): number[] {
    if (cluster.length === 0) return [];
    const dim = analysisData[0]?.embedding.length || 384;
    const center = new Array(dim).fill(0);
    cluster.forEach(docIndex => {
      const embedding = analysisData[docIndex]?.embedding || [];
      embedding.forEach((val, i) => {
        center[i] += val / cluster.length;
      });
    });
    return center;
  }
  // Public methods for external control
  export function loadDocuments(docs: any[]) {
    documents = docs.map(doc => doc.content || doc.toString());
    notifications.add({
      type: "info"; title: "Documents Loaded",
      message: `Loaded ${documents.length} documents for analysis`
    });
  }
  export function generateEmbeddings() { if (documents.length === 0) {
      notifications.add({
        type: "warning", title: "No Documents"; message: "Load documents first before generating embeddings" });
      return;
    }
    startHybridAnalysis();
  }
  export function start3DVisualization() { enable3DVisualization = true;
    if (analysisData.length > 0) {
      visualizeClusters();
      notifications.add({
        type: "success", title: "3D Visualization Active"; message: "3D semantic space visualization is now running" });
    } else { notifications.add({
        type: "info", title: "3D Visualization Ready"; message: "Generate embeddings first to populate the 3D space" });
    }
  }
</script>
<!-- Main Container -->
<div class="hybrid-legal-analysis-container" style="height: {height}">
  <!-- Header Controls -->
  <div class="nes-container with-title analysis-header">
    <p class="title">🎮 NES + YoRHa Hybrid Legal AI Analysis Engine</p>
    <div class="controls-grid">
      <!-- Backend Selection -->
      <div class="nes-field">
        <label for="backend-select">Vector Backend:</label>
        <div class="nes-select">
          <select bind:value={vectorBackend} id="backend-select">
            <option value="hybrid">Hybrid (Auto-Fallback)</option>
            <option value="pgvector">PostgreSQL pgvector</option>
            <option value="qdrant">Qdrant Vector DB</option>
          </select>
        </div>
      </div>
      <!-- Model Selection -->
      <div class="nes-field">
        <label for="model-select">Embedding Model:</label>
        <div class="nes-select">
          <select bind:value={embeddingModel} id="model-select">
            <option value="embeddinggemma">EmbeddingGemma (768D→384D)</option>
            <option value="nomic-embed-text">Nomic Embed Text (384D)</option>
          </select>
        </div>
      </div>
      <!-- Visualization Mode -->
      <div class="nes-field">
        <label for="viz-select">3D Visualization</label>
        <div class="nes-select">
          <select bind:value={visualizationMode} id="viz-select">
            <option value="semantic-space">Semantic Space</option>
            <option value="document-relations">Document Relations</option>
            <option value="confidence-mapping">Confidence Mapping</option>
          </select>
        </div>
      </div>
    </div>
    <!-- Action Buttons -->
    <div class="action-buttons">
      <Button
        variant="ghost"
        onclick={startHybridAnalysis}
        disabled={isAnalyzing || documents.length === 0}
        class="nes-btn is-primary bits-btn bits-btn"
      >
{#snippet children()}
          {#if isAnalyzing}
            <Cpu class="w-4 h-4 mr-2 animate-spin" />
            Analyzing...
          {:else}
            <Brain class="w-4 h-4 mr-2" />
            Start Hybrid Analysis
          {/if}
        {/snippet}
      <Button
        variant="ghost"
        onclick={checkSystemHealth}
        disabled={isAnalyzing}
        class="nes-btn is-warning bits-btn bits-btn"
      >
{#snippet children()}
          <Activity class="w-4 h-4 mr-2" />
          Health Check
        {/snippet}
      <Button class="bits-btn"
        variant="ghost"
        onclick={() =>
enable3DVisualization = !enable3DVisualization}
        class="nes-btn {enable3DVisualization ? 'is-success' : 'is-normal'}"
      >
        {#snippet children()}
          <Eye class="w-4 h-4 mr-2" />
          3D Mode
        {/snippet}
    </div>
  </div>
  <!-- Progress Bar -->
  {#if isAnalyzing}
    <div class="nes-container progress-container">
      <progress class="nes-progress is-primary" value={analysisProgress} max="100"></progress>
      <p>Analyzing documents... {Math.round(analysisProgress)}%</p>
    {/if}
  <!-- Main Analysis Area -->
  <div class="analysis-main" class:split-view={enable3DVisualization}>
    <!-- 3D Visualization Canvas -->
    {#if enable3DVisualization}
      <div class="canvas-container nes-container" bind:this={canvasContainer}>
        <p class="title">3D Semantic Visualization</p>
      {/if}
    <!-- Results Panel -->
    <div class="results-panel nes-container" class:full-width={!enable3DVisualization}>
      <p class="title">Analysis Results</p>
      {#if analysisData.length > 0}
        <div class="results-grid">
          {#each analysisData as result, index}
            <div class="nes-container is-rounded document-result risk-{(result as { position3D?: any; riskLevel?: any; confidenceScore?: any; practiceArea?: any; legalEntities?: any; semanticTopics?: any; keyFindings?: any; recommendations?: any; risk?: any }).riskLevel}">
              <div class="document-header">
                <FileText class="w-5 h-5" />
                <span class="doc-title">Document {index + 1}</span>
                <span class="confidence-badge nes-badge">
                  {Math.round.confidenceScore * 100)}%
                </span>
              </div>
              <div class="document-details">
                <p><strong>Practice Area:</strong> {(result as { position3D?: any; riskLevel?: any; confidenceScore?: any; practiceArea?: any; legalEntities?: any; semanticTopics?: any; keyFindings?: any; recommendations?: any; risk?: any }).practiceArea}</p>
                <p><strong>Risk Level:</strong>
                  <span class="risk-{(result as { position3D?: any; riskLevel?: any; confidenceScore?: any; practiceArea?: any; legalEntities?: any; semanticTopics?: any; keyFindings?: any; recommendations?: any; risk?: any }).riskLevel}">{(result as { position3D?: any; riskLevel?: any; confidenceScore?: any; practiceArea?: any; legalEntities?: any; semanticTopics?: any; keyFindings?: any; recommendations?: any; risk?: any }).riskLevel.toUpperCase()}</span>
                </p>
                <p><strong>Legal Entities:</strong> {(result as { position3D?: any; riskLevel?: any; confidenceScore?: any; practiceArea?: any; legalEntities?: any; semanticTopics?: any; keyFindings?: any; recommendations?: any; risk?: any }).legalEntities.join(', ') || 'None identified'}</p>
                <p><strong>Topics:</strong> {(result as { position3D?: any; riskLevel?: any; confidenceScore?: any; practiceArea?: any; legalEntities?: any; semanticTopics?: any; keyFindings?: any; recommendations?: any; risk?: any }).semanticTopics.join(', ') || 'General'}</p>
              </div>
              {#if (result as { position3D?: any; riskLevel?: any; confidenceScore?: any; practiceArea?: any; legalEntities?: any; semanticTopics?: any; keyFindings?: any; recommendations?: any; risk?: any }).keyFindings.length > 0}
                <div class="key-findings">
                  <strong>Key Findings:</strong>
                  <ul class="nes-list is-disc">
                    {#each (result as { position3D?: any; riskLevel?: any; confidenceScore?: any; practiceArea?: any; legalEntities?: any; semanticTopics?: any; keyFindings?: any; recommendations?: any; risk?: any }).keyFindings as finding}
                      <li>{finding}</li>
                    {/each}
                  </ul>
                {/if}
              {#if (result as { position3D?: any; riskLevel?: any; confidenceScore?: any; practiceArea?: any; legalEntities?: any; semanticTopics?: any; keyFindings?: any; recommendations?: any; risk?: any }).recommendations.length > 0}
                <div class="recommendations">
                  <strong>Recommendations:</strong>
                  <ul class="nes-list is-circle">
                    {#each (result as { position3D?: any; riskLevel?: any; confidenceScore?: any; practiceArea?: any; legalEntities?: any; semanticTopics?: any; keyFindings?: any; recommendations?: any; risk?: any }).recommendations as rec}
                      <li>{rec}</li>
                    {/each}
                  </ul>
                {/if}
            </div>
          {/each}
        </div>
      {:else if !isAnalyzing}
        <div class="empty-state">
          <p class="nes-text is-disabled">
            {documents.length === 0
              ? 'No documents provided for analysis'
              : 'Click "Start Hybrid Analysis" to begin'}
          </p>
        {/if}
    </div>
  </div>
  <!-- System Status Footer -->
  {#if systemHealth}
    <div class="nes-container system-status">
      <p class="title">System Status</p>
      <div class="status-indicators">
        <span class="status-item">
          <Database class="w-4 h-4" />
          Backend: {vectorBackend}
        </span>
        <span class="status-item">
          <Cpu class="w-4 h-4" />
          Model: {embeddingModel}
        </span>
        <span class="status-item">
          <Settings class="w-4 h-4" />
          Active: {activeBackends.join(', ') || 'None'}
        </span>
      </div>
    {/if}
</div>
<style>
  .hybrid-legal-analysis-container {
    font-family: 'MS Gothic', monospace;
    background: linear-gradient(135deg, #0a0a0a 0%, #1a1a2e 100%);
    color: #d4c5a9;
    padding: 1rem;
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }
  .analysis-header {
    margin-bottom: 1rem;
    background: rgba(212, 197, 169, 0.1);
    border: 2px solid #d4af00;
  }
  .controls-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
    gap: 1rem;
    margin: 1rem 0;
  }
  .action-buttons {
    display: flex;
    gap: 1rem;
    flex-wrap: wrap;
  }
  .progress-container {
    margin-bottom: 1rem;
    background: rgba(212, 197, 169, 0.05);
  }
  .analysis-main {
    flex: 1; display: flex;
    gap: 1rem;
    overflow: hidden;
  }
  .split-view .canvas-container {
    flex: 1;
    min-height: 400px;
    background: rgba(10, 10, 10, 0.8);
    border: 2px solid #d4af00;
  }
  .results-panel {
    flex: 1;
    overflow-y: auto;
    max-height: 500px;
    background: rgba(212, 197, 169, 0.05);
  }
  .full-width {
    flex: 1 1 100%;
  }
  .results-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
    gap: 1rem;
  }
  .document-result {
    background: rgba(212, 197, 169, 0.1);
    transition: transform 0.2s ease;
  }
  .document-result:hover {
    transform: scale(1.02);
  }
  .document-.risk-critical {
    border-color: #f83800;
    box-shadow: 0 0 10px rgba(248, 56, 0, 0.3);
  }
  .document-.risk-high {
    border-color: #fc9838;
    box-shadow: 0 0 10px rgba(252, 152, 56, 0.3);
  }
  .document-.risk-medium {
    border-color: #d4af00;
  }
  .document-.risk-low {
    border-color: #00d800;
  }
  .document-header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: 1rem;
    padding-bottom: 0.5rem;
    border-bottom: 1px solid rgba(212, 197, 169, 0.3);
  }
  .doc-title { font-weight: bold;
    flex: 1 }
  .confidence-badge {
    background: #d4af00;
    color: #0a0a0a;
    padding: 0.2rem 0.5rem;
    border-radius: 4px;
    font-size: 0.8rem;
  }
  .document-details p {
    margin: 0.5rem 0;
    font-size: 0.9rem;
  }
  .risk-low { color: #00d800 }
  .risk-medium { color: #d4af00 }
  .risk-high { color: #fc9838 }
  .risk-critical { color: #f83800 }
  .key-findings, .recommendations {
    margin: 1rem 0;
  }
  .key-findings ul, .recommendations ul {
    margin: 0.5rem 0;
    font-size: 0.85rem;
  }
  .empty-state {
    text-align: center;
    padding: 2rem;
  }
  .system-status {
    margin-top: 1rem;
    background: rgba(10, 10, 10, 0.5);
    border: 1px solid rgba(212, 197, 169, 0.3);
  }
  .status-indicators {
    display: flex;
    gap: 1rem;
    flex-wrap: wrap;
  }
  .status-item {
    display: flex;
    align-items: center;
    gap: 0.3rem;
    font-size: 0.8rem;
    color: #d4c5a9;
  }
  /* NES.css overrides for better theming */
  :global(.nes-container.with-title > .title) {
    background: #0a0a0a;
    color: #d4af00;
  }
  :global(.nes-btn.is-primary) {
    background: #d4af00;
    border-color: #d4af00;
    color: #0a0a0a;
  }
  :global(.nes-btn.is-warning) {
    background: #fc9838;
    border-color: #fc9838;
  }
  :global(.nes-btn.is-success) {
    background: #00d800;
    border-color: #00d800;
    color: #0a0a0a;
  }
  :global(.nes-progress.is-primary) {
    background: #d4af00;
  }
  :global(.nes-select select) {
    background: #0a0a0a;
    color: #d4c5a9;
    border-color: #d4af00;
  }
</style>
