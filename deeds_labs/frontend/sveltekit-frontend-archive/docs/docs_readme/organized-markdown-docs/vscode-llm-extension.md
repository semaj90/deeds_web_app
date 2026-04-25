# 🤖 VS Code LLM Extensions for Legal AI Development

## 📋 Overview

This guide covers the integration and optimization of Large Language Model (LLM) extensions in VS Code for legal AI development, including GitHub Copilot, Claude, custom LLM extensions, and best practices for legal document processing workflows.

## 🧩 Core LLM Extensions

### 1. GitHub Copilot

**Primary AI coding assistant with legal AI optimizations**

#### Installation & Setup:

```bash
# VS Code Extension ID
code --install-extension GitHub.copilot
code --install-extension GitHub.copilot-chat
```

#### Configuration for Legal AI:

```json
// .vscode/settings.json
{
  "github.copilot.enable": {
    "*": true,
    "yaml": false,
    "plaintext": true,
    "markdown": true
  },
  "github.copilot.advanced": {
    "secret_key": "prompt-engineering-legal-ai",
    "length": 8000,
    "temperature": 0.2,
    "top_p": 0.95
  },
  "github.copilot.editor.enableAutoCompletions": true,
  "github.copilot.chat.localeOverride": "en"
}
```

#### Legal AI Specific Features:

- **Document Classification**: Automatic regex generation for legal document types
- **Entity Extraction**: Prompt-driven patterns for case numbers, citations, monetary amounts
- **Contract Analysis**: Template generation for legal clause detection
- **Performance Optimization**: ReDoS prevention and high-throughput processing

### 2. Claude Dev Extension

**Advanced AI assistant for complex legal reasoning**

#### Installation:

```bash
# Install from VS Code Marketplace
code --install-extension claude-dev.claude-dev
```

#### Configuration:

```json
// .vscode/settings.json
{
  "claude.apiKey": "${ANTHROPIC_API_KEY}",
  "claude.model": "claude-3-5-sonnet-20241022",
  "claude.maxTokens": 8192,
  "claude.temperature": 0.1,
  "claude.contextWindow": 200000,
  "claude.legalMode": true,
  "claude.enableCodeGeneration": true,
  "claude.enableDocumentAnalysis": true
}
```

#### Legal AI Capabilities:

- **Legal Document Analysis**: 200K context window for large documents
- **Case Law Research**: Intelligent citation analysis and precedent finding
- **Contract Review**: Clause-by-clause analysis with risk assessment
- **Regulatory Compliance**: Multi-jurisdiction legal requirement analysis

### 3. Custom Local LLM Extensions

#### Ollama Integration:

```json
// .vscode/settings.json
{
  "ollama.baseUrl": "http://localhost:11434",
  "ollama.models": [
    "gemma3-legal:latest",
  ],
  "ollama.defaultModel": "gemma3-legal:latest",
  "ollama.enableGPU": true,
  "ollama.maxTokens": 32768
}
```

#### Custom Legal AI Extension:

```typescript
// extension.ts - Custom Legal AI Extension
import * as vscode from "vscode";
import { OllamaLegalClient } from "./ollama-client";
import { LegalDocumentProcessor } from "./legal-processor";

export function activate(context: vscode.ExtensionContext) {
  const ollamaClient = new OllamaLegalClient();
  const docProcessor = new LegalDocumentProcessor();

  // Register legal document analysis command
  const analyzeLegalDoc = vscode.commands.registerCommand(
    "legalAI.analyzeDocument",
    async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) return;

      const document = editor.document;
      const text = document.getText();

      // Process with local Ollama model
      const analysis = await ollamaClient.analyzeDocument(text, {
        model: "gemma3-legal",
        extractEntities: true,
        classifyDocument: true,
        findCitations: true,
        assessRisk: true,
      });

      // Display results in webview
      const panel = vscode.window.createWebviewPanel(
        "legalAnalysis",
        "Legal Document Analysis",
        vscode.ViewColumn.Beside,
        { enableScripts: true }
      );

      panel.webview.html = generateAnalysisHTML(analysis);
    }
  );

  context.subscriptions.push(analyzeLegalDoc);
}
```

## 🔧 Extension Integration Patterns

### 1. Multi-Agent Orchestration

