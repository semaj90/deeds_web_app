<!-- YoRHa Detective Command Center Component -->
<script lang="ts">
  import { goto } from '$app/navigation';
  import type { User } from '$lib/types/legal-document';
  import YoRHaDetectiveForm from './YoRHaDetectiveForm.svelte';
  import YoRHaDetectiveModal from './YoRHaDetectiveModal.svelte';
  import YoRHaDetectiveNotification from './YoRHaDetectiveNotification.svelte';
import type { DrizzleTypes } from '$lib/types/enhanced-svelte5-types';

  // Props interface
  interface Props {
    currentUser?: User;
    systemData?: {
	activeCases: number;
      evidenceItems: number;
	personsOfInterest: number;
      aiQueries: number;
	systemLoad: number;
      gpuUtilization: number;
	memoryUsage: number;
      networkLatency: number;
    };
  }

  let {
    currentUser = undefined,
    systemData = {
      activeCases: 12,
      evidenceItems: 247,
      personsOfInterest: 8,
      aiQueries: 1543,
      systemLoad: 34,
      gpuUtilization: 67,
      memoryUsage: 42,
      networkLatency: 23
    }
  }: Props = $props();

  // State
  let activeTab = $state<string>('dashboard');
  let showNewCaseModal = $state<boolean>(false);
  let showAIAssistant = $state<boolean>(false);
  let currentTime = $state(new Date());
  let notification = $state({ show: false, message: '', type: 'info' as 'success' | 'error' | 'info' });

  // Navigation items
  const navigationItems = [
    { id: 'dashboard', label: 'COMMAND CENTER', icon: '⌘', active: true },
	{ id: 'evidence', label: 'EVIDENCE', icon: '📁', route: '/evidenceboard' },
	{ id: 'persons', label: 'PERSONS OF INTEREST', icon: '👤', route: '/yorha/persons' },
	{ id: 'analysis', label: 'ANALYSIS', icon: '📊', route: '/yorha/analysis' },
	{ id: 'search', label: 'GLOBAL SEARCH', icon: '🔎', route: '/yorha/search' },
	{ id: 'terminal', label: 'TERMINAL', icon: '💻', route: '/yorha/terminal' }
  ];

  // Active cases data (mock)
  let activeCases = $state([
    { id: 'CASE-2024-087', title: 'Corporate Espionage Investigation', status: 'active', priority: 'high', lastUpdate: '2 hours ago' },
	{ id: 'CASE-2024-088', title: 'Missing Person Dr. Sarah Chen', status: 'active', priority: 'medium', lastUpdate: '4 hours ago' },
	{ id: 'CASE-2024-089', title: 'Financial Fraud Analysis', status: 'pending', priority: 'low', lastUpdate: '1 day ago' }
  ]);

  // Form fields for new case
  const newCaseFormFields = [
    {
      name: 'title',
      label: 'CASE TITLE',
      type: 'text',
      required: true,
      placeholder: 'e.g., The Missing Android'
    },
	{
      name: 'description',
      label: 'CASE DESCRIPTION / SYNOPSIS',
      type: 'textarea',
      required: true,
      placeholder: 'Initial details of the investigation...',
      rows: 4
    },
	{
      name: 'priority',
      label: 'PRIORITY LEVEL',
      type: 'select',
      required: true,
      options: [
        { value: 'low', label: 'Low' },
	{ value: 'medium', label: 'Medium' },
	{ value: 'high', label: 'High' }
      ],
      defaultValue: 'medium'
    }
  ];

  // Update time every second
  $effect(() => {
    const timeInterval = setInterval(() => {
      currentTime = new Date();
    },
	1000);
    return () => clearInterval(timeInterval);
  });

  function formatDateTime(date: Date): string {
    return date.toLocaleString('en-US', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    });
  }

  function handleNavigation(item: { route?: string; id?: string }) {
    if (item.route) {
      goto(item.route);
    } else if (item.id) {
      activeTab = item.id;
    }
  }

  function showNotificationMessage(message: string, type: 'success' | 'error' | 'info' = 'info') {
    notification = { show: true, message, type };
    setTimeout(() => {
      notification = { show: false, message: '', type: 'info' };
    },
	3000);
  }

  function openNewCaseModal() {
    showNewCaseModal = true;
  }

  function closeNewCaseModal() {
    showNewCaseModal = false;
  }

  async function handleNewCaseSubmit(formData: unknown): Promise<void> {
    try {
      showNotificationMessage('Saving case to database...', 'info');

      const response = await fetch('/api/yorha/cases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
	body: JSON.stringify(formData)
      });

      if (response.ok) {
        const newCase = await response.json();
        activeCases = [newCase, ...activeCases];
        systemData = { ...systemData, activeCases: systemData.activeCases + 1 };
        showNotificationMessage('Case successfully saved!', 'success');
        closeNewCaseModal();
      } else {
        throw new Error('Failed to create case');
      }
    } catch (error) {
      console.error('Error creating case:', error);
      showNotificationMessage('Error: Could not save case.', 'error');
    }
  }

  function handleGlobalSearch() {
    goto('/yorha/search');
  }

  function getCasePriorityColor(priority: string): string {
    switch (priority) {
      case 'high':
        return 'border-red-400 bg-red-400/10 text-red-300';
      case 'medium':
        return 'border-yellow-400 bg-yellow-400/10 text-yellow-300';
      case 'low':
        return 'border-green-400 bg-green-400/10 text-green-300';
      default:
        return 'border-gray-400 bg-gray-400/10 text-gray-300';
    }
  }

  function getCaseStatusColor(status: string): string {
    switch (status) {
      case 'active':
        return 'text-green-400';
      case 'pending':
        return 'text-yellow-400';
      case 'closed':
        return 'text-gray-400';
      default:
        return 'text-gray-400';
    }
  }

  function getHealthClass(value: number): string {
    if (value > 80) return 'critical';
    if (value > 60) return 'warning';
    return 'normal';
  }

  function getNetworkClass(latency: number): string {
    if (latency < 50) return 'excellent';
    if (latency < 100) return 'good';
    return 'poor';
  }

  function getNetworkLabel(latency: number): string {
    if (latency < 50) return 'EXCELLENT';
    if (latency < 100) return 'GOOD';
    return 'POOR';
  }
