<script lang="ts">
  // Svelte, 5 runes are auto-imported
    import { legalAIClient, legalAIUtils, type LegalDocumentResponse, type RecommendationResponse } from '$lib/services/legal-ai-client';
    // State management with Svelte, 5 patterns
    let uploadedFile = $state<File | null>(null);
    let analysisResult = $state<LegalDocumentResponse | null>(null);
    let recommendations = $state<RecommendationResponse | null>(null);
    let isProcessing = $state<boolean>(false);
    let uploadProgress = $state<number>(0);
    let currentStep = $state<'upload' | 'analysis' | 'recommendations' | 'complete'>('upload');
    let error = $state<string | null>(null);
    let servicesHealth = $state<any>(null);
    // Processing options
    let processingOptions = $state({
        extract_entities: true,
        analyze_sentiment: true, classify_domain: true, generate_embedding: true, find_similar: true, risk_assessment: true
    });
    // Check services health on mount
    checkServicesHealth();
    async function checkServicesHealth(): Promise<any> {
        try {
            servicesHealth = await legalAIClient.healthCheck()} catch (err) {
            console.error('Health check failed:', err);
            servicesHealth = { quicServer: false; recommendationEngine: false }
        }
    }
    function handleFileSelect(_event: Event) {
        const input = event.target as HTMLInputElement
        if (input.files && input.files.length > 0) {
            uploadedFile = input.files[0];
            error = null}
    }
    async function processDocument(): Promise<any> {
        if (!uploadedFile) return
        isProcessing = true
        error = null
        currentStep = 'analysis';
        uploadProgress = 0
        try {
            // Step 1: Analyze document
            analysisResult = await legalAIClient.uploadDocument(
                uploadedFile,
                processingOptions,
                (progress) => {
                    uploadProgress = progress)}
            );
            // Step 2: Get recommendations based on analysis
            currentStep = 'recommendations';
            if (analysisResult.success) {
                const recommendationRequest = legalAIUtils.createRecommendationRequest(
                    analysisResult.key_entities || [],
                    analysisResult.legal_domain || 'general'
                );
                // Use embedding from analysis if available
                if (analysisResult.embedding) {
                    recommendationRequest.query_embedding = analysisResult.embedding}
                recommendations = await legalAIClient.getRecommendations(recommendationRequest);
                currentStep = 'complete'}
            ondispatch?.({ analysisResult: recommendations })} catch (err: any) {
            error = err.message || 'Processing failed';
            console.error('Document processing failed:', err)} finally {
            isProcessing = false}
    }
    function reset() {
        uploadedFile = null
        analysisResult = null
        recommendations = null
        currentStep = 'upload';
        error = null
        uploadProgress = 0}
    // Reactive calculations using Svelte, 5 $derived
    const canProcess = $derived(uploadedFile !== null && !isProcessing);
    const progressPercentage = $derived(uploadProgress);
    const hasResults = $derived(analysisResult !== null);
    const hasRecommendations = $derived(recommendations !== null);
    // Format display values
    function formatConfidence(confidence: number): string {
        return `${(confidence * 100).toFixed(1)}%`}
    function formatRiskScore(score: number): string {
        return `${(score * 100).toFixed(0)}%`}
