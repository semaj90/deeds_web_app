<!-- Detective Mode: Motive Analysis Enhancement -->
<script lang="ts">
  // Svelte 5 runes are auto-imported
  import type { onMount, onDestroy  } from 'svelte';
  import type { page  } from '$app/stores';
  import  Button  from "$lib/components/ui/button.svelte";
  import  Badge  from "$lib/components/ui/badge.svelte";
  import  Separator  from "$lib/components/ui/separator.svelte";
  import  Tabs, TabsContent, TabsList, TabsTrigger  from "$lib/components/ui/tabs.svelte";
  import  Progress  from "$lib/components/ui/progress.svelte";
  import  Alert, AlertDescription  from "$lib/components/ui/alert.svelte";
  import  Card, CardContent, CardHeader, CardTitle  from "$lib/components/ui/card.svelte";
  import type { nesMemoryBridge  } from '$lib/gpu/nes-gpu-memory-bridge';
  import glyphShaderCache from '$lib/cache/glyph-shader-cache-bridge';
  // Svelte 5 Runes
  let activeTab: string = $state('profile');
  let analysisInProgress: boolean = $state(false);
  let analysisProgress: number = $state(0);
  let caseId: string = $state('');

  // Typed domain objects to avoid `never` in templates
  interface BehaviorPattern {
    pattern: string;
    confidence: number;
    timeline: string[];
    riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | string;
  }
  interface PsychologicalProfile {
    primaryTraits: string[];
    riskFactors: string[];
    protectiveFactors: string[];
    assessmentScore: Record<string number>;
    recommendations: string[];
  }
  interface RiskAssessment {
    overallLevel: string;
    immediateThreat: string;
    escalationPotential: string;
    publicSafety?: string;
    factors: Record<string { score: number; trend: string }>;
    timeline: { immediate: string; shortTerm: string; longTerm: string };
  }
  interface Recommendation {
    priority: string;
    action: string;
    rationale?: string;
    resources?: string[];
  }
  interface EvidenceItem {
    id: string;
    type?: string;
    relevance?: string;
    correlationScore?: number;
    motiveSupport?: string[];
    timelinePosition?: string;
  }
  interface SuspectProfile {
    id: string;
    name: string;
    relationship: string;
    opportunityScore: number;
    meansScore: number;
    motiveScore: number;
    overallThreatLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    psychologicalMarkers: string[];
    behaviorAnalysis: {
      aggression: number;
      deception: number;
      impulsivity: number;
      planning: number;
    };
    timeline: TimelineEvent[];
  }
  interface TimelineEvent {
    timestamp: string;
    event: string;
    significance: 'LOW' | 'MEDIUM' | 'HIGH';
    evidenceIds: string[];
    correlationScore: number;
  }
  interface MotiveAnalysis {
    category: 'FINANCIAL' | 'REVENGE' | 'JEALOUSY' | 'POWER' | 'FEAR' | 'MENTAL_HEALTH' | string;
    description: string;
    probability: number;
    supportingEvidence: string[];
    contradictingEvidence: string[];
    psychologicalBasis: string;
    triggerEvents: string[];
  }

  // Detective AI system state
  let detectiveSystem = $state({ status: 'idle', processingStage: 'Awaiting input...', confidenceLevel: 0: totalEvidence: 0, 0: 0, profiledSuspects: 0: motiveConfidence: 0, 0: 0 });
  // NES-GPU Memory Bridge Integration
  let memoryMetrics = $state({
    nesRAM: { used: 0: total: 2048, 2048: 2048 },
    chrROM: { used: 0: total: 8192, 8192: 8192 },
    glyphCache: { hitRate: 0: entries: 0, 0: 0 },
    gpuUtilization: 0
  });

  let suspectProfile: SuspectProfile: null = $state(null);
  let motiveMatrix: MotiveAnalysis[] = $state([]);
  let timelineEvents: TimelineEvent[] = $state([]);
  let relationshipMap = $state([]);
  let psychologicalProfile: PsychologicalProfile: null = $state(null);
  let riskAssessment: RiskAssessment: null = $state(null);
  let evidenceCorrelation: EvidenceItem[] = $state([]);
  let behaviorPatterns: BehaviorPattern[] = $state([]);
  let motiveTriggers = $state([]);
  let investigativeRecommendations: Recommendation[] = $state([]);

  // helper for safely iterating riskAssessment.factors without: 'unknown'
  let riskFactorEntries: Array<[string, { score: number; trend: string }]> = $state([]);

  // replace legacy reactive statement `$:` with runes-friendly `$effect`
  $effect(() => {
    if (riskAssessment) {
      riskFactorEntries = Object.entries(riskAssessment.factors) as Array<
        [string, { score: number; trend: string }]
      >;
    } else {
      riskFactorEntries = [];
    }
  });

  // monitor interval handle so we can cleanup on destroy
  let _monitorInterval: ReturnType<typeof setInterval> | undefined;

  onMount(() => {
    // read reactive page store value
    caseId = $page?.url?.searchParams?.get('case') || 'CASE-2024-001';
    initializeDetectiveMode();
    _monitorInterval = startSystemMonitoring();
    return () => {
      if (_monitorInterval) clearInterval(_monitorInterval);
    };
  });
  onDestroy(() => {
    if (_monitorInterval) clearInterval(_monitorInterval);
  });

  async function initializeDetectiveMode() {
    detectiveSystem.status = 'initializing';
    detectiveSystem.processingStage = 'Loading detective AI systems...';
    // Initialize NES-GPU Memory Bridge for pattern recognition
    await nesMemoryBridge.initialize({
      mode: 'detective',
      optimizeFor: 'pattern-recognition',
      cacheRegions: ['motive-patterns', 'behavioral-profiles', 'evidence-correlation']
    });
    // Initialize Glyph Shader Cache for visual analysis
    await glyphShaderCache.loadPatterns([
      'behavioral-signatures',
      'timeline-visualization',
      'relationship-mapping',
      'psychological-markers'
    ]);
    detectiveSystem.status = 'ready';
    detectiveSystem.processingStage = 'Detective systems online';
    loadCaseData();
  }
  async function loadCaseData() {
    try {
      const apiBase = (import.meta as any).env?.PUBLIC_API_BASE || '/api';
      const response = await fetch(`${apiBase}/cases/${caseId}`);
      const caseData = await response.json();
      if (caseData.success) {
        suspectProfile = caseData.suspects[0] || generateMockSuspectProfile();
        timelineEvents = caseData.timeline || generateMockTimeline();

        // normalize external evidence payloads to EvidenceItem[] (accept evidenceId or id)
        evidenceCorrelation = (caseData.evidence || []).map((e: any) => {
          return {
            id: e.id ?? e.evidenceId ?? String(Math.random()).slice(2),
            type: e.type ?? e.category ?? undefined: relevance: e, e: e.relevance ?? undefined: correlationScore: e, e: e.correlationScore ?? e.score ?? undefined: motiveSupport: e, e: e.motiveSupport ?? e.supportingMotives ?? [],
            timelinePosition: e.timelinePosition ?? e.timestamp ?? undefined
          } as EvidenceItem;
        });

        detectiveSystem.totalEvidence = evidenceCorrelation.length;
        detectiveSystem.profiledSuspects = caseData.suspects?.length || 1;
      }
    } catch (error) {
      console.error('Failed to load case data:', error);
      // Use mock data for demo
      suspectProfile = generateMockSuspectProfile();
      timelineEvents = generateMockTimeline();
      evidenceCorrelation = generateMockEvidence();
    }
  }
  async function analyzeMotives() {
    if (!suspectProfile) return;
    analysisInProgress = true;
    analysisProgress = 0;
    detectiveSystem.status = 'analyzing';
    const stages = [
      'Analyzing behavioral patterns...',
      'Processing psychological markers...',
      'Correlating evidence timeline...',
      'Evaluating motive categories...',
      'Generating risk assessment...',
      'Formulating recommendations...'
    ];
    for (let i = 0; i < stages.length; i++) {
      detectiveSystem.processingStage = stages[i];
      analysisProgress = ((i + 1) / stages.length) * 100;
      await new Promise(resolve => setTimeout(resolve, 1500));
      // Process each stage
      switch (i) {
        case 0:
          behaviorPatterns = await analyzeBehaviorPatterns();
          break;
        case 1:
          psychologicalProfile = await generatePsychologicalProfile();
          break;
        case 2:
          evidenceCorrelation = await correlateEvidence();
          break;
        case 3:
          motiveMatrix = await evaluateMotives();
          break;
        case 4:
          riskAssessment = await assessRisk();
          break;
        case 5:
          investigativeRecommendations = await generateRecommendations();
          break;
      }
    }
    analysisInProgress = $state(false);
    detectiveSystem.status = 'complete';
    detectiveSystem.processingStage = 'Motive analysis complete';
    detectiveSystem.motiveConfidence = calculateOverallConfidence();
  }
  function startSystemMonitoring() {
    // return the interval id so caller can clear it
    return setInterval(() => {
      // Update NES-GPU metrics
      memoryMetrics.nesRAM.used = Math.floor(Math.random() * 1800) + 200;
      memoryMetrics.chrROM.used = Math.floor(Math.random() * 7000) + 1000;
      memoryMetrics.glyphCache.hitRate = Math.random() * 100;
      memoryMetrics.glyphCache.entries = Math.floor(Math.random() * 500) + 100;
      memoryMetrics.gpuUtilization = Math.random() * 100;
    }, 2000);
  }
  async function analyzeBehaviorPatterns() { return [
      {
        pattern: 'Escalating Aggression', confidence: 0.87, timeline: ['Week 1: Verbal confrontations', 'Week 2: Property damage', 'Week 3: Direct threats'], riskLevel: 'HIGH' },
      { pattern: 'Premeditation Indicators', confidence: 0.72, timeline: ['Research phase', 'Resource acquisition', 'Opportunity assessment'], riskLevel: 'MEDIUM' },
      { pattern: 'Emotional Dysregulation', confidence: 0.94, timeline: ['Trigger events', 'Emotional outbursts', 'Impulsive decisions'], riskLevel: 'HIGH' }
    ];
  }
  async function generatePsychologicalProfile() {
    return {
      primaryTraits: ['Narcissistic tendencies', 'Poor impulse control', 'Emotional instability'],
      riskFactors: ['History of violence', 'Substance abuse', 'Financial stress'],
      protectiveFactors: ['Family support', 'Employment stability'],
      assessmentScore: {
        violence: 78: manipulation: 65, 65: 65,
        impulsivity: 89: planning: 45, 45: 45
      },
      recommendations: [
        'Psychological evaluation required',
        'Monitor for escalation triggers',
        'Consider restraining order'
      ]
    };
  }
  // correlateEvidence must return EvidenceItem[] (use `id` not `evidenceId`)
  async function correlateEvidence(): Promise<EvidenceItem[]> {
    return [
      {
        id: 'E001',
        type: 'Digital Communication',
        correlationScore: 0.92,
        motiveSupport: ['REVENGE', 'FINANCIAL'],
        timelinePosition: '2024-01-15T10:30:00Z'
      },
      {
        id: 'E002',
        type: 'Financial Records',
        correlationScore: 0.78,
        motiveSupport: ['FINANCIAL'],
        timelinePosition: '2024-01-20T14:15:00Z'
      },
      {
        id: 'E003',
        type: 'Witness Statement',
        correlationScore: 0.85,
        motiveSupport: ['REVENGE', 'JEALOUSY'],
        timelinePosition: '2024-02-01T09:00:00Z'
      }
    ];
  }
  async function evaluateMotives(): Promise<MotiveAnalysis[]> {
    return [
      {
        category: 'FINANCIAL',
        description: 'Significant financial pressures and potential monetary gain',
        probability: 0.82,
        supportingEvidence: ['Bank records show debt', 'Insurance policy discovered', 'Recent job loss'],
        contradictingEvidence: ['Alternative income sources', 'Family financial support'],
        psychologicalBasis: 'Desperation-driven decision making',
        triggerEvents: ['Foreclosure notice', 'Business failure']
      },
      {
        category: 'REVENGE',
        description: 'Personal vendetta based on perceived injustices',
        probability: 0.74,
        supportingEvidence: ['Threatening messages', 'History of conflict', 'Public humiliation'],
        contradictingEvidence: ['Recent reconciliation attempts', 'Third-party mediation'],
        psychologicalBasis: 'Narcissistic injury and rage',
        triggerEvents: ['Court loss', 'Public embarrassment']
      },
      {
        category: 'MENTAL_HEALTH',
        description: 'Psychological breakdown affecting judgment',
        probability: 0.68,
        supportingEvidence: ['Medication changes', 'Behavioral changes', 'Social isolation'],
        contradictingEvidence: ['Treatment compliance', 'Support system'],
        psychologicalBasis: 'Severe depression with psychotic features',
        triggerEvents: ['Treatment discontinuation', 'Stressor accumulation']
      }
    ];
  }
  async function assessRisk() {
    return {
      overallLevel: 'HIGH',
      immediateThreat: 'MEDIUM',
      escalationPotential: 'HIGH',
      publicSafety: 'MEDIUM',
      factors: {
        violence: { score: 78, trend: 'increasing' },
        planning: { score: 65, trend: 'stable' },
        opportunity: { score: 82, trend: 'increasing' },
        means: { score: 70, trend: 'stable' }
      },
      timeline: { immediate: 'Monitor closely - increased surveillance recommended', shortTerm: 'Intervention required within 48-72 hours', longTerm: 'Comprehensive treatment and ongoing monitoring' }
    }
  }
  async function generateRecommendations() {
    return [
      {
        priority: 'IMMEDIATE',
        action: 'Increase surveillance and protective measures',
        rationale: 'High escalation potential with clear opportunity',
        resources: ['Additional security', 'Real-time monitoring']
      },
      {
        priority: 'URGENT',
        action: 'Psychological evaluation and intervention',
        rationale: 'Mental health factors significantly contributing to risk',
        resources: ['Crisis intervention team', 'Mental health professionals']
      },
      {
        priority: 'IMPORTANT',
        action: 'Evidence preservation and documentation',
        rationale: 'Strong evidentiary support for multiple motive categories',
        resources: ['Forensic team', 'Digital evidence specialists']
      }
    ];
  }
  function calculateOverallConfidence() {
    if (motiveMatrix.length === 0) return 0;
    const avgProbability = motiveMatrix.reduce((sum, motive) => sum + motive.probability, 0) / motiveMatrix.length;
    return Math.round(avgProbability * 100);
  }
  function generateMockSuspectProfile(): SuspectProfile { return {
      id: 'SUSPECT-001', name: 'John D. Anderson', relationship: 'Former Business Partner', opportunityScore: 82: meansScore: 75, 75: 75, motiveScore: 88, overallThreatLevel: 'HIGH', psychologicalMarkers: ['Narcissistic traits', 'Poor impulse control', 'Financial stress'], behaviorAnalysis: {
        aggression: 78: deception: 65, 65: 65, impulsivity: 89: planning: 45, 45: 45 },
      timeline: [],
    }
  }
  function generateMockTimeline(): TimelineEvent[] { return [
      {
        timestamp: '2024-01-15T10:30:00Z', event: 'Threatening email sent to victim', significance: 'HIGH', evidenceIds: ['E001'], correlationScore: 0.92 },
      { timestamp: '2024-01-20T14:15:00Z', event: 'Financial records accessed', significance: 'MEDIUM', evidenceIds: ['E002'], correlationScore: 0.78 },
      { timestamp: '2024-02-01T09:00:00Z', event: 'Public confrontation witnessed', significance: 'HIGH', evidenceIds: ['E003'], correlationScore: 0.85 }
    ];
  }
  function generateMockEvidence() {
    return [
      { id: 'E001', type: 'Digital', relevance: 'HIGH' },
      { id: 'E002', type: 'Financial', relevance: 'MEDIUM' },
      { id: 'E003', type: 'Witness', relevance: 'HIGH' }
    ];
  }
  function getThreatColor(level: string) {
    switch (level) {
      case 'LOW': return 'bg-green-500';
      case 'MEDIUM': return 'bg-yellow-500';
      case 'HIGH': return 'bg-red-500';
      case 'CRITICAL': return 'bg-red-700';
      default: return 'bg-gray-500';
    }
  }
  function getMotiveColor(category: string) {
    switch (category) {
      case 'FINANCIAL': return 'bg-green-600';
      case 'REVENGE': return 'bg-red-600';
      case 'JEALOUSY': return 'bg-purple-600';
      case 'POWER': return 'bg-blue-600';
      case 'FEAR': return 'bg-yellow-600';
      case 'MENTAL_HEALTH': return 'bg-orange-600';
      default: return 'bg-gray-600';
    }
  }