</script>

<!-- YoRHa Detective Command Center -->
<div class="yorha-detective-command-center min-h-screen bg-yorha-sand text-yorha-dark">
  <!-- Header -->
  <header class="yorha-header">
    <div class="header-content">
      <div class="brand-section">
        <h1 class="command-center-title">COMMAND CENTER</h1>
        <p class="timestamp">YoRHa Detective Interface - {formatDateTime(currentTime)}</p>
      </div>
      <div class="header-actions">
        <button class="header-btn" onclick={openNewCaseModal}>
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6"></path>
          </svg>
          NEW CASE
        </button>
        <button class="header-btn" onclick={handleGlobalSearch}>
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path>
          </svg>
          GLOBAL SEARCH
        </button>
        <button class="header-btn" onclick={() => (showAIAssistant = true)}>
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
          </svg>
          AI ASSISTANT
        </button>
      </div>
    </div>
  </header>

  <!-- Main Content -->
  <main class="main-content">
    <!-- Sidebar -->
    <aside class="yorha-sidebar">
      <h2 class="sidebar-title">YORHA DETECTIVE</h2>
      <nav class="sidebar-nav">
        {#each navigationItems as item}
          <button
            class="sidebar-link {activeTab === item.id ? 'active' : ''}"
            onclick={() => handleNavigation(item)}
          >
            <span class="nav-icon">{item.icon}</span>
            {item.label}
          </button>
        {/each}
      </nav>
    </aside>

    <!-- Dashboard Content -->
    <div class="dashboard-content">
      <!-- System Metrics -->
      <div class="metrics-grid">
        <div class="metric-card">
          <div class="metric-header">
            <span class="metric-label">ACTIVE CASES</span>
            <span class="metric-icon">📁</span>
          </div>
          <div class="metric-value">{systemData.activeCases}</div>
          <div class="metric-trend">+2 this week</div>
        </div>
        <div class="metric-card">
          <div class="metric-header">
            <span class="metric-label">EVIDENCE ITEMS</span>
            <span class="metric-icon">🔍</span>
          </div>
          <div class="metric-value">{systemData.evidenceItems}</div>
          <div class="metric-trend">+15 today</div>
        </div>
        <div class="metric-card">
          <div class="metric-header">
            <span class="metric-label">PERSONS OF INTEREST</span>
            <span class="metric-icon">👤</span>
          </div>
          <div class="metric-value">{systemData.personsOfInterest}</div>
          <div class="metric-trend">3 flagged</div>
        </div>
        <div class="metric-card">
          <div class="metric-header">
            <span class="metric-label">AI QUERIES</span>
            <span class="metric-icon">🤖</span>
          </div>
          <div class="metric-value">{systemData.aiQueries}</div>
          <div class="metric-trend">94% accuracy</div>
        </div>
      </div>

      <!-- Active Cases Section -->
      <div class="dashboard-panel">
        <h2 class="section-title">ACTIVE CASES</h2>
        <div class="cases-list">
          {#each activeCases as caseItem}
            <div class="case-item {getCasePriorityColor(caseItem.priority)}">
              <div class="case-header">
                <span class="case-id">{caseItem.id}</span>
                <span class="case-status {getCaseStatusColor(caseItem.status)}">{caseItem.status.toUpperCase()}</span>
              </div>
              <h3 class="case-title">{caseItem.title}</h3>
              <div class="case-meta">
                <span class="case-priority">Priority: {caseItem.priority.toUpperCase()}</span>
                <span class="case-updated">Updated: {caseItem.lastUpdate}</span>
              </div>
            </div>
          {/each}
        </div>
      </div>

      <!-- System Health -->
      <div class="dashboard-panel">
        <h2 class="section-title">SYSTEM HEALTH</h2>
        <div class="health-metrics">
          <div class="health-metric">
            <div class="health-label">
              <span>CPU LOAD</span>
              <span class="health-value">{systemData.systemLoad}%</span>
            </div>
            <div class="health-bar">
              <div
                class="health-fill {getHealthClass(systemData.systemLoad)}"
                style="width: {systemData.systemLoad}%"
              ></div>
            </div>
          </div>
          <div class="health-metric">
            <div class="health-label">
              <span>GPU USAGE</span>
              <span class="health-value">{systemData.gpuUtilization}%</span>
            </div>
            <div class="health-bar">
              <div
                class="health-fill {getHealthClass(systemData.gpuUtilization)}"
                style="width: {systemData.gpuUtilization}%"
              ></div>
            </div>
          </div>
          <div class="health-metric">
            <div class="health-label">
              <span>MEMORY</span>
              <span class="health-value">{systemData.memoryUsage}%</span>
            </div>
            <div class="health-bar">
              <div
                class="health-fill {getHealthClass(systemData.memoryUsage)}"
                style="width: {systemData.memoryUsage}%"
              ></div>
            </div>
          </div>
          <div class="health-metric">
            <div class="health-label">
              <span>NETWORK</span>
              <span class="health-value">{systemData.networkLatency}ms</span>
            </div>
            <div class="network-status">
              <div class="network-indicator {getNetworkClass(systemData.networkLatency)}"></div>
              <span class="network-label">{getNetworkLabel(systemData.networkLatency)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </main>
</div>

<!-- New Case Modal -->
{#if showNewCaseModal}
  <YoRHaDetectiveModal
    showModal={showNewCaseModal}
    title="CREATE NEW CASE FILE"
    onClose={closeNewCaseModal}
  >
    <YoRHaDetectiveForm
      fields={newCaseFormFields}
      onsubmit={handleNewCaseSubmit}
      submitText="SAVE TO DATABASE"
      submitClass="yorha-btn-success"
    />
  </YoRHaDetectiveModal>
{/if}

<!-- AI Assistant Modal -->
{#if showAIAssistant}
  <YoRHaDetectiveModal
    showModal={showAIAssistant}
    title="AI ASSISTANT"
    onClose={() => (showAIAssistant = false)}
  >
    <div class="ai-assistant-content">
      <div class="ai-status-section">
        <div class="ai-status-indicator active"></div>
        <span class="ai-status-text">Neural Network Status: ACTIVE</span>
      </div>
      <div class="ai-capabilities">
        <div class="ai-capability">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
          </svg>
          <span>Evidence Pattern Analysis</span>
        </div>
        <div class="ai-capability">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path>
          </svg>
          <span>Case Correlation Engine</span>
        </div>
        <div class="ai-capability">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.246 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"></path>
          </svg>
          <span>Legal Precedent Search</span>
        </div>
      </div>
      <div class="ai-query-section">
        <label class="ai-query-label" for="query-input">QUERY INPUT</label>
        <textarea
          id="query-input"
          class="ai-query-input"
          placeholder="Enter legal query or case analysis request..."
          rows="4"
        ></textarea>
      </div>
      <div class="ai-actions">
        <button class="yorha-btn">Analyze Current Case</button>
        <button class="yorha-btn">Evidence Summary</button>
        <button class="yorha-btn yorha-btn-primary">EXECUTE QUERY</button>
      </div>
    </div>
  </YoRHaDetectiveModal>
{/if}

<!-- Notification -->
<YoRHaDetectiveNotification
  message={notification.message}
  type={notification.type}
  show={notification.show}
/>


<style>
  .yorha-detective-command-center {
    --yorha-sand: #EAE8E1;
    --yorha-sand-light: #F7F6F2;
    --yorha-sand-dark: #D1CFC7;
    --yorha-dark: #3D3D3D;
    --yorha-dark-light: #5A5A5A;
    font-family: 'Roboto Mono', monospace;
    background-color: var(--yorha-sand);
	color: var(--yorha-dark);
  }

  .yorha-header {
    position: fixed;
	top: 0;
    left: 0;
	right: 0;
    z-index: 30;
    background-color: var(--yorha-sand);
    border-bottom: 1px solid var(--yorha-sand-dark);
    backdrop-filter: blur(8px);
  }

  .header-content {
    display: flex;
    align-items: center;
    justify-content: space-between;
    max-width: 100%;
	margin: 0 auto;
    padding: 1rem 1.5rem;
    gap: 1rem;
  }

  .command-center-title {
    font-size: 1.5rem;
    font-weight: bold;
	margin: 0;
  }

  .timestamp {
    font-size: 0.875rem;
	margin: 0;
    opacity: 0.8;
  }

  .header-actions {
    display: flex;
    align-items: center;
	gap: 1rem;
  }

  .header-btn {
    display: flex;
    align-items: center;
	gap: 0.5rem;
    border: 1px solid var(--yorha-sand-dark);
    background-color: var(--yorha-sand-light);
	padding: 0.5rem 1rem;
    font-size: 0.875rem;
    font-weight: bold;
	color: var(--yorha-dark);
    cursor: pointer;
	transition:all 0.2s ease;
    border-radius: 0;
  }

  .header-btn:hover {
    background-color: var(--yorha-sand);
  }

  .main-content {
    display: grid;
    grid-template-columns: 1fr 3fr;
    gap: 1.5rem;
    max-width: 100%;
	margin: 0 auto;
    padding: 1.5rem;
    margin-top: 4rem;
  }

  .dashboard-panel {
    background-color: var(--yorha-sand-light);
	border: 1px solid var(--yorha-sand-dark);
    border-radius: 0;
	padding: 1.5rem;
  }

  .yorha-sidebar {
    position: sticky;
	top: 5rem;
    height: fit-content;
  }

  .sidebar-title {
    font-weight: bold;
    margin-bottom: 1rem;
    font-size: 1rem;
  }

  .sidebar-nav {
    display: flex;
    flex-direction: column;
	gap: 0.5rem;
  }

  .sidebar-link {
    display: flex;
    align-items: center;
	gap: 0.75rem;
    width: 100%;
	padding: 0.75rem;
    text-align: left;
    font-weight: bold;
	border: 1px solid transparent;
    background: none;
	color: var(--yorha-dark);
    cursor: pointer;
	transition:all 0.2s ease;
    border-radius: 0;
  }

  .sidebar-link:hover {
    border-color: var(--yorha-dark);
    background-color: white;
  }

  .sidebar-link.active {
    background-color: var(--yorha-dark);
	color: var(--yorha-sand-light);
  }

  .nav-icon {
    font-size: 1rem;
	width: 1.5rem;
    text-align: center;
  }

  .dashboard-content {
    display: flex;
    flex-direction: column;
	gap: 1.5rem;
  }

  .metrics-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 1rem;
  }

  .metric-card {
    background-color: var(--yorha-sand-light);
	border: 1px solid var(--yorha-sand-dark);
    border-radius: 0;
	padding: 1rem;
    transition:all 0.3s ease;
  }

  .metric-card:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  }

  .metric-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 0.5rem;
  }

  .metric-label {
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
	opacity: 0.8;
  }

  .metric-icon {
    font-size: 1.5rem;
  }

  .metric-value {
    font-size: 1.5rem;
    font-weight: bold;
    margin-bottom: 0.25rem;
  }

  .metric-trend {
    font-size: 0.75rem;
  }

  .section-title {
    font-size: 1.25rem;
    font-weight: bold;
    margin-bottom: 1rem;
  }

  .cases-list {
    display: flex;
    flex-direction: column;
	gap: 1rem;
  }

  .case-item {
    border: 1px solid var(--yorha-sand-dark);
    border-radius: 0;
	padding: 1rem;
    background-color: white;
	transition:all 0.2s ease;
  }

  .case-item:hover {
    transform: translateX(4px);
  }

  .case-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 0.5rem;
  }

  .case-id {
    font-family: monospace;
    font-size: 0.875rem;
    font-weight: bold;
  }

  .case-status {
    font-size: 0.75rem;
    font-weight: bold;
    text-transform: uppercase;
  }

  .case-title {
    font-size: 1rem;
    font-weight: bold;
    margin-bottom: 0.5rem;
    margin-top: 0;
  }

  .case-meta {
    display: flex;
    justify-content: space-between;
    font-size: 0.75rem;
	opacity: 0.8;
  }

  .health-metrics {
    display: flex;
    flex-direction: column;
	gap: 1rem;
  }

  .health-metric {
    display: flex;
    flex-direction: column;
	gap: 0.5rem;
  }

  .health-label {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 0.875rem;
  }

  .health-value {
    font-family: monospace;
    font-weight: bold;
  }

  .health-bar {
    width: 100%;
	height: 0.5rem;
    background-color: var(--yorha-sand);
	border: 1px solid var(--yorha-sand-dark);
    border-radius: 0;
	overflow: hidden;
  }

  .health-fill {
    height: 100%;
    border-radius: 0;
	transition:all 0.3s ease;
  }

  .health-fill.normal {
    background-color: #10b981;
  }

  .health-fill.warning {
    background-color: #f59e0b;
  }

  .health-fill.critical {
    background-color: #ef4444;
  }

  .network-status {
    display: flex;
    align-items: center;
	gap: 0.5rem;
  }

  .network-indicator {
    width: 0.5rem;
	height: 0.5rem;
    border-radius: 50%;
	animation: pulse 2s infinite;
  }

  .network-indicator.excellent {
    background-color: #10b981;
  }

  .network-indicator.good {
    background-color: #f59e0b;
  }

  .network-indicator.poor {
    background-color: #ef4444;
  }

  .network-label {
    font-size: 0.75rem;
	opacity: 0.8;
  }

  @keyframes pulse {
    0%, 100% {
      opacity: 1;
    }
    50% {
      opacity: 0.5;
    }
  }

  /* AI Assistant Styles */
  .ai-assistant-content {
    padding: 1.5rem;
  }

  .ai-status-section {
    display: flex;
    align-items: center;
	gap: 0.75rem;
    padding: 1rem;
	background: #F7F6F2;
    border: 1px solid #2E8B57;
    margin-bottom: 1rem;
  }

  .ai-status-indicator {
    width: 8px;
	height: 8px;
    border-radius: 50%;
	background: #FF6B6B;
  }

  .ai-status-indicator.active {
    background: #2E8B57;
    box-shadow: 0 0 8px #2E8B57;
    animation: ai-blink 1.5s infinite;
  }

  .ai-status-text {
    font-weight: bold;
	color: #3D3D3D;
  }

  @keyframes ai-blink {
    0%, 100% {
      opacity: 1;
    }
    50% {
      opacity: 0.3;
    }
  }

  .ai-capabilities {
    display: grid;
    grid-template-columns: 1fr;
	gap: 0.5rem;
    margin-bottom: 1rem;
  }

  .ai-capability {
    display: flex;
    align-items: center;
	gap: 0.75rem;
    padding: 0.75rem;
	background: #F7F6F2;
    border: 1px solid #D1CFC7;
    font-size: 0.875rem;
	color: #3D3D3D;
  }

  .ai-query-section {
    margin-bottom: 1rem;
  }

  .ai-query-label {
    display: block;
    font-weight: bold;
    margin-bottom: 0.5rem;
	color: #3D3D3D;
    font-size: 0.875rem;
  }

  .ai-query-input {
    width: 100%;
	padding: 0.75rem;
    background: white;
	border: 1px solid #D1CFC7;
    color: #3D3D3D;
    font-family: inherit;
    font-size: 0.875rem;
	resize: vertical;
  }

  .ai-query-input:focus {
    outline: none;
    border-color: #2E8B57;
    box-shadow: 0 0 0 3px rgba(46, 139, 87, 0.2);
  }

  .ai-actions {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.5rem;
  }

  .yorha-btn {
    padding: 0.5rem 1rem;
    border: 1px solid var(--yorha-sand-dark);
    background: var(--yorha-sand-light);
	color: var(--yorha-dark);
    font-weight: bold;
	cursor: pointer;
    transition:all 0.2s ease;
  }

  .yorha-btn:hover {
    background: var(--yorha-sand);
  }

  .yorha-btn-primary {
    grid-column: span 2;
    background: #2E8B57;
	color: white;
    border-color: #2E8B57;
  }

  .yorha-btn-primary:hover {
    background: #3CB371;
  }

  /* Responsive adjustments */
  @media (max-width: 1024px) {
    .main-content {
      grid-template-columns: 1fr;
    }

    .yorha-sidebar {
      position: static;
    }
  }

  @media (max-width: 768px) {
    .header-content {
      flex-direction: column;
	gap: 1rem;
    }

    .main-content {
      padding: 1rem;
    }

    .metrics-grid {
      grid-template-columns: repeat(2, 1fr);
    }
  }
</style>