```typescript
// multi-agent-extension.ts
class MultiAgentLegalOrchestrator {
  private agents = {
    copilot: new GitHubCopilotAgent(),
    claude: new ClaudeDevAgent(),
    ollama: new OllamaLegalAgent(),
    custom: new CustomLegalAgent(),
  };

  async orchestrateLegalAnalysis(
    document: string,
    analysisType: "contract" | "litigation" | "compliance" | "research"
  ): Promise<MultiAgentResult> {
    const tasks = this.getTasksForAnalysisType(analysisType);
    const results: AgentResult[] = [];

    // Run agents in parallel for different aspects
    const promises = tasks.map(async (task) => {
      const agent = this.selectBestAgent(task);
      return agent.process(document, task);
    });

    const agentResults = await Promise.all(promises);

    // Synthesize results using Claude for complex reasoning
    const synthesis = await this.agents.claude.synthesize(agentResults, {
      context: "legal-analysis",
      confidenceThreshold: 0.8,
      includeRecommendations: true,
    });

    return {
      individualResults: agentResults,
      synthesis,
      confidence: this.calculateOverallConfidence(agentResults),
      recommendations: synthesis.recommendations,
    };
  }

  private selectBestAgent(task: AnalysisTask): LegalAgent {
    switch (task.type) {
      case "code-generation":
      case "regex-patterns":
        return this.agents.copilot;

      case "complex-reasoning":
      case "legal-interpretation":
        return this.agents.claude;

      case "entity-extraction":
      case "classification":
        return this.agents.ollama;

      case "specialized-legal":
        return this.agents.custom;

      default:
        return this.agents.claude; // Default to Claude for complex tasks
    }
  }
}
```

### 2. Context-Aware Prompt Engineering

```typescript
// prompt-engineering.ts
class LegalPromptEngineer {
  private contextAnalyzer = new LegalContextAnalyzer();
  private promptTemplates = new LegalPromptTemplates();

  async generateOptimalPrompt(
    userIntent: string,
    documentContext: DocumentContext,
    targetAgent: "copilot" | "claude" | "ollama"
  ): Promise<OptimizedPrompt> {
    // Analyze legal context
    const context = await this.contextAnalyzer.analyze(documentContext);

    // Select appropriate template
    const template = this.promptTemplates.getTemplate(
      context.documentType,
      context.jurisdiction,
      context.practiceArea
    );

    // Optimize for target agent
    const optimizedPrompt = await this.optimizeForAgent(
      template,
      userIntent,
      targetAgent,
      context
    );

    return {
      prompt: optimizedPrompt,
      estimatedTokens: this.estimateTokens(optimizedPrompt),
      confidence: context.confidence,
      fallbackPrompts: this.generateFallbacks(optimizedPrompt, targetAgent),
    };
  }

  private async optimizeForAgent(
    template: PromptTemplate,
    intent: string,
    agent: string,
    context: LegalContext
  ): Promise<string> {
    switch (agent) {
      case "copilot":
        return this.optimizeForCopilot(template, intent, context);
      case "claude":
        return this.optimizeForClaude(template, intent, context);
      case "ollama":
        return this.optimizeForOllama(template, intent, context);
    }
  }
}
```

## 📊 Performance Monitoring & Analytics

### 1. Token Usage Tracking

```typescript
// token-analytics.ts
class LLMTokenAnalytics {
  private usageStore = new TokenUsageStore();
  private costCalculator = new LLMCostCalculator();

  async trackUsage(
    extension: string,
    model: string,
    promptTokens: number,
    responseTokens: number,
    context: LegalAnalysisContext
  ): Promise<void> {
    const usage: TokenUsage = {
      timestamp: Date.now(),
      extension,
      model,
      promptTokens,
      responseTokens,
      totalTokens: promptTokens + responseTokens,
      cost: this.costCalculator.calculate(model, promptTokens, responseTokens),
      context: {
        documentType: context.documentType,
        practiceArea: context.practiceArea,
        jurisdiction: context.jurisdiction,
        complexity: context.complexity,
      },
    };

    await this.usageStore.record(usage);

    // Emit event for real-time monitoring
    vscode.commands.executeCommand("legalAI.tokenUsage.updated", usage);
  }

  async generateReport(
    timeframe: "day" | "week" | "month"
  ): Promise<UsageReport> {
    const usageData = await this.usageStore.getUsage(timeframe);

    return {
      totalTokens: usageData.reduce((sum, u) => sum + u.totalTokens, 0),
      totalCost: usageData.reduce((sum, u) => sum + u.cost, 0),
      byExtension: this.groupBy(usageData, "extension"),
      byModel: this.groupBy(usageData, "model"),
      byDocumentType: this.groupBy(usageData, "context.documentType"),
      trends: this.analyzeTrends(usageData),
      recommendations: this.generateOptimizationRecommendations(usageData),
    };
  }
}
```

### 2. Performance Benchmarking

