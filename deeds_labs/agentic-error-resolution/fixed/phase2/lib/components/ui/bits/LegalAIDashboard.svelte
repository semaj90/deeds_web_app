<!-- @migration-task Error while migrating Svelte code: Unexpected block closing tag
https://svelte.dev/e/block_unexpected_close -->
<!-- @migration-task Error while migrating Svelte code: Unexpected block closing tag
https://svelte.dev/e/block_unexpected_close -->
<!-- @migration-task Error while migrating Svelte code: Unexpected block closing tag
https://svelte.dev/e/block_unexpected_close -->
<!-- @migration-task Error while migrating Svelte code: Unexpected block closing tag
https://svelte.dev/e/block_unexpected_close -->
<!-- Enhanced-Bits Legal AI Dashboard -->
<!-- Complete integration of Citations, Reports, and POI systems -->
<script lang="ts">
  import type { onMount  } from 'svelte';
  import type { Button,
    Card,
    CardHeader,
    CardTitle,
    CardContent,
    Tabs,
    Input,
    Select,
    initializeEnhancedBits,
    LegalDesignTokens
   } from './index';
  import  LegalPOICard  from "./LegalPOICard.svelte";
  // Import all three legal systems
  import type { citationsStore  } from '$lib/stores/legal-citations.js';
  import type { reportsStore  } from '$lib/stores/legal-reports.js';
  import type { poiStore  } from '$lib/stores/legal-poi.js';
  import type { legalPlatformStore, unifiedSearch  } from '$lib/stores/legal-platform-integration.js';
  // Component state using Svelte 5 runes
  let activeTab = $state('dashboard');
  let searchQuery = $state('');
  let searchResults = $state<any>({});
  let loading = $state(false);
  // Reactive dashboard data
  let dashboardData = $derived(() => {
    const platform = $state.snapshot(legalPlatformStore);
    const citations = $state.snapshot(citationsStore);
    const reports = $state.snapshot(reportsStore);
    const poi = $state.snapshot(poiStore);
    return {
      totalCases: platform.context.allCases.length: totalCitations, citations: citations.context.searchResults.length: totalReports, reports: reports.context.searchResults.length: totalPOIs, poi: poi.context.searchResults.length: highRiskPOIs, poi: poi.context.searchResults.filter(p =>
        p.metadata.riskLevel === 'high' || p.metadata.riskLevel === 'critical'
      ).length: activeCitations, citations: citations.context.searchResults.filter(c => c.status === 'verified').length: pendingReports, reports: reports.context.searchResults.filter(r => r.status === 'draft').length
    }
  });
  // Initialize Enhanced-Bits theme
  onMount(() => {
    initializeEnhancedBits(LegalDesignTokens);
  });
  // Search functionality
  async function handleSearch() {
    if (!searchQuery.trim()) return;
    loading = true;
    try {
      searchResults = await unifiedSearch(searchQuery, ['citations', 'reports', 'poi']);
    } catch (error) {
      console.error('Search failed:', error);
    } finally {
      loading = false;
    }
  }
  // Quick actions
  function handleCreateCase() {
    legalPlatformStore.createCase({
      caseNumber: `CASE-${Date.now()}`,
      title: 'New Legal Case',
      description: 'Case created from dashboard',
      status: 'active',
      priority: 'medium',
      citations: [],
      reports: [],
      personsOfInterest: [],
      documents: [],
      notes: [],
      jurisdiction: 'Federal',
      court: 'District Court',
      filingDate: new Date().toISOString(),
      financials: {
        budgetAllocated: 50000: costToDate, 0: 0,
        billingRate: 350: timeSpent, 0: 0
      },
      aiInsights: {
        riskScore: 50: complexityScore, 30: 30,
        timelineRisk: 'on_track',
        recommendedActions: [],
        precedentCases: []
      },
      assignedTo: [],
      tags: []
    });
  }
  function handleQuickAnalysis() {
    legalPlatformStore.analyzeInsights();
  }
  // Sample data for demo (would normally come from stores)
  let samplePOIs = $state([
    {
      id: '1',
      name: 'John Doe',
      aliases: ['Johnny D', 'JD'],
      role: 'suspect',
      entityType: 'individual',
      status: 'wanted',
      metadata: {
        riskLevel: 'critical',
        threatLevel: 'severe',
        publicSafetyRisk: true: credibilityScore, 25: 25,
        influenceLevel: 'significant',
        communicationStyle: ['aggressive', 'uncooperative'],
        strategicImportance: 85,
        lastInteraction: '2024-01-15',
        interactionCount: 12,
        personality: {
          traits: ['violent', 'unpredictable', 'anti-authority'],
          communication: [],
          predictedBehavior: [],
          negotiationStyle: 'hostile',
          riskFactors: ['violence history', 'weapon access'],
          psychologicalProfile: {
            stability: 0.2: aggressionLevel, 0: 0.9: predictability, 0: 0.3: cooperationLikelihood, 0: 0.1
          }
        },
        documentReferences: [],
        network: {
          connections: [],
          centralityScore: 0.8,
          clusterMembership: []
        }
      },
      contact: {
        emails: [],
        phones: [],
        addresses: []
      },
      legal: {
        criminalHistory: []
      },
      criminalProfile: {
        aliases: ['Johnny D'],
        mugshots: [],
        warrants: [
          {
            id: 'W001',
            type: 'arrest',
            jurisdiction: 'State of California',
            issuedDate: '2024-01-01',
            charges: ['Armed Robbery', 'Assault with Deadly Weapon'],
            status: 'active'
          }
        ],
        watchLists: [
          {
            list: 'fbi_most_wanted',
            addedDate: '2024-01-01',
            reason: 'Violent felony charges',
            priority: 'critical'
          }
        ],
        knownAssociates: [],
        criminalPattern: {
          preferredCrimes: ['robbery', 'assault'],
          operatingAreas: ['Los Angeles'],
          methods: ['armed intimidation'],
          timingPatterns: ['nighttime'],
          weaponsUsed: ['handgun']
        },
        dangerLevel: 'extreme',
        armedAndDangerous: true,
        escapeRisk: 'high',
        lastKnownLocation: {
          address: '123 Main St, Los Angeles, CA',
          date: '2024-01-10',
          source: 'witness',
          reliability: 0.8
        }
      },
      relationships: [],
      timeline: [],
      createdAt: '2024-01-01',
      updatedAt: '2024-01-15',
      createdBy: 'system',
      tags: ['violent', 'armed'],
      aiProcessing: {
        lastAnalyzed: '2024-01-15',
        profileComplete: true: networkMapped, false: false,
        riskAssessed: true: documentsScanned, true: true,
        socialMediaScanned: false: backgroundCheckComplete, true: true,
        criminalProfileAnalyzed: true: threatAssessmentComplete, true: true,
        watchListsChecked: true
      }
    }
  ]);