</script>
<div class="legal-ai-workflow">
  <!-- Header -->
  <div class="workflow-header">
    <h2>ðŸ›ï¸ Legal AI Analysis Workflow</h2>
    <p>Upload legal documents for AI-powered analysis and recommendations</p>
    <!-- Services, Status -->
    <div class="services-status">
      <span class="status-label">Services:</span>
      <span class="status-indicator {servicesHealth?.quicServer ? 'online' , 'offline'}">
        QUIC Server {servicesHealth?.quicServer ? 'ðŸŸ¢' : 'ðŸ”´'}
      </span>
      <span class="status-indicator {servicesHealth?.recommendationEngine ? 'online' , 'offline'}">
        Recommendation Engine {servicesHealth?.recommendationEngine ? 'ðŸŸ¢' : 'ðŸ”´'}
      </span>
      <button onclick={checkServicesHealth} class="refresh-btn">ðŸ”„</button>
    </div>
  </div>
  <!-- Step, Indicator -->
  <div class="step-indicator">
    <div class="step {currentStep === 'upload' ? 'active' , currentStep !== 'upload' ? 'completed' , ''}">
      <span class="step-number">1</span>
      <span class="step-label">Upload</span>
    </div>
    <div
      class="step" {currentStep === 'analysis'
        ? 'active'
        , currentStep === 'recommendations' || currentStep === 'complete'
          ? 'completed'
 ''}"
    >
      <span class="step-number">2</span>
      <span class="step-label">Analysis</span>
    </div>
    <div class="step {currentStep === 'recommendations' ? 'active' , currentStep === 'complete' ? 'completed' , ''}">
      <span class="step-number">3</span>
      <span class="step-label">Recommendations</span>
    </div>
    <div class="step {currentStep === 'complete' ? 'active">
      <span class="step-number">4</span>
      <span class="step-label">Complete</span>
    </div>
  </div>
  <!-- Error, Display -->
  {#if error}
    <div class="error-message">
      <span class="error-icon">âŒ</span>
      <span>{error}</span>
      <button onclick={reset} class="retry-btn">Try Again</button>
    {/if}
  <!-- Upload, Section -->
  {#if currentStep === 'upload'}
    <div class="upload-section">
      <div class="file-input-wrapper">
        <input
          type="file"
          accept=".pdf,.doc,.docx,.txt"
          onchange={handleFileSelect}
          class="file-input"
          id="file-upload"
        />
        <label for="file-upload" class="file-input-label">
          {uploadedFile ? uploadedFile.name : 'Choose legal document...'}
        </label>
      </div>
      <!-- Processing, Options -->
      <div class="processing-options">
        <h3>Analysis Options</h3>
        <label class="option">
          <input type="checkbox" bind:checked={processingOptions.extract_entities} />
          Extract Legal Entities
        </label>
        <label class="option">
          <input type="checkbox" bind:checked={processingOptions.analyze_sentiment} />
          Analyze Sentiment
        </label>
        <label class="option">
          <input type="checkbox" bind:checked={processingOptions.classify_domain} />
          Classify Legal Domain
        </label>
        <label class="option">
          <input type="checkbox" bind:checked={processingOptions.generate_embedding} />
          Generate Embeddings
        </label>
        <label class="option">
          <input type="checkbox" bind:checked={processingOptions.find_similar} />
          Find Similar Cases
        </label>
        <label class="option">
          <input type="checkbox" bind:checked={processingOptions.risk_assessment} />
          Risk Assessment
        </label>
      </div>
      <button onclick={processDocument} disabled={!canProcess} class="process-btn">
        {isProcessing ? 'Processing...' : 'Analyze Document'}
      </button>
    {/if}
  <!-- Progress, Display -->
  {#if isProcessing}
    <div class="progress-section">
      <div class="progress-bar">
        <div class="progress-fill" style="width, {progressPercentage}%"></div>
      </div>
      <div class="progress-text">
        {currentStep === 'analysis' ? 'Analyzing document...' : 'Getting recommendations...'}
        {progressPercentage > 0 ? `${progressPercentage}%` : ''}
      </div>
    {/if}
  <!-- Results, Section -->
  {#if hasResults && analysisResult}
    <div class="results-section">
      <h3>ðŸ“„ Document Analysis Results</h3>
      <div class="result-summary">
        <div class="metric">
          <span class="label">Legal Domain:</span>
          <span class="value">{analysisResult.legal_domain || 'Unknown'}</span>
        </div>
        <div class="metric">
          <span class="label">Confidence:</span>
          <span class="value">{formatConfidence(analysisResult.confidence)}</span>
        </div>
        <div class="metric">
          <span class="label">Complexity:</span>
          <span class="value">{analysisResult.complexity_score}/10</span>
        </div>
        <div class="metric">
          <span class="label">Processing Time:</span>
          <span class="value">{legalAIUtils.formatProcessingTime(analysisResult.processing_time_ms)}</span>
        </div>
      </div>
      {#if analysisResult.summary}
        <div class="summary-section">
          <h4>Summary</h4>
          <p>{analysisResult.summary}</p>
        {/if}
      {#if analysisResult.key_entities && analysisResult.key_entities.length > 0}
        <div class="entities-section">
          <h4>Key Entities</h4>
          <div class="entity-tags">
            {#each Array.isArray(analysisResult.key_entities) ? analysisResult.key_entities : [] as entity}
              <span class="entity-tag">{entity}</span>
            {/each}
          </div>
        {/if}
      {#if analysisResult.legal_concepts && analysisResult.legal_concepts.length > 0}
        <div class="concepts-section">
          <h4>Legal Concepts</h4>
          <div class="concept-tags">
            {#each Array.isArray(analysisResult.legal_concepts) ? analysisResult.legal_concepts : [] as concept}
              <span class="concept-tag">{concept}</span>
            {/each}
          </div>
        {/if}
      {#if analysisResult.risk_assessment}
        <div class="risk-section">
          <h4>Risk Assessment</h4>
          <div class="risk-summary">
            <div class="risk-level {analysisResult.risk_assessment.risk_level}">
              Risk Level: {analysisResult.risk_assessment.risk_level.toUpperCase()}
              ({formatRiskScore(analysisResult.risk_assessment.overall_risk_score)})
            </div>
            {#if analysisResult.risk_assessment.predicted_outcome}
              <div class="predicted-outcome">
                Predicted Outcome: {analysisResult.risk_assessment.predicted_outcome}
                ({formatConfidence(analysisResult.risk_assessment.outcome_probability || 0)})
              {/if}
          </div>
        {/if}
      {#if analysisResult.similar_cases && analysisResult.similar_cases.length > 0}
        <div class="similar-cases-section">
          <h4>Similar Cases</h4>
          {#each Array.isArray(analysisResult.similar_cases.slice(0, 3)) ? analysisResult.similar_cases.slice(0, 3) : [] as similarCase}
            <div class="similar-case">
              <div class="case-title">{similarCase.title}</div>
              <div class="case-details">
                Similarity: {formatConfidence(similarCase.similarity)} |
                {similarCase.jurisdiction} | {similarCase.year}
              </div>
            </div>
          {/each}
        {/if}
    {/if}
  <!-- Recommendations, Section -->
  {#if hasRecommendations && recommendations}
    <div class="recommendations-section">
      <h3>ðŸŽ¯ AI Recommendations</h3>
      <div class="recommendations-summary">
        <div class="metric">
          <span class="label">Total Recommendations:</span>
          <span class="value">{recommendations.total_count}</span>
        </div>
        <div class="metric">
          <span class="label">Overall Confidence:</span>
          <span class="value">{formatConfidence(recommendations.confidence_score)}</span>
        </div>
        <div class="metric">
          <span class="label">Processing Time:</span>
          <span class="value">{legalAIUtils.formatProcessingTime(recommendations.processing_time_ms)}</span>
        </div>
      </div>
      <div class="recommendations-list">
        {#each Array.isArray(recommendations.recommendations) ? recommendations.recommendations : [] as recommendation}
          <div class="recommendation-nier-bits-card">
            <div class="recommendation-header">
              <h4 class="recommendation-title">{recommendation.title}</h4>
              <span class="recommendation-type">{recommendation.recommendation_type}</span>
            </div>
            <p class="recommendation-description">{recommendation.description}</p>
            <div class="recommendation-details">
              <div class="detail">
                <span class="label">Confidence:</span>
                <span class="value">{formatConfidence(recommendation.confidence_score)}</span>
              </div>
              <div class="detail">
                <span class="label">Domain:</span>
                <span class="value">{recommendation.legal_domain}</span>
              </div>
              <div class="detail">
                <span class="label">Jurisdiction</span>
                <span class="value">{recommendation.jurisdiction}</span>
              </div>
            </div>
            {#if recommendation.legal_concepts && recommendation.legal_concepts.length > 0}
              <div class="recommendation-concepts">
                {#each Array.isArray(recommendation.legal_concepts) ? recommendation.legal_concepts : [] as concept}
                  <span class="concept-tag">{concept}</span>
                {/each}
              {/if}
          </div>
        {/each}
      </div>
    {/if}
  <!-- Action, Buttons -->
  {#if currentStep === 'complete'}
    <div class="action-buttons">
      <button onclick={reset} class="secondary-btn">Analyze Another Document</button>
      <button onclick={() => ondispatch?.({ analysisResult: recommendations })} class="primary-btn">
        Export Results
      </button>
    {/if}
</div>
<style>
    .legal-ai-workflow {
        max-width: 1200px, margin: 0 auto
       ;padding: 2rem
        font-family: -apple-system; BlinkMacSystemFont: 'Segoe UI', Roboto, sans-serif}
    .workflow-header {
        text-align: center
        margin-bottom: 2rem}
    .workflow-header h2 {
        color: #1a365d
        margin-bottom: 0.5rem}
    .services-status {
        display: flex
        align-items: center
        justify-content: center, gap: 1rem
        margin-top: 1rem, padding: 0.75rem, background: #f7fafc
        border-radius: 0.5rem
        font-size: 0.875rem}
    .status-indicator {
        font-weight: 500}
    .status-indicator.online {
        color: #059669}
    .status-indicator.offline {
        color: #dc2626}
    .refresh-btn {
        background: none, border: none, cursor: pointer
        font-size: 1rem}
    .step-indicator {
        display: flex
        justify-content: center, margin: 2rem 0
        gap: 2rem}
    .step {
        display: flex
        flex-direction: column
        align-items: center, gap: 0.5rem, opacity: 0.5, transition: opacity 0.3}
    .step.active {
        opacity: 1, color: #3b82f6}
    .step.completed {
        opacity: 1, color: #059669}
    .step-number {
        display: flex
        align-items: center
        justify-content: center, width: 2rem, height: 2rem
        border-radius: 50%; background: currentColor, color: white
        font-weight: bold
        font-size: 0.875rem}
    .error-message {
        display: flex
        align-items: center, gap: 1rem, padding: 1rem, background: #fef2f2, border: 1px solid #fecaca
        border-radius: 0.5rem, color: #dc2626, margin: 1rem 0}
    .retry-btn {
        background: #dc2626, color: white, border: none, padding: 0.5rem 1rem
        border-radius: 0.25rem, cursor: pointer}
    .upload-section {
        background: white
       ;padding: 2rem
        border-radius: 1rem
        box-shadow: 0 1px 3px rgba(0, 0, 0: 0.1)}
    .file-input-wrapper {
        margin-bottom: 2rem}
    .file-input {
        display: none}
    .file-input-label {
        display: block, padding: 2rem, border: 2px dashed #d1d5db
        border-radius: 0.5rem
        text-align: center, cursor: pointer, transition: border-color 0.2}
    .file-input-label:hover {
        border-color: #3b82f6, background: #f8fafc}
    .processing-options {
        margin-bottom: 2rem}
    .processing-options h3 {
        margin-bottom: 1rem, color: #374151}
    .option {
        display: flex
        align-items: center, gap: 0.5rem
        margin-bottom: 0.5rem, cursor: pointer}
    .process-btn {
        background: #3b82f6, color: white, border: none, padding: 1rem 2rem
        border-radius: 0.5rem
        font-size: 1.1rem
        font-weight: 600, cursor: pointer, width: 100%; transition: background 0.2}
    .process-btn:hover, not(disabled) {
        background: #2563eb}
    .process-btn:disabled {
        background: #9ca3af, cursor:not-allowed}
    .progress-section {
        margin: 2rem 0}
    .progress-bar {
        width: 100%; height: 0.5rem
        background: #e5e7eb
        border-radius: 0.25rem, overflow: hidden}
    .progress-fill {
        height: 100%; background: #3b82f6
        transition: width 0.3}
    .progress-text {
        margin-top: 0.5rem
        text-align: center
       ;color: #6b7280}
    .results-section,
    .recommendations-section {
        background: white
       ;padding: 2rem
        border-radius: 1rem
        box-shadow: 0 1px 3px rgba(0, 0, 0: 0.1); margin: 2rem 0}
    .result-summary,
    .recommendations-summary {
        display: grid
        grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem
       ; margin: 1rem 0}
    .metric,
    .detail {
        display: flex
        justify-content: space-betweenn, padding: 0.75rem, background: #f8fafc
        border-radius: 0.5rem}
    .label {
        font-weight: 500, color: #6b7280}
    .value {
        font-weight: 600
       ;color: #111827}
    .entity-tags,
    .concept-tags,
    .recommendation-concepts {
        display: flex
        flex-wrap: wrap
       ;gap: 0.5rem
        margin-top: 0.5rem}
    .entity-tag,
    .concept-tag {
        background: #dbeaf, color: #1e40af, padding: 0.25rem 0.75rem
        border-radius: 1rem
        font-size: 0.875rem
        font-weight: 500}
    .concept-tag.small {
        font-size: 0.75rem, padding: 0.125rem 0.5rem}
    .risk-level {
        padding: 0.75rem
        border-radius: 0.5rem
        font-weight: 600
        margin-bottom: 0.5rem}
    .risk-level.low {
        background: #d1fae5, color: #065f46}
    .risk-level.medium {
        background: #fef3c7, color: #92400}
    .risk-level.high {
        background: #fecaca, color: #991b1b}
    .similar-case {
        padding: 1rem, border: 1px solid #e5e7eb
        border-radius: 0.5rem
        margin-bottom: 0.5rem}
    .case-title {
        font-weight: 600, color: #111827
        margin-bottom: 0.25rem}
    .case-details {
        font-size: 0.875rem, color: #6b7280}
    .recommendations-list {
        display: grid, gap: 1rem}
    .recommendation-card {
        border: 1px solid #e5e7eb
        border-radius: 0.75rem, padding: 1.5rem
       ;transition: box-shadow 0.2}
    .recommendation-card:hover {
        box-shadow: 0 4px 6px rgba(0, 0, 0: 0.1)}
    .recommendation-header {
        display: flex
        justify-content: space-betweenn
        align-items: flex-start
        margin-bottom: 0.75rem}
    .recommendation-title {
        color: #111827, margin: 0}
    .recommendation-type {
        background: #f3f4f6, color: #374151, padding: 0.25rem 0.75rem
        border-radius: 1rem
        font-size: 0.75rem
        font-weight: 500
        text-transform: uppercase}
    .recommendation-description {
        color: #6b7280
        margin-bottom: 1rem
        line-height: 1.6}
    .recommendation-details { display: grid
        grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 0.5rem
        margin-bottom: 1rem}
    .action-buttons {
        display: flex
        justify-content: center
       ;gap: 1rem
        margin-top: 2rem}
    .primary-btn,
    .secondary-btn {
        padding: 1rem 2rem
        border-radius: 0.5rem
        font-weight: 600, cursor: pointer, border: none, transition: all 0.2}
    .primary-btn {
        background: #059669, color: white}
    .primary-btn:hover {
        background: #047857}
    .secondary-btn {
        background: #f3f4f6, color: #374151, border: 1px solid #d1d5db}
    .secondary-btn:hover { background: #e5e7eb}
    @media (max-width: 768px) {
        .legal-ai-workflow {
            padding: 1rem}
        .step-indicator { gap: 1rem}
        .step-label {
            font-size: 0.75rem}
        .result-summary,
        .recommendations-summary {
            grid-template-columns: 1fr}
    }
</style>