```typescript
// performance-benchmark.ts
class LLMPerformanceBenchmark {
  async benchmarkExtensions(
    testDocuments: LegalDocument[],
    tasks: BenchmarkTask[]
  ): Promise<BenchmarkResults> {
    const results: ExtensionBenchmark[] = [];

    for (const extension of ["copilot", "claude", "ollama"]) {
      const extensionResults = await this.benchmarkExtension(
        extension,
        testDocuments,
        tasks
      );
      results.push(extensionResults);
    }

    return {
      results,
      comparison: this.compareResults(results),
      recommendations: this.generatePerformanceRecommendations(results),
    };
  }

  private async benchmarkExtension(
    extension: string,
    documents: LegalDocument[],
    tasks: BenchmarkTask[]
  ): Promise<ExtensionBenchmark> {
    const taskResults: TaskResult[] = [];

    for (const task of tasks) {
      const startTime = performance.now();

      try {
        const result = await this.executeTask(extension, task, documents);
        const endTime = performance.now();

        taskResults.push({
          task: task.name,
          success: true,
          duration: endTime - startTime,
          accuracy: this.calculateAccuracy(result, task.expectedOutput),
          tokens: result.tokenUsage,
          cost: result.estimatedCost,
        });
      } catch (error) {
        taskResults.push({
          task: task.name,
          success: false,
          error: error.message,
          duration: 0,
          accuracy: 0,
          tokens: 0,
          cost: 0,
        });
      }
    }

    return {
      extension,
      taskResults,
      averageAccuracy: this.calculateAverageAccuracy(taskResults),
      averageDuration: this.calculateAverageDuration(taskResults),
      successRate: this.calculateSuccessRate(taskResults),
      totalCost: taskResults.reduce((sum, r) => sum + r.cost, 0),
    };
  }
}
```

## 🛡️ Security & Compliance

### 1. Data Privacy Controls

```typescript
// privacy-controls.ts
class LegalDataPrivacyManager {
  private sensitivePatterns = {
    ssn: /\b(?!000|666|9\d{2})\d{3}[-.\s]?(?!00)\d{2}[-.\s]?(?!0000)\d{4}\b/g,
    creditCard: /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g,
    attorney: /attorney[/-]client\s+privilege/gi,
    confidential: /\b(confidential|privileged|work\s+product)\b/gi,
  };

  async sanitizeForLLM(
    content: string,
    allowedDataTypes: DataType[],
    retentionPolicy: RetentionPolicy
  ): Promise<SanitizedContent> {
    let sanitized = content;
    const redactions: Redaction[] = [];

    // Detect and redact sensitive information
    for (const [type, pattern] of Object.entries(this.sensitivePatterns)) {
      if (!allowedDataTypes.includes(type as DataType)) {
        sanitized = sanitized.replace(pattern, (match, ...groups) => {
          const redactionId = crypto.randomUUID();
          redactions.push({
            id: redactionId,
            type: type as DataType,
            originalText: match,
            position: groups[groups.length - 2], // offset
          });
          return `[REDACTED-${type.toUpperCase()}-${redactionId.slice(0, 8)}]`;
        });
      }
    }

    return {
      sanitized,
      redactions,
      metadata: {
        originalLength: content.length,
        sanitizedLength: sanitized.length,
        redactionCount: redactions.length,
        allowedDataTypes,
        retentionPolicy,
        sanitizedAt: Date.now(),
      },
    };
  }

  async restoreRedactions(
    sanitizedContent: string,
    redactions: Redaction[],
    userPermission: PermissionLevel
  ): Promise<string> {
    let restored = sanitizedContent;

    for (const redaction of redactions) {
      if (this.hasPermissionForDataType(userPermission, redaction.type)) {
        const redactionPattern = `\\[REDACTED-${redaction.type.toUpperCase()}-${redaction.id.slice(0, 8)}\\]`;
        restored = restored.replace(
          new RegExp(redactionPattern, "g"),
          redaction.originalText
        );
      }
    }

    return restored;
  }
}
```

### 2. Audit Logging

```typescript
// audit-logging.ts
class LLMAuditLogger {
  private auditStore = new EncryptedAuditStore();

  async logLLMInteraction(
    interaction: LLMInteraction,
    userContext: UserContext,
    documentContext: DocumentContext
  ): Promise<void> {
    const auditEntry: AuditEntry = {
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      userId: userContext.userId,
      extension: interaction.extension,
      model: interaction.model,
      action: interaction.action,
      inputHash: this.hashContent(interaction.input),
      outputHash: this.hashContent(interaction.output),
      tokenUsage: interaction.tokenUsage,
      documentType: documentContext.type,
      jurisdiction: documentContext.jurisdiction,
      riskLevel: this.assessRiskLevel(interaction, documentContext),
      complianceFlags: this.checkCompliance(interaction, documentContext),
    };

    await this.auditStore.store(auditEntry);

    // Trigger compliance alerts if necessary
    if (
      auditEntry.riskLevel === "HIGH" ||
      auditEntry.complianceFlags.length > 0
    ) {
      await this.triggerComplianceAlert(auditEntry);
    }
  }

  async generateComplianceReport(
    timeframe: TimeFrame,
    jurisdiction: string
  ): Promise<ComplianceReport> {
    const auditEntries = await this.auditStore.getEntries(timeframe, {
      jurisdiction,
    });

    return {
      period: timeframe,
      jurisdiction,
      totalInteractions: auditEntries.length,
      riskDistribution: this.analyzeRiskDistribution(auditEntries),
      complianceIssues: this.identifyComplianceIssues(auditEntries),
      recommendations: this.generateComplianceRecommendations(auditEntries),
      trends: this.analyzeTrends(auditEntries),
    };
  }
}
```

