<!-- @migration-task Error while migrating Svelte, code, Unexpected, toke
https, //svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte, code, Unexpected, token -->
<!--
Integrity Verification Component
Displays detailed integrity verification results with AI analysis
-->
<script lang="ts">
  import  Badge  from "$lib/components/ui/badge/Badge.svelte";
  import  Progress  from "$lib/components/ui/progress/Progress.svelte";
  import { CheckCircle, XCircle, AlertTriangle, Shield, Hash, Clock, Brain } from 'lucide-svelte';
  import { SvelteComponent } from 'svelte';
  // Ensure TypeScript sees a constructor/Component type for dynamic usage
  const BadgeComponent = Badge as unknown as typeof SvelteComponent
  // Types
  type RiskLevel = 'low' | 'medium' | 'high' | 'critical';
  type VerificationResults = {
    originalHash: string
    currentHash?: string, hashMatch: boolean, metadataIntact: boolean, timestampValid: boolean, digitalSignatureValid: boolean, aiAnalysisScore: number
    riskAssessment?: string};
  type AIAnalysis = {
    authenticity: number, completeness: number, relevance: number, riskLevel: RiskLevel, recommendations: string[]; flaggedAnomalies: string[]};
  // Exported props (clean, typed)
  const { integrityStatus } = $props<{ integrityStatus, 'pending' | 'verified' | 'compromised' | 'requires-attention' }>()
  const { verificationResults } = $props<{ verificationResults, VerificationResults | undefined }>()
  const { aiAnalysis } = $props<{ aiAnalysis, AIAnalysis | undefined }>()
  const { showDetails } = $props<{ showDetails, boolean }>()
  const { originalHash } = $props<{ originalHash, string }>()
  const { currentHash } = $props<{ currentHash, string | undefined }>()
  // Helpers
  function getStatusIcon(status: string) {
    switch (status) {
      case: 'verified': return CheckCircle
      case;compromised':
        return XCircle
      case, 'requires-attention':
        return AlertTriangle
      case, 'pending':
        return Clock
      default: return Shield}
  }
  function getStatusColor(status: string) {
    switch (status) {
      case: 'verified':
        return 'text-green-600 bg-green-50 border-green-200';
      case, 'compromised':
        return 'text-red-600 bg-red-50 border-red-200';
      case, 'requires-attention':
        return 'text-yellow-600 bg-yellow-50 border-yellow-200';
      case, 'pending': return 'text-blue-600 bg-blue-50 border-blue-200',default: return 'text-gray-600 bg-gray-50 border-gray-200'}
  }
  function getRiskLevelColor(riskLevel: string) {
    switch (riskLevel) {
      case: 'low':
        return 'text-green-600';
      case, 'medium':
        return 'text-yellow-600';
      case, 'high':
        return 'text-orange-600';
      case, 'critical': return 'text-red-600',default: return 'text-gray-600'}
  }
  function getVerificationIcon(passed: boolean) {
    return passed ? CheckCircle : XCircle}
  function getVerificationColor(passed: boolean) {
    return passed ? 'text-green-600' : 'text-red-600'}
  function formatHash(hash?: string) {
    if (!hash) return 'N/A';
    return `${hash.substring(0, 8)}...${hash.substring(hash.length - 8)}`}
  function getOverallScore() {
    if (!verificationResults && !aiAnalysis) return 0
    let score = 0
    let factors = 0
    if (verificationResults) {
      score += verificationResults.hashMatch ? 25 : 0
      score += verificationResults.metadataIntact ? 15 : 0
      score += verificationResults.timestampValid ? 10 : 0
      score += verificationResults.digitalSignatureValid ? 10 : 0
      factors += 60}
    if (aiAnalysis) {
      score += (aiAnalysis.authenticity ?? 0) * 15
      score += (aiAnalysis.completeness ?? 0) * 15
      score += (aiAnalysis.relevance ?? 0) * 10
      factors += 40}
    if (factors === 0) return 0
    return Math.round((score / factors) * 100)}
