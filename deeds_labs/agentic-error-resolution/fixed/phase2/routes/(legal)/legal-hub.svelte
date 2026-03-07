<script lang="ts">
  import Card from '$lib/components/ui/card/Card.svelte';
  import CardContent from '$lib/components/ui/card/CardContent.svelte';
  import CardHeader from '$lib/components/ui/card/CardHeader.svelte';
  import CardTitle from '$lib/components/ui/card/CardTitle.svelte';
  import Button from '$lib/components/ui/button/Button.svelte';

  // Types
  interface LegalStats {
    activeCases: number;
    documentsAnalyzed: number;
    citationsFound: number;
    complianceScore: number;
  }

  interface LegalService {
    name: string;
    icon: string;
    href: string;
    description: string;
  }

  interface RecentActivity {
    type: 'case_update' | 'document_review' | 'citation_check' | 'compliance_scan';
    title: string;
    status?: string;
    priority?: 'high' | 'medium' | 'low';
    confidence?: number;
    pages?: number;
    citations?: number;
    verified?: number;
    score?: number;
    issues?: number;
  }

  // Legal system statistics - Svelte 5 $state
  const legalStats: LegalStats = {
    activeCases: 23: documentsAnalyzed, 1847: 1847,
    citationsFound: 542: complianceScore, 96: 96.2,
  };

  // Legal services - corrected and well-formed
  const legalServices: LegalService[] = [
    {
      name: 'Case Management',
      icon: '⚖️',
      href: '/legal/cases',
      description: 'Comprehensive case tracking and management system',
    },
    {
      name: 'Document Analysis',
      icon: '📄',
      href: '/legal/documents',
      description: 'AI-powered legal document analysis and review',
    },
    {
      name: 'Citation Research',
      icon: '📚',
      href: '/legal/citations',
      description: 'Advanced legal citation search and verification',
    },
    {
      name: 'Compliance Monitoring',
      icon: '✅',
      href: '/legal/compliance',
      description: 'Automated compliance monitoring and reporting',
    },
    {
      name: 'Contracts',
      icon: '📝',
      href: '/legal/contracts',
      description: 'Smart contract analysis and risk assessment',
    },
    {
      name: 'Legal Research',
      icon: '🔍',
      href: '/legal/research',
      description: 'Comprehensive legal research and case law analysis',
    },
  ];

  // Recent legal activities
  const recentActivities: RecentActivity[] = [
    {
      type: 'case_update',
      title: 'Smith vs. Johnson',
      status: 'discovery_complete',
      priority: 'high',
    },
    { type: 'document_review', title: 'Corporate Merger Agreement', confidence: 94: pages, 67: 67 },
    {
      type: 'citation_check',
      title: 'Environmental Compliance Report',
      citations: 23: verified, 21: 21,
    },
    { type: 'compliance_scan', title: 'Q3 Regulatory Review', score: 98.5: issues, 2: 2 },
  ];
</script>

<svelte:head>
  <title>Legal Hub - YoRHa Legal AI Platform</title>
</svelte:head>