## 🚀 Deployment & Configuration

### 1. Extension Marketplace Deployment

```json
// package.json for custom legal AI extension
{
  "name": "legal-ai-assistant",
  "displayName": "Legal AI Assistant",
  "description": "Advanced LLM integration for legal document processing",
  "version": "1.0.0",
  "engines": {
    "vscode": "^1.80.0"
  },
  "categories": ["Other", "Machine Learning", "Snippets"],
  "keywords": ["legal", "ai", "llm", "document-analysis", "copilot", "claude"],
  "activationEvents": [
    "onLanguage:plaintext",
    "onLanguage:markdown",
    "onCommand:legalAI.analyzeDocument"
  ],
  "main": "./out/extension.js",
  "contributes": {
    "commands": [
      {
        "command": "legalAI.analyzeDocument",
        "title": "Analyze Legal Document"
      },
      {
        "command": "legalAI.extractEntities",
        "title": "Extract Legal Entities"
      },
      {
        "command": "legalAI.classifyDocument",
        "title": "Classify Document Type"
      }
    ],
    "configuration": {
      "title": "Legal AI Assistant",
      "properties": {
        "legalAI.preferredModel": {
          "type": "string",
          "enum": ["copilot", "claude", "ollama"],
          "default": "claude",
          "description": "Preferred LLM for legal analysis"
        },
        "legalAI.jurisdiction": {
          "type": "string",
          "default": "US",
          "description": "Primary legal jurisdiction"
        },
        "legalAI.enablePrivacyMode": {
          "type": "boolean",
          "default": true,
          "description": "Enable automatic PII redaction"
        }
      }
    }
  }
}
```

### 2. Workspace Configuration

```json
// .vscode/settings.json - Complete legal AI setup
{
  "files.associations": {
    "*.legal": "plaintext",
    "*.contract": "plaintext",
    "*.motion": "plaintext"
  },

  // LLM Extension Configuration
  "github.copilot.enable": {
    "*": true,
    "legal": true,
    "contract": true
  },
  "claude.contextWindow": 200000,
  "claude.legalMode": true,
  "ollama.defaultModel": "gemma3-legal:latest",

  // Legal AI Assistant
  "legalAI.preferredModel": "claude",
  "legalAI.jurisdiction": "US",
  "legalAI.enablePrivacyMode": true,
  "legalAI.autoAnalyze": false,

  // Performance Settings
  "editor.suggest.snippetsPreventQuickSuggestions": false,
  "editor.quickSuggestions": {
    "other": true,
    "comments": true,
    "strings": true
  },

  // Privacy & Security
  "telemetry.enableTelemetry": false,
  "copilot.telemetry": false
}
```

## 📚 Integration Examples

### 1. Legal Document Analysis Workflow

```typescript
// legal-workflow.ts
export class LegalDocumentWorkflow {
  private agents: MultiAgentLegalOrchestrator;
  private privacy: LegalDataPrivacyManager;
  private analytics: LLMTokenAnalytics;

  async processLegalDocument(
    document: vscode.TextDocument,
    analysisType: AnalysisType
  ): Promise<LegalAnalysisResult> {
    // Step 1: Privacy assessment and sanitization
    const content = document.getText();
    const sanitized = await this.privacy.sanitizeForLLM(
      content,
      ["case-numbers", "citations", "entities"],
      { retentionDays: 30 }
    );

    // Step 2: Multi-agent analysis
    const startTime = Date.now();
    const analysis = await this.agents.orchestrateLegalAnalysis(
      sanitized.sanitized,
      analysisType
    );
    const endTime = Date.now();

    // Step 3: Restore sensitive information if permitted
    const restoredResults = await this.privacy.restoreRedactions(
      JSON.stringify(analysis),
      sanitized.redactions,
      "ANALYST"
    );

    // Step 4: Track usage and performance
    await this.analytics.trackUsage(
      "legal-ai-assistant",
      analysis.primaryModel,
      analysis.tokenUsage.prompt,
      analysis.tokenUsage.response,
      {
        documentType: analysisType,
        complexity: analysis.complexity,
        processingTime: endTime - startTime,
      }
    );

    return JSON.parse(restoredResults);
  }
}
```

### 2. Real-time Legal Entity Extraction