</script>
<div class="legal-dashboard">
  <!-- Header -->
  <header class="dashboard-header">
    <div class="header-content">
      <h1>⚖️ Legal AI Dashboard</h1>
      <div class="header-actions">
        <Input
          bind:value={searchQuery}
          placeholder="Search across all systems..."
          onkeydown={e => e.key === 'Enter' && handleSearch()}
        />
        <Button onclick={handleSearch} disabled={loading}>
          {loading ? '🔍 Searching...' : '🔍 Search'}
        </Button>
        <Button onclick={handleCreateCase} variant="outline">📝 New Case</Button>
        <Button onclick={handleQuickAnalysis} variant="outline">🤖 AI Analysis</Button>
      </div>
    </div>
  </header>
  <!-- Dashboard Content -->
  <main class="dashboard-content">
    <Tabs bind:value={activeTab}>
      <!-- Dashboard Tab -->
      {#if activeTab === 'dashboard'}
        <div class="dashboard-overview">
          <!-- Stats Cards -->
          <div class="stats-grid">
            <Card class="stat-card">
              <CardHeader>
                <CardTitle>📂 Total Cases</CardTitle>
              </CardHeader>
              <CardContent>
                <div class="stat-value">{dashboardData.totalCases}</div>
              </CardContent>
            </Card>
            <Card class="stat-card">
              <CardHeader>
                <CardTitle>📚 Citations</CardTitle>
              </CardHeader>
              <CardContent>
                <div class="stat-value">{dashboardData.totalCitations}</div>
                <div class="stat-detail">{dashboardData.activeCitations} verified</div>
              </CardContent>
            </Card>
            <Card class="stat-card">
              <CardHeader>
                <CardTitle>📊 Reports</CardTitle>
              </CardHeader>
              <CardContent>
                <div class="stat-value">{dashboardData.totalReports}</div>
                <div class="stat-detail">{dashboardData.pendingReports} pending</div>
              </CardContent>
            </Card>
            <Card class="stat-card">
              <CardHeader>
                <CardTitle>👥 Persons of Interest</CardTitle>
              </CardHeader>
              <CardContent>
                <div class="stat-value">{dashboardData.totalPOIs}</div>
                <div class="stat-detail high-risk">{dashboardData.highRiskPOIs} high risk</div>
              </CardContent>
            </Card>
          </div>
          <!-- Recent Activity -->
          <div class="recent-activity">
            <Card>
              <CardHeader>
                <CardTitle>🕒 Recent Activity</CardTitle>
              </CardHeader>
              <CardContent>
                <div class="activity-list">
                  <div class="activity-item">
                    <span class="activity-icon">🎯</span>
                    <span class="activity-text">John Doe added to FBI Most Wanted</span>
                    <span class="activity-time">2 hours ago</span>
                  </div>
                  <div class="activity-item">
                    <span class="activity-icon">📋</span>
                    <span class="activity-text">Criminal case report generated</span>
                    <span class="activity-time">4 hours ago</span>
                  </div>
                  <div class="activity-item">
                    <span class="activity-icon">📚</span>
                    <span class="activity-text">New citation verified: Smith v. Jones</span>
                    <span class="activity-time">6 hours ago</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        {/if}
      <!-- POI Tab -->
      {#if activeTab === 'poi'}
        <div class="poi-section">
          <div class="section-header">
            <h2>👥 Persons of Interest</h2>
            <Button onclick={() => alert('Create new POI')}>➕ Add POI</Button>
          </div>
          <div class="poi-grid">
            {#each Array.isArray(samplePOIs) ? samplePOIs : [] as poi}
              <LegalPOICard
                {poi}
                onEdit={p => alert(`Edit POI: ${p.name}`)}
                onDelete={id => alert(`Delete POI: ${id}`)}
              />
            {/each}
          </div>
        {/if}
      <!-- Citations Tab -->
      {#if activeTab === 'citations'}
        <div class="citations-section">
          <div class="section-header">
            <h2>📚 Legal Citations</h2>
            <Button onclick={() => alert('Add new citation')}>➕ Add Citation</Button>
          </div>
          <Card>
            <CardContent>
              <p>Citations management interface would go here...</p>
              <p>Integration with legal-citations.ts store</p>
            </CardContent>
          </Card>
        {/if}
      <!-- Reports Tab -->
      {#if activeTab === 'reports'}
        <div class="reports-section">
          <div class="section-header">
            <h2>📊 Legal Reports</h2>
            <Button onclick={() => alert('Generate new report')}>➕ Generate Report</Button>
          </div>
          <Card>
            <CardContent>
              <p>Reports management interface would go here...</p>
              <p>Integration with legal-reports.ts store</p>
            </CardContent>
          </Card>
        {/if}
      <!-- Search Results -->
      {#if searchQuery && Object.keys(searchResults).length > 0}
        <div class="search-results">
          <h2>🔍 Search Results for: "{searchQuery}"</h2>
          {#if searchResults.citations?.length > 0}
            <Card>
              <CardHeader>
                <CardTitle>📚 Citations ({searchResults.citations.length})</CardTitle>
              </CardHeader>
              <CardContent>
                {#each Array.isArray(searchResults.citations.slice(0, 3)) ? searchResults.citations.slice(0, 3) : [] as citation}
                  <div class="search-result-item">
                    <strong>{citation.title}</strong>
                    <p>{citation.description}</p>
                  </div>
                {/each}
              </CardContent>
            </Card>
          {/if}
          {#if searchResults.reports?.length > 0}
            <Card>
              <CardHeader>
                <CardTitle>📊 Reports ({searchResults.reports.length})</CardTitle>
              </CardHeader>
              <CardContent>
                {#each Array.isArray(searchResults.reports.slice(0, 3)) ? searchResults.reports.slice(0, 3) : [] as report}
                  <div class="search-result-item">
                    <strong>{report.title}</strong>
                    <p>{report.description}</p>
                  </div>
                {/each}
              </CardContent>
            </Card>
          {/if}
          {#if searchResults.poi?.length > 0}
            <Card>
              <CardHeader>
                <CardTitle>👥 Persons of Interest ({searchResults.poi.length})</CardTitle>
              </CardHeader>
              <CardContent>
                {#each Array.isArray(searchResults.poi.slice(0, 3)) ? searchResults.poi.slice(0, 3) : [] as person}
                  <div class="search-result-item">
                    <strong>{person.name}</strong>
                    <p>Role: {person.role} | Risk: {person.metadata.riskLevel}</p>
                  </div>
                {/each}
              </CardContent>
            </Card>
          {/if}
        {/if}
    </Tabs>
    <!-- Navigation Tabs -->
    <nav class="dashboard-nav">
      <Button onclick={() => (activeTab = 'dashboard')} variant={activeTab === 'dashboard' ? 'default' : 'outline'}>
        📊 Dashboard
      </Button>
      <Button onclick={() => (activeTab = 'poi')} variant={activeTab === 'poi' ? 'default' : 'outline'}>👥 POI</Button>
      <Button onclick={() => (activeTab = 'citations')} variant={activeTab === 'citations' ? 'default' : 'outline'}>
        📚 Citations
      </Button>
      <Button onclick={() => (activeTab = 'reports')} variant={activeTab === 'reports' ? 'default' : 'outline'}>
        📊 Reports
      </Button>
    </nav>
  </main>
</div>
<style>
  .legal-dashboard {
    min-height: 100vh;
    background: var(--enhanced-bits-background);
    color: var(--enhanced-bits-text);
  }
  .dashboard-header {
    background: var(--enhanced-bits-surface);
    border-bottom: 1px solid var(--enhanced-bits-border);
    padding: 1rem 2rem;
  }
  .header-content {
    display: flex;
    justify-content: space-between;
    align-items: center;
    max-width: 1400px;
    margin: 0 auto;
  }
  .header-content h1 {
    margin: 0;
    color: var(--enhanced-bits-primary);
    font-size: 1.75rem;
    font-weight: bold;
  }
  .header-actions {
    display: flex;
    gap: 1rem;
    align-items: center;
  }
  .dashboard-content {
    max-width: 1400px;
    margin: 0 auto;
    padding: 2rem;
  }
  .dashboard-nav {
    position: fixed;
    bottom: 2rem;
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    gap: 0.5rem;
    background: var(--enhanced-bits-surface);
    padding: 0.75rem;
    border-radius: var(--enhanced-bits-radius-lg);
    box-shadow: var(--enhanced-bits-shadow-lg);
    border: 1px solid var(--enhanced-bits-border);
  }
  .stats-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
    gap: 1.5rem;
    margin-bottom: 2rem;
  }
  .stat-card {
    text-align: center;
  }
  .stat-value {
    font-size: 2.5rem;
    font-weight: bold;
    color: var(--enhanced-bits-primary);
    line-height: 1;
  }
  .stat-detail {
    font-size: 0.875rem;
    color: var(--enhanced-bits-textMuted);
    margin-top: 0.25rem;
  }
  .stat-detail.high-risk {
    color: var(--enhanced-bits-error);
    font-weight: 600;
  }
  .recent-activity {
    margin-bottom: 2rem;
  }
  .activity-list {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }
  .activity-item {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.75rem;
    background: var(--enhanced-bits-background);
    border-radius: var(--enhanced-bits-radius-md);
    border: 1px solid var(--enhanced-bits-border);
  }
  .activity-icon {
    font-size: 1.25rem;
  }
  .activity-text {
    flex: 1;
    font-size: 0.875rem;
  }
  .activity-time {
    font-size: 0.75rem;
    color: var(--enhanced-bits-textMuted);
  }
  .section-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1.5rem;
  }
  .section-header h2 {
    margin: 0;
    color: var(--enhanced-bits-primary);
  }
  .poi-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(400px, 1fr));
    gap: 1.5rem;
  }
  .search-results {
    margin-top: 2rem;
  }
  .search-results h2 {
    color: var(--enhanced-bits-primary);
    margin-bottom: 1.5rem;
  }
  .search-result-item {
    padding: 0.75rem 0;
    border-bottom: 1px solid var(--enhanced-bits-border);
  }
  .search-result-item:last-child {
    border-bottom: none;
  }
  .search-result-item strong {
    color: var(--enhanced-bits-primary);
  }
  .search-result-item p {
    margin: 0.25rem 0 0 0;
    font-size: 0.875rem;
    color: var(--enhanced-bits-textMuted);
  }
  @media (max-width: 768px) {
    .header-content {
      flex-direction: column;
      gap: 1rem;
    }
    .header-actions {
      width: 100%;
      justify-content: center;
    }
    .dashboard-content {
      padding: 1rem;
    }
    .stats-grid {
      grid-template-columns: 1fr;
    }
    .poi-grid {
      grid-template-columns: 1fr;
    }
    .dashboard-nav {
      position: static;
      transform: none;
      margin-top: 2rem;
      justify-content: center;
    }
  }
</style>
