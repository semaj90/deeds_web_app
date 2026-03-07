<script lang="ts">
  import 
    Button,
    LinkButton,
    YoRHaSearchBar,
    ThemeToggle,
    Tabs,
    Card,
    CardContent,
    CardHeader,
    CardTitle,
    NESButton,
    NESCard,
    NESModal,
    NESGamingShowcase,
    DraggableModal,
    EvidenceBoard,
    Toolbar,
   from "$lib/components/ui/enhanced-bits.svelte";
  let activeDemo = $state('overview');
  let searchQuery = $state('');
  let showYoRHaModal = $state(false);
  let showNESModal = $state(false);
  let showEvidenceBoard = $state(false);
  const demoSections = [
    { id: 'overview', title: 'Overview', icon: '🏠' },
    { id: 'buttons', title: 'Buttons', icon: '🔘' },
    { id: 'cards', title: 'Cards', icon: '🎴' },
    { id: 'search', title: 'Search', icon: '🔍' },
    { id: 'nes-gaming', title: 'NES Gaming', icon: '🎮' },
    { id: 'yorha', title: 'YoRHa Theme', icon: '🤖' },
    { id: 'evidence', title: 'Evidence Board', icon: '📋' },
    { id: 'integration', title: 'Integration', icon: '🔧' },
  ] as const;
  function handleSearchDemo(_event: CustomEvent) {
    const { query } = e(vent as CustomEvent).detail;
    console.log('Search demo:', query);
  }
</script>