```typescript
// entity-extraction.ts
export class RealTimeLegalEntityExtractor {
  private copilotAgent: GitHubCopilotAgent;
  private entityCache = new Map<string, EntityExtractionResult>();

  async extractEntitiesAsYouType(
    document: vscode.TextDocument,
    position: vscode.Position
  ): Promise<EntityHighlight[]> {
    const text = document.getText();
    const cacheKey = this.generateCacheKey(text);

    // Check cache first
    if (this.entityCache.has(cacheKey)) {
      return this.entityCache.get(cacheKey)!.highlights;
    }

    // Use Copilot for regex generation and entity extraction
    const extractionPrompt = `
    // Extract legal entities from the following text
    // Generate optimized regex patterns for:
    // - Case numbers (format: YYYY-CV-NNNNN)
    // - Legal citations (format: Party v. Party, Volume Reporter Page (Year))
    // - Monetary amounts (format: $N,NNN.NN)
    // - Business entities (format: Company Name + Entity Type)

    Text to analyze:
    ${text.substring(0, 5000)} // Limit for performance
    `;

    const regexPatterns =
      await this.copilotAgent.generateRegexPatterns(extractionPrompt);

    // Apply patterns and generate highlights
    const highlights = this.applyPatternsToDocument(document, regexPatterns);

    // Cache results
    this.entityCache.set(cacheKey, {
      highlights,
      timestamp: Date.now(),
      patterns: regexPatterns,
    });

    return highlights;
  }
}
```

## 🎯 Best Practices & Recommendations

### 1. **Model Selection Strategy**

- **GitHub Copilot**: Code generation, regex patterns, quick suggestions
- **Claude**: Complex legal reasoning, document analysis, contract review
- **Local Ollama**: Privacy-sensitive tasks, custom legal models, offline processing

### 2. **Performance Optimization**

- Cache frequent queries and regex patterns
- Use streaming for long document analysis
- Implement intelligent chunking for large documents
- Monitor token usage and optimize prompts

### 3. **Privacy & Security**

- Always sanitize sensitive data before sending to cloud LLMs
- Use local models for highly confidential documents
- Implement comprehensive audit logging
- Regular compliance reviews and risk assessments

### 4. **User Experience**

- Provide clear feedback on processing status
- Implement graceful fallbacks between models
- Offer explanation for AI-generated suggestions
- Allow user customization of analysis depth

This comprehensive guide provides the foundation for building sophisticated LLM-powered legal AI tools in VS Code, with proper attention to privacy, security, and performance considerations.

## 🤖 Advanced Workflow Automation

### 1. Intelligent Document Processing Pipeline

```typescript
// automated-legal-workflow.ts
export class AutomatedLegalWorkflow {
  private orchestrator = new MasterLegalOrchestrator();
  private scheduler = new TaskScheduler();
  private notificationManager = new NotificationManager();

  async setupAutomatedProcessing(
    watchDirectory: string,
    processingRules: ProcessingRule[]
  ): Promise<void> {
    const watcher = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(watchDirectory, "**/*.{pdf,docx,txt}")
    );

    watcher.onDidCreate(async (uri) => {
      await this.processNewDocument(uri, processingRules);
    });

    watcher.onDidChange(async (uri) => {
      await this.reprocessDocument(uri, processingRules);
    });
  }

  private async processNewDocument(
    uri: vscode.Uri,
    rules: ProcessingRule[]
  ): Promise<void> {
    try {
      // Detect document type
      const documentType = await this.detectDocumentType(uri);

      // Find applicable rules
      const applicableRules = rules.filter((rule) =>
        rule.documentTypes.includes(documentType)
      );

      // Process with appropriate agents
      for (const rule of applicableRules) {
        const task = this.scheduler.scheduleTask({
          type: "document-analysis",
          uri,
          rule,
          priority: rule.priority,
          estimatedDuration: rule.estimatedDuration,
        });

        await this.orchestrator.processTask(task);
      }

      // Send completion notification
      await this.notificationManager.sendNotification({
        type: "success",
        message: `Document ${uri.fsPath} processed successfully`,
        actions: ["View Results", "Open Dashboard"],
      });
    } catch (error) {
      await this.notificationManager.sendNotification({
        type: "error",
        message: `Failed to process ${uri.fsPath}: ${error.message}`,
        actions: ["Retry", "View Logs"],
      });
    }
  }
}
```

### 2. Smart Code Generation Templates