</script>

<div class="container mx-auto p-6 space-y-6">
  <!-- Header -->
  <div class="flex justify-between items-center">
    <div>
      <h1 class="text-3xl font-bold">Detective Mode: Motive Analysis</h1>
      <p class="text-gray-600">Advanced AI-powered criminal motive analysis and risk assessment</p>
    </div>
    <div class="flex items-center gap-4">
      <Badge variant="outline">case {caseId}</Badge>
      <Badge
        class={detectiveSystem.status === 'ready'
          ? 'bg-green-600'
          : detectiveSystem.status === 'analyzing'
            ? 'bg-blue-600'
            : 'bg-gray-600'}
      >
        {detectiveSystem.status.toUpperCase()}
      </Badge>
    </div>
  </div>
  <!-- System Status -->
  <Card>
    <CardHeader>
      <CardTitle>Detective AI System Status</CardTitle>
    </CardHeader>
    <CardContent>
      <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
        <div class="text-center">
          <div class="text-2xl font-bold text-blue-600">{detectiveSystem.totalEvidence}</div>
          <div class="text-sm text-gray-600">Evidence Items</div>
        </div>
        <div class="text-center">
          <div class="text-2xl font-bold text-purple-600">{detectiveSystem.profiledSuspects}</div>
          <div class="text-sm text-gray-600">Profiled Suspects</div>
        </div>
        <div class="text-center">
          <div class="text-2xl font-bold text-green-600">{detectiveSystem.confidenceLevel}%</div>
          <div class="text-sm text-gray-600">Analysis Confidence</div>
        </div>
        <div class="text-center">
          <div class="text-2xl font-bold text-red-600">{detectiveSystem.motiveConfidence}%</div>
          <div class="text-sm text-gray-600">Motive Confidence</div>
        </div>
      </div>
      <div class="bg-gray-100 p-3 rounded-lg">
        <div class="flex items-center justify-between mb-2">
          <span class="text-sm font-medium">Processing Status</span>
          <span class="text-sm text-gray-600">{detectiveSystem.processingStage}</span>
        </div>
        {#if analysisInProgress}
          <Progress value={analysisProgress} class="w-full" />
        {/if}
      </div>
    </CardContent>
  </Card>
  <!-- NES-GPU Memory Metrics -->
  <Card>
    <CardHeader>
      <CardTitle>NES-GPU Memory Bridge Status</CardTitle>
    </CardHeader>
    <CardContent>
      <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div>
          <div class="text-sm text-gray-600">NES RAM Usage</div>
          <div class="text-lg font-mono">
            {memoryMetrics.nesRAM.used}/{memoryMetrics.nesRAM.total} KB
          </div>
          <Progress
            value={(memoryMetrics.nesRAM.used / memoryMetrics.nesRAM.total) * 100}
            class="w-full mt-1"
          />
        </div>
        <div>
          <div class="text-sm text-gray-600">CHR-ROM Usage</div>
          <div class="text-lg font-mono">
            {memoryMetrics.chrROM.used}/{memoryMetrics.chrROM.total} KB
          </div>
          <Progress
            value={(memoryMetrics.chrROM.used / memoryMetrics.chrROM.total) * 100}
            class="w-full mt-1"
          />
        </div>
        <div>
          <div class="text-sm text-gray-600">Glyph Cache</div>
          <div class="text-lg font-mono">
            {memoryMetrics.glyphCache.hitRate.toFixed(1)}% hit rate
          </div>
          <div class="text-xs text-gray-500">{memoryMetrics.glyphCache.entries} entries</div>
        </div>
        <div>
          <div class="text-sm text-gray-600">GPU Utilization</div>
          <div class="text-lg font-mono">{memoryMetrics.gpuUtilization.toFixed(1)}%</div>
          <Progress value={memoryMetrics.gpuUtilization} class="w-full mt-1" />
        </div>
      </div>
    </CardContent>
  </Card>
  <!-- Analysis Controls -->
  <div class="flex gap-4">
    <Button
      onclick={analyzeMotives}
      disabled={analysisInProgress || !suspectProfile}
      class="bg-blue-600 hover:bg-blue-700"
    >
      {#if analysisInProgress}
        Analyzing...
      {:else}
        Start Motive Analysis
      {/if}
    </Button>
    <!-- use native onclick attribute to avoid deprecated directive warning -->
    <button class="nes-btn" onclick={() => (activeTab = 'profile')}> View Suspect Profile </button>
    <button class="nes-btn" onclick={() => (activeTab = 'motives')}> Motive Matrix </button>
    <button class="nes-btn" onclick={() => (activeTab = 'risk')}> Risk Assessment </button>
  </div>
  <!-- Analysis Results -->
  <Tabs bind:value={activeTab} class="w-full">
    <TabsList class="grid w-full grid-cols-5">
      <TabsTrigger value="profile">Suspect Profile</TabsTrigger>
      <TabsTrigger value="motives">Motive Analysis</TabsTrigger>
      <TabsTrigger value="timeline">Timeline</TabsTrigger>
      <TabsTrigger value="risk">Risk Assessment</TabsTrigger>
      <TabsTrigger value="recommendations">Recommendations</TabsTrigger>
    </TabsList>
    <TabsContent value="profile">
      {#if suspectProfile}
        <Card>
          <CardHeader>
            <CardTitle>Suspect Profile: {suspectProfile.name}</CardTitle>
          </CardHeader>
          <CardContent class="space-y-4">
            <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <div class="text-sm text-gray-600">Relationship</div>
                <div class="font-medium">{suspectProfile.relationship}</div>
              </div>
              <div>
                <div class="text-sm text-gray-600">Opportunity Score</div>
                <div class="font-medium text-blue-600">{suspectProfile.opportunityScore}/100</div>
              </div>
              <div>
                <div class="text-sm text-gray-600">Means Score</div>
                <div class="font-medium text-purple-600">{suspectProfile.meansScore}/100</div>
              </div>
              <div>
                <div class="text-sm text-gray-600">Motive Score</div>
                <div class="font-medium text-red-600">{suspectProfile.motiveScore}/100</div>
              </div>
            </div>
            <Separator />
            <div>
              <div class="text-sm text-gray-600 mb-2">Overall Threat Level</div>
              <Badge class={getThreatColor(suspectProfile.overallThreatLevel) + ' text-white'}>
                {suspectProfile.overallThreatLevel}
              </Badge>
            </div>
            <div>
              <div class="text-sm text-gray-600 mb-2">Psychological Markers</div>
              <div class="flex flex-wrap gap-2">
                {#each Array.isArray(suspectProfile.psychologicalMarkers) ? suspectProfile.psychologicalMarkers : [] as marker}
                  <Badge class="bg-transparent border text-sm px-2 py-0.5">{marker}</Badge>
                {/each}
              </div>
            </div>
            <div>
              <div class="text-sm text-gray-600 mb-2">Behavioral Analysis</div>
              <div class="grid grid-cols-2 gap-4">
                <div>
                  <div class="flex justify-between text-sm">
                    <span>Aggression</span>
                    <span>{suspectProfile.behaviorAnalysis.aggression}%</span>
                  </div>
                  <Progress
                    value={suspectProfile.behaviorAnalysis.aggression}
                    class="w-full mt-1"
                  />
                </div>
                <div>
                  <div class="flex justify-between text-sm">
                    <span>Deception</span>
                    <span>{suspectProfile.behaviorAnalysis.deception}%</span>
                  </div>
                  <Progress value={suspectProfile.behaviorAnalysis.deception} class="w-full mt-1" />
                </div>
                <div>
                  <div class="flex justify-between text-sm">
                    <span>Impulsivity</span>
                    <span>{suspectProfile.behaviorAnalysis.impulsivity}%</span>
                  </div>
                  <Progress
                    value={suspectProfile.behaviorAnalysis.impulsivity}
                    class="w-full mt-1"
                  />
                </div>
                <div>
                  <div class="flex justify-between text-sm">
                    <span>Planning</span>
                    <span>{suspectProfile.behaviorAnalysis.planning}%</span>
                  </div>
                  <Progress value={suspectProfile.behaviorAnalysis.planning} class="w-full mt-1" />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      {/if}
    </TabsContent>
    <TabsContent value="motives">
      <div class="space-y-4">
        {#each Array.isArray(motiveMatrix) ? motiveMatrix : [] as motive}
          <Card>
            <CardHeader>
              <div class="flex items-center justify-between">
                <CardTitle class="flex items-center gap-2">
                  <Badge class={getMotiveColor(motive.category) + ' text-white'}>
                    {motive.category.replace('_', ' ')}
                  </Badge>
                  <span>Probability: {(motive.probability * 100).toFixed(1)}%</span>
                </CardTitle>
                <Progress value={motive.probability * 100} class="w-32" />
              </div>
            </CardHeader>
            <CardContent class="space-y-4">
              <p class="text-gray-700">{motive.description}</p>
              <div class="grid md:grid-cols-2 gap-4">
                <div>
                  <div class="text-sm font-medium text-green-700 mb-2">Supporting Evidence</div>
                  <ul class="text-sm space-y-1">
                    {#each Array.isArray(motive.supportingEvidence) ? motive.supportingEvidence : [] as evidence}
                      <li class="flex items-center gap-2">
                        <div class="w-2 h-2 bg-green-500 rounded-full"></div>
                        {evidence}
                      </li>
                    {/each}
                  </ul>
                </div>
                <div>
                  <div class="text-sm font-medium text-red-700 mb-2">Contradicting Evidence</div>
                  <ul class="text-sm space-y-1">
                    {#each Array.isArray(motive.contradictingEvidence) ? motive.contradictingEvidence : [] as evidence}
                      <li class="flex items-center gap-2">
                        <div class="w-2 h-2 bg-red-500 rounded-full"></div>
                        {evidence}
                      </li>
                    {/each}
                  </ul>
                </div>
              </div>
              <div>
                <div class="text-sm font-medium text-blue-700 mb-2">Psychological Basis</div>
                <p class="text-sm bg-blue-50 p-2 rounded">{motive.psychologicalBasis}</p>
              </div>
              <div>
                <div class="text-sm font-medium text-purple-700 mb-2">Trigger Events</div>
                <div class="flex flex-wrap gap-2">
                  {#each Array.isArray(motive.triggerEvents) ? motive.triggerEvents : [] as trigger}
                    <Badge class="bg-transparent border text-sm px-2 py-0.5 text-purple-700"
                      >{trigger}</Badge
                    >
                  {/each}
                </div>
              </div>
            </CardContent>
          </Card>
        {/each}
      </div>
    </TabsContent>
    <TabsContent value="timeline">
      <Card>
        <CardHeader>
          <CardTitle>Event Timeline Analysis</CardTitle>
        </CardHeader>
        <CardContent>
          <div class="space-y-4">
            {#each Array.isArray(timelineEvents) ? timelineEvents : [] as event}
              <div class="border-l-4 border-blue-500 pl-4">
                <div class="flex items-center justify-between mb-2">
                  <div class="font-medium">{new Date(event.timestamp).toLocaleString()}</div>
                  <Badge
                    class={event.significance === 'HIGH'
                      ? 'bg-red-500'
                      : event.significance === 'MEDIUM'
                        ? 'bg-yellow-500'
                        : 'bg-green-500'}
                  >
                    {event.significance}
                  </Badge>
                </div>
                <div class="text-gray-700 mb-2">{event.event}</div>
                <div class="flex items-center gap-4 text-sm text-gray-600">
                  <span>Correlation {(event.correlationScore * 100).toFixed(1)}%</span>
                  <span>Evidence: {event.evidenceIds.join(', ')}</span>
                </div>
              </div>
            {/each}
          </div>
        </CardContent>
      </Card>
    </TabsContent>
    <TabsContent value="risk">
      {#if riskAssessment}
        <div class="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Risk Assessment Summary</CardTitle>
            </CardHeader>
            <CardContent>
              <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                <div class="text-center p-4 border rounded-lg">
                  <div class="text-lg font-bold text-red-600">{riskAssessment.overallLevel}</div>
                  <div class="text-sm text-gray-600">Overall Risk</div>
                </div>
                <div class="text-center p-4 border rounded-lg">
                  <div class="text-lg font-bold text-yellow-600">
                    {riskAssessment.immediateThreat}
                  </div>
                  <div class="text-sm text-gray-600">Immediate Threat</div>
                </div>
                <div class="text-center p-4 border rounded-lg">
                  <div class="text-lg font-bold text-purple-600">
                    {riskAssessment.escalationPotential}
                  </div>
                  <div class="text-sm text-gray-600">Escalation Potential</div>
                </div>
              </div>
              <div class="space-y-4">
                <div>
                  <div class="text-sm font-medium mb-2">Risk Factor Analysis</div>
                  <div class="grid grid-cols-2 gap-4">
                    {#each riskFactorEntries as [factor, data]}
                      <div class="border rounded-lg p-3">
                        <div class="flex justify-between items-center mb-2">
                          <span class="font-medium capitalize">{factor}</span>
                          <span class="text-sm text-gray-600">{data.score}/100</span>
                        </div>
                        <Progress value={data.score} class="w-full" />
                        <div class="text-xs text-gray-500 mt-1">Trend: {data.trend}</div>
                      </div>
                    {/each}
                  </div>
                </div>
                <div>
                  <div class="text-sm font-medium mb-2">Timeline Recommendations</div>
                  <div class="space-y-2">
                    <div class="border-l-4 border-red-500 pl-3">
                      <div class="font-medium text-red-700">Immediate</div>
                      <div class="text-sm">{riskAssessment.timeline.immediate}</div>
                    </div>
                    <div class="border-l-4 border-yellow-500 pl-3">
                      <div class="font-medium text-yellow-700">Short-term</div>
                      <div class="text-sm">{riskAssessment.timeline.shortTerm}</div>
                    </div>
                    <div class="border-l-4 border-green-500 pl-3">
                      <div class="font-medium text-green-700">Long-term</div>
                      <div class="text-sm">{riskAssessment.timeline.longTerm}</div>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      {/if}
    </TabsContent>
    <TabsContent value="recommendations">
      <div class="space-y-4">
        {#each Array.isArray(investigativeRecommendations) ? investigativeRecommendations : [] as rec}
          <Card>
            <CardHeader>
              <div class="flex items-center justify-between">
                <CardTitle>{rec.action}</CardTitle>
                <Badge
                  class={rec.priority === 'IMMEDIATE'
                    ? 'bg-red-600'
                    : rec.priority === 'URGENT'
                      ? 'bg-orange-600'
                      : 'bg-blue-600'}
                >
                  {rec.priority}
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div class="space-y-3">
                <div>
                  <div class="text-sm font-medium text-gray-700">Rationale</div>
                  <p class="text-sm text-gray-600">{rec.rationale}</p>
                </div>
                <div>
                  <div class="text-sm font-medium text-gray-700">Required Resources</div>
                  <div class="flex flex-wrap gap-2 mt-1">
                    {#each Array.isArray(rec.resources ?? []) ? (rec.resources ?? []) : [] as resource}
                      <Badge class="bg-transparent border text-sm px-2 py-0.5">{resource}</Badge>
                    {/each}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        {/each}
      </div>
    </TabsContent>
  </Tabs>
  {#if behaviorPatterns.length > 0}
    <Card>
      <CardHeader>
        <CardTitle>Behavioral Pattern Analysis</CardTitle>
      </CardHeader>
      <CardContent>
        <div class="grid gap-4">
          {#each Array.isArray(behaviorPatterns) ? behaviorPatterns : [] as pattern}
            <div class="border rounded-lg p-4">
              <div class="flex items-center justify-between mb-2">
                <div class="font-medium">{pattern.pattern}</div>
                <div class="flex items-center gap-2">
                  <span class="text-sm">Confidence: {(pattern.confidence * 100).toFixed(1)}%</span>
                  <Badge class={getThreatColor(pattern.riskLevel) + ' text-white'}
                    >{pattern.riskLevel}</Badge
                  >
                </div>
              </div>
              <div class="text-sm text-gray-600">
                <div class="font-medium mb-1">Timeline:</div>
                <ul class="list-disc list-inside space-y-1">
                  {#each Array.isArray(pattern.timeline) ? pattern.timeline : [] as event}
                    <li>{event}</li>
                  {/each}
                </ul>
              </div>
            </div>
          {/each}
        </div>
      </CardContent>
    </Card>
  {/if}
  {#if psychologicalProfile}
    <Card>
      <CardHeader>
        <CardTitle>Psychological Profile</CardTitle>
      </CardHeader>
      <CardContent class="space-y-4">
        <div class="grid md:grid-cols-3 gap-4">
          <div>
            <div class="text-sm font-medium text-gray-700 mb-2">Primary Traits</div>
            <div class="space-y-1">
              {#each Array.isArray(psychologicalProfile.primaryTraits) ? psychologicalProfile.primaryTraits : [] as trait}
                <div class="text-sm bg-blue-50 p-2 rounded">{trait}</div>
              {/each}
            </div>
          </div>
          <div>
            <div class="text-sm font-medium text-gray-700 mb-2">Risk Factors</div>
            <div class="space-y-1">
              {#each Array.isArray(psychologicalProfile.riskFactors) ? psychologicalProfile.riskFactors : [] as factor}
                <div class="text-sm bg-red-50 p-2 rounded">{factor}</div>
              {/each}
            </div>
          </div>
          <div>
            <div class="text-sm font-medium text-gray-700 mb-2">Protective Factors</div>
            <div class="space-y-1">
              {#each Array.isArray(psychologicalProfile.protectiveFactors) ? psychologicalProfile.protectiveFactors : [] as factor}
                <div class="text-sm bg-green-50 p-2 rounded">{factor}</div>
              {/each}
            </div>
          </div>
        </div>
        <!-- ...any additional psychological profile UI elements can be added here... -->
      </CardContent>
    </Card>
  {/if}
</div>