<div class="demo-showcase">
  <!-- Header -->
  <div class="demo-header">
    <div class="header-content">
      <div class="title-section">
        <h1 class="demo-title">Enhanced-Bits Showcase</h1>
        <p class="demo-subtitle">Complete UI component library for YoRHa Legal AI Platform</p>
      </div>
      <div class="header-controls">
        <ThemeToggle />
        <Button variant="primary" onclick={() => window.open('/all-routes', '_blank')}
          >View All Routes</Button
        >
      </div>
    </div>
  </div>
  <!-- Navigation Tabs -->
  <div class="demo-navigation">
    <Tabs bind:value={activeDemo} orientation="horizontal" class="demo-tabs">
      <div class="tabs-list">
        {#each Array.isArray(demoSections) ? demoSections : [] as section}
          <button
            class="tab-trigger {activeDemo === section.id ? 'active' : ''}"
            onclick={() => (activeDemo = section.id)}
          >
            <span class="tab-icon">{section.icon}</span>
            <span class="tab-label">{section.title}</span>
          </button>
        {/each}
      </div>
    </Tabs>
  </div>
  <!-- Demo Content -->
  <div class="demo-content">
    {#if activeDemo === 'overview'}
      <!-- Overview Section -->
      <div class="overview-section">
        <Card class="overview-card">
          <CardHeader>
            <CardTitle>Enhanced-Bits UI Library</CardTitle>
          </CardHeader>
          <CardContent>
            <div class="features-grid">
              <div class="feature-item">
                <h3>🎨 Multiple Themes</h3>
                <p>YoRHa cyberpunk, NES gaming, and professional legal themes</p>
              </div>
              <div class="feature-item">
                <h3>🔧 Modular Components</h3>
                <p>Mix and match components with consistent API</p>
              </div>
              <div class="feature-item">
                <h3>♿ Accessibility First</h3>
                <p>Full keyboard navigation and screen reader support</p>
              </div>
              <div class="feature-item">
                <h3>📱 Responsive Design</h3>
                <p>Works seamlessly across all device sizes</p>
              </div>
              <div class="feature-item">
                <h3>⚡ Svelte 5 Native</h3>
                <p>Built with latest Svelte 5 runes and snippets</p>
              </div>
              <div class="feature-item">
                <h3>🎯 Type Safe</h3>
                <p>Full TypeScript support with proper prop types</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    {:else if activeDemo === 'buttons'}
      <!-- Buttons Demo -->
      <div class="buttons-demo">
        <Card title="Standard Buttons" class="demo-card">
          <div class="button-grid">
            <Button variant="default">Default</Button>
            <Button variant="primary">Primary</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="outline">Outline</Button>
            <Button variant="destructive">Destructive</Button>
          </div>
        </Card>
        <Card title="Button Sizes" class="demo-card">
          <div class="button-grid">
            <Button size="sm">Small</Button>
            <Button size="md">Medium</Button>
            <Button size="lg">Large</Button>
          </div>
        </Card>
        <Card title="Link Buttons" class="demo-card">
          <div class="button-grid">
            <LinkButton href="/demo">Demo Link</LinkButton>
            <LinkButton href="/about" variant="primary">Primary Link</LinkButton>
            <LinkButton href="/contact" variant="outline">Outline Link</LinkButton>
          </div>
        </Card>
      </div>
    {:else if activeDemo === 'cards'}
      <!-- Cards Demo -->
      <div class="cards-demo">
        <div class="cards-grid">
          <Card>
            <CardHeader>
              <CardTitle>Basic Card</CardTitle>
            </CardHeader>
            <CardContent>
              <p>This is a basic card component with header and content.</p>
            </CardContent>
          </Card>
          <Card class="elevated-card">
            <CardHeader>
              <CardTitle>Elevated Card</CardTitle>
            </CardHeader>
            <CardContent>
              <p>This card has elevated styling with enhanced shadows.</p>
            </CardContent>
          </Card>
          <Card class="interactive-card">
            <CardHeader>
              <CardTitle>Interactive Card</CardTitle>
            </CardHeader>
            <CardContent>
              <p>This card responds to hover and click interactions.</p>
              <Button variant="primary" size="sm">Action</Button>
            </CardContent>
          </Card>
        </div>
      </div>
    {:else if activeDemo === 'search'}
      <!-- Search Demo -->
      <div class="search-demo">
        <Card title="YoRHa Search Bar" class="demo-card">
          <div class="search-container">
            <YoRHaSearchBar
              bind:value={searchQuery}
              theme="yorha"
              placeholder="Search legal documents, cases, evidence..."
              onsearch={handleSearchDemo}
              maxSuggestions={6}
            />
          </div>
        </Card>
        <Card title="Legal Theme Search" class="demo-card">
          <div class="search-container">
            <YoRHaSearchBar
              theme="legal"
              placeholder="Professional legal search..."
              onsearch={handleSearchDemo}
            />
          </div>
        </Card>
      </div>
    {:else if activeDemo === 'nes-gaming'}
      <!-- NES Gaming Demo -->
      <div class="nes-demo">
        <Card title="NES Gaming Components" class="demo-card nes-themed">
          <div class="nes-buttons-grid">
            <NESButton variant="default">Default</NESButton>
            <NESButton variant="primary">Primary</NESButton>
            <NESButton variant="success">Success</NESButton>
            <NESButton variant="warning">Warning</NESButton>
            <NESButton variant="danger">Danger</NESButton>
          </div>
          <div class="nes-cards-grid">
            <NESCard title="Player Stats" subtitle="Current game session">
              <div class="nes-stat-content">
                <div>Score: 12,345</div>
                <div>Level: 7</div>
                <div>Lives: ♥ ♥ ♥</div>
              </div>
            </NESCard>
            <NESCard variant="dark" title="System Info" subtitle="Platform status">
              <div class="nes-stat-content">
                <div>Status: ONLINE</div>
                <div>GPU: ACTIVE</div>
                <div>Memory: 87%</div>
              </div>
            </NESCard>
          </div>
          <NESButton onclick={() => (showNESModal = true)}>Open NES Modal</NESButton>
        </Card>
        <!-- Full NES Gaming Showcase -->
        <Card title="Complete NES Gaming Interface" class="demo-card">
          <NESGamingShowcase />
        </Card>
      </div>
    {:else if activeDemo === 'yorha'}
      <!-- YoRHa Theme Demo -->
      <div class="yorha-demo">
        <Card title="YoRHa Cyberpunk Interface" class="demo-card yorha-themed">
          <div class="yorha-content">
            <p>Experience the cyberpunk aesthetic inspired by NieR: Automata</p>
            <div class="yorha-features">
              <div class="feature-block">
                <h4>Neural Network Status</h4>
                <div class="status-indicators">
                  <div class="status-item online">AI Core: ONLINE</div>
                  <div class="status-item processing">Analysis: PROCESSING</div>
                  <div class="status-item online">Memory: STABLE</div>
                </div>
              </div>
              <div class="feature-block">
                <h4>System Operations</h4>
                <div class="operation-buttons">
                  <Button variant="primary">Initialize</Button>
                  <Button variant="ghost">Diagnostics</Button>
                  <Button variant="outline">Configure</Button>
                </div>
              </div>
            </div>
            <Button onclick={() => (showYoRHaModal = true)}>Open YoRHa Modal</Button>
          </div>
        </Card>
      </div>
    {:else if activeDemo === 'evidence'}
      <!-- Evidence Board Demo -->
      <div class="evidence-demo">
        <Card title="Interactive Evidence Board" class="demo-card">
          <p>Drag-and-drop evidence management system with YoRHa styling</p>
          <Button onclick={() => (showEvidenceBoard = true)}>Open Evidence Board</Button>
        </Card>
      </div>
    {:else if activeDemo === 'integration'}
      <!-- Integration Demo -->
      <div class="integration-demo">
        <Card title="Component Integration Examples" class="demo-card">
          <div class="integration-examples">
            <div class="example-section">
              <h4>Toolbar Integration</h4>
              <Toolbar
                tools={[
                  { id: 'search', icon: '🔍', label: 'Search' },
                  { id: 'filter', icon: '🔽', label: 'Filter' },
                  { id: 'export', icon: '📤', label: 'Export' },
                ]}
              />
            </div>
            <div class="example-section">
              <h4>Mixed Component Layout</h4>
              <div class="mixed-layout">
                <Card class="layout-card">
                  <CardHeader>
                    <CardTitle>Legal Document Analysis</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <YoRHaSearchBar placeholder="Search documents..." theme="legal" />
                    <div class="action-buttons">
                      <Button variant="primary">Analyze</Button>
                      <NESButton variant="success">Process</NESButton>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>
        </Card>
      </div>
    {/if}
  </div>
  <!-- Modals -->
  <NESModal bind:open={showNESModal} title="NES System Information" variant="dark">
    <div class="modal-demo-content">
      <p>This is a demonstration of the NES-styled modal component.</p>
      <div class="modal-stats">
        <div>Component: NESModal</div>
        <div>Theme: NES Gaming</div>
        <div>Framework: Svelte 5</div>
      </div>
      <NESButton onclick={() => (showNESModal = false)}>Close Modal</NESButton>
    </div>
  </NESModal>
  <DraggableModal bind:open={showYoRHaModal} title="YoRHa System Interface" theme="yorha">
    <div class="yorha-modal-content">
      <p>Neural network interface established. All systems nominal.</p>
      <div class="system-readout">
        <div class="readout-line">CORE_TEMP: 37.2°C</div>
        <div class="readout-line">MEMORY_USAGE: 67.4%</div>
        <div class="readout-line">AI_STATUS: OPERATIONAL</div>
        <div class="readout-line">LAST_UPDATE: {new Date().toISOString()}</div>
      </div>
    </div>
  </DraggableModal>
  <DraggableModal
    bind:open={showEvidenceBoard}
    title="Evidence Management System"
    theme="legal"
    width={1000}
    height={700}
  >
    <EvidenceBoard />
  </DraggableModal>
</div>

<style>
  .demo-showcase {
    min-height: 100vh;
    background: var(--color-bg-primary, #f8fafc);
    padding: 2rem;
  }
  .demo-header {
    margin-bottom: 2rem;
    padding: 2rem;
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
    font-weight: 800;
    margin: 0 0 0.5rem 0;
    background: linear-gradient(45deg, #4a90e2, #8e44ad);
    background-clip: text;
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
  }
  .demo-subtitle {
    font-size: 1.125rem;
    color: var(--color-text-secondary, #6b7280);
    margin: 0;
  }
  .header-controls {
    display: flex;
    gap: 1rem;
    align-items: center;
  }
  .demo-navigation {
    margin-bottom: 2rem;
  }
  .tabs-list {
    display: flex;
    gap: 0.5rem;
    padding: 0.5rem;
    background: var(--color-surface, #ffffff);
    border-radius: 1rem;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
    overflow-x: auto;
  }
  .tab-trigger {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.75rem 1rem;
    border: none;
    background: transparent;
    color: var(--color-text-secondary, #6b7280);
    cursor: pointer;
    border-radius: 0.5rem;
    font-weight: 500;
    transition: all 0.2s ease;
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
    flex-direction: column;
    gap: 2rem;
  }
  .demo-card {
    background: var(--color-surface, #ffffff);
    border-radius: 1rem;
    padding: 2rem;
    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
  }
  /* Overview Section */
  .features-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
    gap: 1.5rem;
  }
  .feature-item {
    padding: 1.5rem;
    border: 2px solid var(--color-border, #e5e7eb);
    border-radius: 0.5rem;
    transition: all 0.2s ease;
  }
  .feature-item:hover {
    border-color: var(--color-primary, #4a90e2);
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(74, 144, 226, 0.15);
  }
  .feature-item h3 {
    margin: 0 0 0.5rem 0;
    font-size: 1.125rem;
    font-weight: 600;
  }
  .feature-item p {
    margin: 0;
    color: var(--color-text-secondary, #6b7280);
    line-height: 1.5;
  }
  /* Button Demo */
  .button-grid {
    display: flex;
    flex-wrap: wrap;
    gap: 1rem;
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
    cursor: pointer;
    transition: all 0.2s ease;
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
    flex-wrap: wrap;
    gap: 1rem;
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
    flex-direction: column;
    gap: 0.5rem;
    font-size: 0.75rem;
  }
  /* YoRHa Demo */
  .yorha-themed {
    background: linear-gradient(135deg, #0a0a0a, #1a1a1a);
    color: #e0e0e0;
    border: 2px solid #606060;
  }
  .yorha-features {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
    gap: 2rem;
    margin: 2rem 0;
  }
  .feature-block h4 {
    margin: 0 0 1rem 0;
    color: #ffd700;
    font-size: 1rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  .status-indicators {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  .status-item {
    padding: 0.5rem;
    border: 1px solid #606060;
    font-family: monospace;
    font-size: 0.875rem;
  }
  .status-item.online {
    background: rgba(0, 255, 65, 0.1);
    border-color: #00ff41;
    color: #00ff41;
  }
  .status-item.processing {
    background: rgba(255, 170, 0, 0.1);
    border-color: #ffaa00;
    color: #ffaa00;
  }
  .operation-buttons {
    display: flex;
    gap: 1rem;
  }
  /* Integration Demo */
  .integration-examples {
    display: flex;
    flex-direction: column;
    gap: 2rem;
  }
  .example-section h4 {
    margin: 0 0 1rem 0;
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
    display: flex;
    gap: 1rem;
    margin-top: 1rem;
  }
  /* Modal Content */
  .modal-demo-content,
  .yorha-modal-content {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }
  .modal-stats,
  .system-readout {
    padding: 1rem;
    background: rgba(0, 0, 0, 0.1);
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
      flex-direction: column;
      gap: 1rem;
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