```typescript
// smart-template-generator.ts
export class SmartTemplateGenerator {
  private copilotAgent = new EnhancedCopilotAgent();
  private templateLibrary = new LegalTemplateLibrary();

  async generateLegalComponent(
    componentType: "contract-parser" | "entity-extractor" | "risk-analyzer",
    requirements: ComponentRequirements
  ): Promise<GeneratedComponent> {
    const baseTemplate = await this.templateLibrary.getTemplate(componentType);

    const enhancedPrompt = `
    // Generate a high-performance ${componentType} component
    // Requirements: ${JSON.stringify(requirements, null, 2)}
    // Base template: ${baseTemplate}
    //
    // The component should:
    // 1. Use TypeScript with strict typing
    // 2. Implement proper error handling
    // 3. Include comprehensive JSDoc comments
    // 4. Support async/await patterns
    // 5. Include unit tests
    // 6. Optimize for performance with SIMD operations where applicable
    // 7. Include proper logging and monitoring
    // 8. Follow legal AI best practices
    `;

    const generatedCode = await this.copilotAgent.generateCode(enhancedPrompt);

    return {
      component: generatedCode.component,
      tests: generatedCode.tests,
      documentation: generatedCode.documentation,
      performanceMetrics: generatedCode.metrics,
      securityAudit: await this.auditGeneratedCode(generatedCode),
    };
  }
}
```

## 🔄 Context-Aware Agent Switching

### Dynamic Model Selection

```typescript
// dynamic-model-selector.ts
export class DynamicModelSelector {
  private performanceHistory = new ModelPerformanceHistory();
  private costAnalyzer = new LLMCostAnalyzer();
  private availabilityChecker = new ModelAvailabilityChecker();

  async selectOptimalModel(
    task: LegalTask,
    constraints: SelectionConstraints
  ): Promise<ModelSelection> {
    // Analyze task requirements
    const taskAnalysis = await this.analyzeTaskRequirements(task);

    // Get available models
    const availableModels = await this.availabilityChecker.getAvailableModels();

    // Score each model
    const modelScores = await Promise.all(
      availableModels.map(async (model) => {
        const performance = await this.performanceHistory.getPerformance(
          model,
          taskAnalysis.category
        );

        const cost = await this.costAnalyzer.estimateCost(
          model,
          taskAnalysis.estimatedTokens
        );

        const capabilities = await this.evaluateCapabilities(
          model,
          taskAnalysis
        );

        return {
          model,
          score: this.calculateScore(
            performance,
            cost,
            capabilities,
            constraints
          ),
          reasoning: this.generateSelectionReasoning(
            performance,
            cost,
            capabilities
          ),
        };
      })
    );

    // Select best model
    const bestModel = modelScores.reduce((best, current) =>
      current.score > best.score ? current : best
    );

    return {
      selectedModel: bestModel.model,
      confidence: bestModel.score,
      reasoning: bestModel.reasoning,
      alternatives: modelScores
        .filter((m) => m.model !== bestModel.model)
        .sort((a, b) => b.score - a.score)
        .slice(0, 2),
    };
  }

  private calculateScore(
    performance: ModelPerformance,
    cost: CostEstimate,
    capabilities: ModelCapabilities,
    constraints: SelectionConstraints
  ): number {
    let score = 0;

    // Performance weight (40%)
    score += performance.accuracy * 0.4;

    // Cost efficiency weight (25%)
    const costEfficiency = Math.max(
      0,
      1 - cost.estimatedCost / constraints.maxCost
    );
    score += costEfficiency * 0.25;

    // Capability match weight (25%)
    const capabilityMatch = this.calculateCapabilityMatch(
      capabilities,
      constraints.requiredCapabilities
    );
    score += capabilityMatch * 0.25;

    // Speed weight (10%)
    const speedScore = Math.max(
      0,
      1 - performance.averageResponseTime / constraints.maxResponseTime
    );
    score += speedScore * 0.1;

    return score;
  }
}
```

## 🛡️ Enterprise Security Features

### Advanced Audit & Compliance

```typescript
// enterprise-security.ts
export class EnterpriseSecurityManager {
  private auditLogger = new ComprehensiveAuditLogger();
  private complianceChecker = new MultiJurisdictionComplianceChecker();
  private encryptionManager = new QuantumSafeEncryption();
  private accessController = new RoleBasedAccessController();

  async processWithEnterpriseCompliance(
    request: LegalProcessingRequest,
    userContext: UserContext
  ): Promise<ComplianceVerifiedResult> {
    // Step 1: User Authorization Check
    const authResult = await this.accessController.authorizeUser(
      userContext,
      request.requiredPermissions
    );

    if (!authResult.authorized) {
      throw new UnauthorizedError(authResult.reason);
    }

    // Step 2: Pre-processing Compliance Check
    const complianceResult = await this.complianceChecker.validateRequest(
      request,
      userContext.jurisdiction
    );

    if (!complianceResult.compliant) {
      await this.auditLogger.logComplianceViolation({
        userId: userContext.userId,
        request,
        violations: complianceResult.violations,
        timestamp: Date.now(),
      });

      throw new ComplianceError(complianceResult.violations);
    }

    // Step 3: Encrypt Sensitive Data
    const encryptedRequest = await this.encryptionManager.encryptRequest(
      request,
      userContext.encryptionLevel
    );

    // Step 4: Process with Audit Trail
    const processingId = crypto.randomUUID();

    await this.auditLogger.logProcessingStart({
      processingId,
      userId: userContext.userId,
      requestType: request.type,
      dataClassification: request.dataClassification,
      timestamp: Date.now(),
    });

    try {
      const result = await this.processSecurely(encryptedRequest, userContext);

      await this.auditLogger.logProcessingComplete({
        processingId,
        success: true,
        resultHash: this.hashResult(result),
        tokenUsage: result.tokenUsage,
        timestamp: Date.now(),
      });

      return result;
    } catch (error) {
      await this.auditLogger.logProcessingError({
        processingId,
        error: error.message,
        timestamp: Date.now(),
      });

      throw error;
    }
  }

  async generateComplianceReport(
    timeRange: TimeRange,
    reportType: "SOX" | "GDPR" | "HIPAA" | "CCPA"
  ): Promise<ComplianceReport> {
    const auditEntries = await this.auditLogger.getAuditEntries(timeRange);

    switch (reportType) {
      case "SOX":
        return this.generateSOXReport(auditEntries);
      case "GDPR":
        return this.generateGDPRReport(auditEntries);
      case "HIPAA":
        return this.generateHIPAAReport(auditEntries);
      case "CCPA":
        return this.generateCCPAReport(auditEntries);
      default:
        throw new Error(`Unsupported report type: ${reportType}`);
    }
  }
}
```