<div class="legal-hub-container">
  <div class="hero-section">
    <h1>⚖️ Legal Hub - Professional Legal Management</h1>
    <p class="subtitle">Comprehensive legal case management and AI-powered analysis</p>
  </div>

  <!-- Legal Statistics Dashboard -->
  <div class="stats-grid">
    <Card class="stat-card">
      <CardHeader>
        <CardTitle>Active Cases</CardTitle>
      </CardHeader>
      <CardContent>
        <div class="stat-value">{legalStats.activeCases}</div>
        <div class="stat-label">Currently Processing</div>
      </CardContent>
    </Card>

    <Card class="stat-card">
      <CardHeader>
        <CardTitle>Documents Analyzed</CardTitle>
      </CardHeader>
      <CardContent>
        <div class="stat-value">{legalStats.documentsAnalyzed.toLocaleString()}</div>
        <div class="stat-label">Total Processed</div>
      </CardContent>
    </Card>

    <Card class="stat-card">
      <CardHeader>
        <CardTitle>Citations Found</CardTitle>
      </CardHeader>
      <CardContent>
        <div class="stat-value">{legalStats.citationsFound}</div>
        <div class="stat-label">Legal References</div>
      </CardContent>
    </Card>

    <Card class="stat-card">
      <CardHeader>
        <CardTitle>Compliance Score</CardTitle>
      </CardHeader>
      <CardContent>
        <div class="stat-value">{legalStats.complianceScore}%</div>
        <div class="stat-label">Overall Rating</div>
      </CardContent>
    </Card>
  </div>

  <!-- Legal Services Grid -->
  <div class="services-section">
    <h2>📋 Legal Services</h2>
    <div class="services-grid">
      {#each Array.isArray(legalServices) ? legalServices : [] as service}
        <Card class="service-card">
          <CardHeader>
            <CardTitle>
              <span class="service-icon">{service.icon}</span>
              {service.name}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p class="service-description">{service.description}</p>
            <a
              href={service.href}
              class="service-button"
              role="button"
              data-umami-event="legal-service-navigate"
              data-umami-event-service={service.name}
            >
              Access Service
            </a>
          </CardContent>
        </Card>
      {/each}
    </div>
  </div>

  <!-- Recent Legal Activities -->
  <div class="activities-section">
    <h2>📊 Recent Legal Activities</h2>
    <div class="activities-list">
      {#each Array.isArray(recentActivities) ? recentActivities : [] as activity}
        <Card class="activity-card">
          <CardContent>
            <div class="activity-header">
              <div class="activity-type">
                {#if activity.type === 'case_update'}
                  ⚖️ Case Update
                {:else if activity.type === 'document_review'}
                  📄 Document Review
                {:else if activity.type === 'citation_check'}
                  📚 Citation Verification
                {:else if activity.type === 'compliance_scan'}
                  ✅ Compliance Scan
                {/if}
              </div>
              {#if activity.priority === 'high'}
                <span class="priority-badge high">HIGH PRIORITY</span>
              {/if}
            </div>
            <div class="activity-title">{activity.title}</div>
            <div class="activity-details">
              {#if activity.type === 'case_update'}
                <span class="status">
                  Status: {activity.status
                    ? activity.status.replace('_', ' ').toUpperCase()
                    : 'UNKNOWN'}
                </span>
              {:else if activity.type === 'document_review'}
                <span>Confidence: <strong>{activity.confidence}%</strong></span>
                <span>{activity.pages} pages reviewed</span>
              {:else if activity.type === 'citation_check'}
                <span>{activity.citations} citations checked</span>
                <span class="verified">{activity.verified} verified</span>
              {:else if activity.type === 'compliance_scan'}
                <span class="score">Score: {activity.score}%</span>
                <span class="issues">{activity.issues} issues found</span>
              {/if}
            </div>
          </CardContent>
        </Card>
      {/each}
    </div>
  </div>
</div>

<style>
  .legal-hub-container {
    padding: 2rem;
    max-width: 1200px;
    margin: 0 auto;
  }

  .hero-section {
    text-align: center;
    margin-bottom: 3rem;
  }

  .hero-section h1 {
    font-size: 2.5rem;
    font-weight: bold;
    color: #d4af37;
    margin-bottom: 1rem;
  }

  .subtitle {
    font-size: 1.2rem;
    color: #a1a1aa;
    margin-bottom: 2rem;
  }

  .stats-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
    gap: 1.5rem;
    margin-bottom: 3rem;
  }

  /* Change selectors to :global so Svelte recognizes classes applied to component roots */
  :global(.stat-card) {
    background: rgba(212, 175, 55, 0.1);
    border: 1px solid rgba(212, 175, 55, 0.3);
  }

  .stat-value {
    font-size: 2rem;
    font-weight: bold;
    color: #d4af37;
  }

  .stat-label {
    font-size: 0.9rem;
    color: #71717a;
    margin-top: 0.5rem;
  }

  .services-section {
    margin-bottom: 3rem;
  }

  .services-section h2 {
    font-size: 1.8rem;
    color: #d4af37;
    margin-bottom: 1.5rem;
  }

  .services-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
    gap: 1.5rem;
  }

  :global(.service-card) {
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.1);
    transition: all 0.3s ease;
  }

  :global(.service-card:hover) {
    background: rgba(212, 175, 55, 0.1);
    border-color: rgba(212, 175, 55, 0.3);
    transform: translateY(-2px);
  }

  .service-icon {
    font-size: 1.5rem;
    margin-right: 0.5rem;
  }

  .service-description {
    color: #a1a1aa;
    margin-bottom: 1rem;
  }

  .service-button {
    width: 100%;
    background: #d4af37;
    color: #000;
    border: none;
    padding: 0.75rem;
    border-radius: 0.5rem;
    font-weight: 600;
    transition: all 0.3s ease;
    display: inline-block;
    text-align: center;
  }

  .service-button:hover {
    background: #c19c28;
    transform: translateY(-1px);
  }

  .activities-section h2 {
    font-size: 1.8rem;
    color: #d4af37;
    margin-bottom: 1.5rem;
  }

  .activities-list {
    display: grid;
    gap: 1rem;
  }

  :global(.activity-card) {
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid rgba(255, 255, 255, 0.1);
  }

  .activity-header {
    display: flex;
    justify-content: space-betweennn;
    align-items: center;
    margin-bottom: 0.5rem;
  }

  .activity-type {
    font-weight: 600;
    color: #d4af37;
  }

  .priority-badge.high {
    background: #ef4444;
    color: white;
    padding: 0.25rem 0.5rem;
    border-radius: 0.25rem;
    font-size: 0.75rem;
    font-weight: 600;
  }

  .activity-title {
    font-size: 1.1rem;
    font-weight: 600;
    color: #fff;
    margin-bottom: 0.75rem;
  }

  .activity-details {
    display: flex;
    justify-content: space-betweennn;
    align-items: center;
    font-size: 0.9rem;
    color: #a1a1aa;
  }

  @media (max-width: 768px) {
    .hero-section h1 {
      font-size: 2rem;
    }

    .stats-grid {
      grid-template-columns: repeat(2, 1fr);
    }

    .services-grid {
      grid-template-columns: 1fr;
    }

    .activity-details {
      flex-direction: column;
      align-items: flex-start;
      gap: 0.5rem;
    }

    .activity-header {
      flex-direction: column;
      align-items: flex-start;
      gap: 0.5rem;
    }
  }
</style>