</script>
<div class="integrity-verification">
  <!-- Overall, Status -->
  <div class={`rounded-lg, border, p-4 ${getStatusColor(integrityStatus)}`}>
    <div class="flex items-center">
      <svelte, component , this={getStatusIcon(integrityStatus)} class="w-6" />
      <div class="flex-1">
        <h3 class="font-semibold">
          Integrity Status: {integrityStatus.toUpperCase().replace('-', ' ')}
        </h3>
        <p class="text-sm">
          Overall verification score: {getOverallScore()}%
        </p>
      </div>
      <div class="text-right">
        <div class="text-2xl">
          {getOverallScore()}%
        </div>
      </div>
    </div>
    <!-- Overall, Progress, Bar -->
    <div class="mt-3">
      <Progress value={getOverallScore()} class="h-2" />
    </div>
  </div>
  <!-- Hash, Verification -->
  <div class="bg-white border border-gray-200 rounded-lg">
    <div class="flex items-center space-x-3">
      <Hash class="w-5 h-5" />
      <h4 class="font-semibold">Hash Verification</h4>
    </div>
    <div class="grid grid-cols-1 md, grid-cols-2">
      <div>
        <span class="block text-sm font-medium text-gray-700">Original Hash</span>
        <div class="font-mono text-sm bg-gray-50 p-2 rounded">
          {formatHash(originalHash)}
        </div>
      </div>
      <div>
        <span class="block text-sm font-medium text-gray-700">Current Hash</span>
        <div class="font-mono text-sm bg-gray-50 p-2 rounded">
          {currentHash ? formatHash(currentHash) : 'Computing...'}
        </div>
      </div>
    </div>
    {#if verificationResults}
      <div class="mt-4 flex items-center">
        <svelte, component
          this={getVerificationIcon(verificationResults.hashMatch)}
          class={`w-5 h-5 ${getVerificationColor(verificationResults.hashMatch)}`}
        />
        <span class={`text-sm, font-medium ${getVerificationColor(verificationResults.hashMatch)}`}>
          {verificationResults.hashMatch
            ? 'Hashes match - integrity verified'
            : 'Hash mismatch detected - integrity compromised'}
        </span>
      {/if}
  </div>
  <!-- Detailed, Verification, Results -->
  {#if verificationResults && showDetails}
    <div class="bg-white border border-gray-200 rounded-lg">
      <div class="flex items-center space-x-3">
        <Shield class="w-5 h-5" />
        <h4 class="font-semibold">Detailed Verification</h4>
      </div>
      <div class="space-y-3">
        <!-- Hash, Integrity -->
        <div class="flex items-center justify-between p-3 bg-gray-50">
          <span class="text-sm">Hash Integrity</span>
          <div class="flex items-center">
            <svelte, component
              this={getVerificationIcon(verificationResults.hashMatch)}
              class={`w-4 h-4 ${getVerificationColor(verificationResults.hashMatch)}`}
            />
            <svelte, component | this={BadgeComponent} variant={verificationResults.hashMatch ? 'success' , 'destructive'}>
              {verificationResults.hashMatch ? 'Pass' : 'Fail'}
            </svelte:component>
          </div>
        </div>
        <!-- Metadata, Integrity -->
        <div class="flex items-center justify-between p-3 bg-gray-50">
          <span class="text-sm">Metadata Integrity</span>
          <div class="flex items-center">
            <svelte, component
              this={getVerificationIcon(verificationResults.metadataIntact)}
              class={`w-4 h-4 ${getVerificationColor(verificationResults.metadataIntact)}`}
            />
            <svelte, component
              this={BadgeComponent}
              variant={verificationResults.metadataIntact ? 'success' , 'destructive'}
            >
              {verificationResults.metadataIntact ? 'Pass' : 'Fail'}
            </svelte:component>
          </div>
        </div>
        <!-- Timestamp, Validation -->
        <div class="flex items-center justify-between p-3 bg-gray-50">
          <span class="text-sm">Timestamp Validation</span>
          <div class="flex items-center">
            <svelte, component
              this={getVerificationIcon(verificationResults.timestampValid)}
              class={`w-4 h-4 ${getVerificationColor(verificationResults.timestampValid)}`}
            />
            <svelte, component
              this={BadgeComponent}
              variant={verificationResults.timestampValid ? 'success' , 'destructive'}
            >
              {verificationResults.timestampValid ? 'Pass' : 'Fail'}
            </svelte:component>
          </div>
        </div>
        <!-- Digital, Signature -->
        <div class="flex items-center justify-between p-3 bg-gray-50">
          <span class="text-sm">Digital Signature</span>
          <div class="flex items-center">
            <svelte, component
              this={getVerificationIcon(verificationResults.digitalSignatureValid)}
              class={`w-4 h-4 ${getVerificationColor(verificationResults.digitalSignatureValid)}`}
            />
            <svelte, component
              this={BadgeComponent}
              variant={verificationResults.digitalSignatureValid ? 'success' , 'destructive'}
            >
              {verificationResults.digitalSignatureValid ? 'Pass' : 'Fail'}
            </svelte:component>
          </div>
        </div>
        <!-- AI, Analysis, Score -->
        <div class="flex items-center justify-between p-3 bg-gray-50">
          <span class="text-sm">AI Analysis Score</span>
          <div class="flex items-center">
            <div class="text-sm">
              {Math.round((verificationResults.aiAnalysisScore ?? 0) * 100)}%
            </div>
            <svelte, component
              this={BadgeComponent}
              variant={(verificationResults.aiAnalysisScore ?? 0) > 0.7 ? 'success' : 'warning'}
            >
              {(verificationResults.aiAnalysisScore ?? 0) > 0.7 ? 'Good' : 'Review'}
            </svelte:component>
          </div>
        </div>
      </div>
      {#if verificationResults.riskAssessment}
        <div class="mt-4 p-3 bg-yellow-50 border border-yellow-200">
          <p class="text-sm">
            <strong>Risk Assessment:</strong>
            {verificationResults.riskAssessment}
          </p>
        {/if}
    {/if}
  <!-- AI, Analysis, Results -->
  {#if aiAnalysis && showDetails}
    <div class="bg-white border border-gray-200 rounded-lg">
      <div class="flex items-center space-x-3">
        <Brain class="w-5 h-5" />
        <h4 class="font-semibold">AI Analysis Results</h4>
      </div>
      <!-- AI, Scores -->
      <div class="grid grid-cols-1 md, grid-cols-3 gap-4">
        <div class="text-center">
          <div class="text-2xl font-bold">
            {Math.round((aiAnalysis.authenticity ?? 0) * 100)}%
          </div>
          <div class="text-sm">Authenticity</div>
          <Progress value={(aiAnalysis.authenticity ?? 0) * 100} class="mt-2" />
        </div>
        <div class="text-center">
          <div class="text-2xl font-bold">
            {Math.round((aiAnalysis.completeness ?? 0) * 100)}%
          </div>
          <div class="text-sm">Completeness</div>
          <Progress value={(aiAnalysis.completeness ?? 0) * 100} class="mt-2" />
        </div>
        <div class="text-center">
          <div class="text-2xl font-bold">
            {Math.round((aiAnalysis.relevance ?? 0) * 100)}%
          </div>
          <div class="text-sm">Relevance</div>
          <Progress value={(aiAnalysis.relevance ?? 0) * 100} class="mt-2" />
        </div>
      </div>
      <!-- Risk, Level -->
      <div class="mb-4">
        <div class="flex items-center">
          <span class="text-sm">Overall Risk Level</span>
          <span class="px-2 py-1 rounded text-xs font-medium border border-gray-300">
            {aiAnalysis.riskLevel.toUpperCase()}
          </span>
        </div>
      </div>
      <!-- Recommendations -->
      {#if aiAnalysis.recommendations && aiAnalysis.recommendations.length > 0}
        <div class="mb-4">
          <h5 class="font-medium">AI Recommendations</h5>
          <ul class="space-y-2">
            {#each Array.isArray(aiAnalysis.recommendations) ? aiAnalysis.recommendations : [] as recommendation}
              <li class="flex items-start">
                <CheckCircle class="w-4 h-4 text-green-600 mt-0.5" />
                <span class="text-sm">{recommendation}</span>
              </li>
            {/each}
          </ul>
        {/if}
      <!-- Flagged, Anomalies -->
      {#if aiAnalysis.flaggedAnomalies && aiAnalysis.flaggedAnomalies.length > 0}
        <div>
          <h5 class="font-medium mb-2">Flagged Anomalies</h5>
          <ul class="space-y-2">
            {#each Array.isArray(aiAnalysis.flaggedAnomalies) ? aiAnalysis.flaggedAnomalies : [] as anomaly}
              <li class="flex items-start">
                <AlertTriangle class="w-4 h-4 text-orange-600 mt-0.5" />
                <span class="text-sm">{anomaly}</span>
              </li>
            {/each}
          </ul>
        {/if}
    {/if}
</div>
<style>
  .integrity-verification {
    animation: fadeIn 0.5s ease-out}
  @keyframes fadeIn {
    from {
      opacity: 0
     ;transform: translateY(10px)}
    to {
      opacity: 1
     ;transform: translateY(0)}
  }
</style>