## 🚀 Custom Extension Development

### Legal AI Extension Scaffold

```typescript
// Create a complete VS Code extension for legal AI
// package.json
{
  "name": "advanced-legal-ai",
  "displayName": "Advanced Legal AI Assistant",
  "description": "Enterprise-grade legal AI integration with multi-model support",
  "version": "2.0.0",
  "engines": {
    "vscode": "^1.80.0"
  },
  "categories": ["AI", "Machine Learning", "Other"],
  "keywords": ["legal", "ai", "copilot", "claude", "ollama", "document-analysis"],
  "main": "./out/extension.js",
  "activationEvents": [
    "onStartupFinished"
  ],
  "contributes": {
    "commands": [
      {
        "command": "legalAI.analyzeDocument",
        "title": "🔍 Analyze Legal Document",
        "category": "Legal AI"
      },
      {
        "command": "legalAI.extractEntities",
        "title": "🏷️ Extract Legal Entities",
        "category": "Legal AI"
      },
      {
        "command": "legalAI.openDashboard",
        "title": "📊 Open AI Dashboard",
        "category": "Legal AI"
      },
      {
        "command": "legalAI.configureModels",
        "title": "⚙️ Configure AI Models",
        "category": "Legal AI"
      }
    ],
    "menus": {
      "explorer/context": [
        {
          "command": "legalAI.analyzeDocument",
          "when": "resourceExtname =~ /\\.(pdf|docx|txt|md)$/",
          "group": "legalAI"
        }
      ],
      "editor/context": [
        {
          "command": "legalAI.extractEntities",
          "when": "editorHasSelection",
          "group": "legalAI"
        }
      ]
    },
    "viewsContainers": {
      "activitybar": [
        {
          "id": "legalAI",
          "title": "Legal AI",
          "icon": "$(law)"
        }
      ]
    },
    "views": {
      "legalAI": [
        {
          "id": "legalAI.dashboard",
          "name": "AI Dashboard",
          "type": "webview"
        },
        {
          "id": "legalAI.models",
          "name": "AI Models",
          "type": "tree"
        },
        {
          "id": "legalAI.history",
          "name": "Analysis History",
          "type": "tree"
        }
      ]
    },
    "configuration": {
      "title": "Legal AI",
      "properties": {
        "legalAI.preferredModel": {
          "type": "string",
          "enum": ["copilot", "claude", "ollama", "auto"],
          "default": "auto",
          "description": "Preferred AI model for legal analysis"
        },
        "legalAI.autoAnalyze": {
          "type": "boolean",
          "default": false,
          "description": "Automatically analyze documents when opened"
        },
        "legalAI.privacyMode": {
          "type": "string",
          "enum": ["low", "medium", "high", "maximum"],
          "default": "high",
          "description": "Privacy protection level"
        },
        "legalAI.jurisdiction": {
          "type": "string",
          "default": "US",
          "description": "Primary legal jurisdiction"
        }
      }
    }
  },
  "scripts": {
    "vscode:prepublish": "npm run compile",
    "compile": "tsc -p ./",
    "watch": "tsc -watch -p ./"
  },
  "devDependencies": {
    "@types/vscode": "^1.80.0",
    "@types/node": "18.x",
    "typescript": "^5.1.6"
  },
  "dependencies": {
    "axios": "^1.6.0",
    "ws": "^8.14.0"
  }
}

// src/extension.ts - Main extension entry point
import * as vscode from 'vscode';
import { LegalAIManager } from './managers/LegalAIManager';
import { DashboardProvider } from './providers/DashboardProvider';
import { ModelTreeProvider } from './providers/ModelTreeProvider';
import { HistoryTreeProvider } from './providers/HistoryTreeProvider';

export function activate(context: vscode.ExtensionContext) {
  console.log('Advanced Legal AI extension is now active!');

  // Initialize core managers
  const legalAIManager = new LegalAIManager(context);
  const dashboardProvider = new DashboardProvider(context.extensionUri);
  const modelTreeProvider = new ModelTreeProvider();
  const historyTreeProvider = new HistoryTreeProvider();

  // Register tree data providers
  vscode.window.registerTreeDataProvider('legalAI.models', modelTreeProvider);
  vscode.window.registerTreeDataProvider('legalAI.history', historyTreeProvider);

  // Register webview provider
  vscode.window.registerWebviewViewProvider('legalAI.dashboard', dashboardProvider);

  // Register commands
  const commands = [
    vscode.commands.registerCommand('legalAI.analyzeDocument', async (uri?: vscode.Uri) => {
      await legalAIManager.analyzeDocument(uri);
    }),

    vscode.commands.registerCommand('legalAI.extractEntities', async () => {
      await legalAIManager.extractEntities();
    }),

    vscode.commands.registerCommand('legalAI.openDashboard', async () => {
      await legalAIManager.openDashboard();
    }),

    vscode.commands.registerCommand('legalAI.configureModels', async () => {
      await legalAIManager.configureModels();
    })
  ];

  // Register event listeners
  const eventListeners = [
    vscode.workspace.onDidOpenTextDocument(async (document) => {
      if (legalAIManager.shouldAutoAnalyze(document)) {
        await legalAIManager.analyzeDocument(document.uri);
      }
    }),

    vscode.workspace.onDidSaveTextDocument(async (document) => {
      await legalAIManager.onDocumentSaved(document);
    })
  ];

  // Add all disposables to context
  context.subscriptions.push(...commands, ...eventListeners);

  // Initialize background services
  legalAIManager.initialize();
}

export function deactivate() {
  console.log('Advanced Legal AI extension is now deactivated');
}
```

## 📈 Production Deployment

### CI/CD Pipeline Configuration

```yaml
# .github/workflows/legal-ai-extension.yml
name: Legal AI Extension CI/CD

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]
  release:
    types: [published]

jobs:
  test:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        node-version: [18.x, 20.x]
        vscode-version: [1.80.0, stable]

    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: ${{ matrix.node-version }}
          cache: "npm"

      - name: Install dependencies
        run: npm ci

      - name: Run TypeScript compilation
        run: npm run compile

      - name: Run tests
        run: npm test

      - name: Run integration tests
        uses: GabrielBB/xvfb-action@v1
        with:
          run: npm run test:integration

      - name: Security audit
        run: npm audit --audit-level moderate

  package:
    needs: test
    runs-on: ubuntu-latest
    if: github.event_name == 'release'

    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: "20.x"

      - name: Install dependencies
        run: npm ci

      - name: Compile TypeScript
        run: npm run compile

      - name: Package extension
        run: |
          npm install -g vsce
          vsce package

      - name: Upload artifact
        uses: actions/upload-artifact@v4
        with:
          name: legal-ai-extension
          path: "*.vsix"

      - name: Publish to VS Code Marketplace
        if: github.event_name == 'release' && github.event.action == 'published'
        run: vsce publish -p ${{ secrets.VSCE_PAT }}

      - name: Publish to Open VSX Registry
        if: github.event_name == 'release' && github.event.action == 'published'
        run: |
          npm install -g ovsx
          ovsx publish *.vsix -p ${{ secrets.OVSX_PAT }}
```

### Enterprise Distribution

```typescript
// enterprise-deployment.ts
export class EnterpriseDeploymentManager {
  async deployToEnterprise(
    packagePath: string,
    deploymentConfig: EnterpriseConfig
  ): Promise<DeploymentResult> {
    // Validate package security
    const securityAudit = await this.performSecurityAudit(packagePath);
    if (!securityAudit.passed) {
      throw new SecurityError(
        "Package failed security audit",
        securityAudit.issues
      );
    }

    // Deploy to enterprise registry
    const deploymentResult = await this.deployToRegistry(
      packagePath,
      deploymentConfig.registry
    );

    // Configure enterprise policies
    await this.configureEnterprisePolicies(deploymentConfig.policies);

    // Setup monitoring and analytics
    await this.setupEnterpriseMonitoring(deploymentConfig.monitoring);

    // Generate deployment report
    const report = await this.generateDeploymentReport(deploymentResult);

    return {
      success: true,
      deploymentId: deploymentResult.id,
      report,
      rollbackInstructions: this.generateRollbackInstructions(deploymentResult),
    };
  }
}
```

This comprehensive enhancement provides enterprise-ready features, advanced automation, and production deployment capabilities for VS Code LLM extensions in legal AI environments.
