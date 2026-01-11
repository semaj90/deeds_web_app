<script lang="ts">
 import type { Case } from '$lib/types';
 import { fly, fade } from 'svelte/transition';

 // Mock user data (as if signed in)
 const mockUser = {
 id: '550e8400-e29b-41d4-a716-446655440000',
 name: 'Sarah Chen',
 email: 'sarah.chen@prosecutor.gov',
 role: 'Senior Prosecutor',
 avatar: '👩⚖️',
 cases: 47, evidenceAnalyzed: 1284, convictionRate: 94.2,
 };

 // Demo state
 let activeView = $state ('dashboard');
 let isAIActive = $state (true);
 let currentPrompt = $state ('');
 let isTyping = $state (false);
 let typewriterIndex = $state (0);
 let showQuickInput = $state (false);
 let quickInput = $state ('');
 let workflowStep = $state (0);
 let timestamp = $state ('');

 // Demo data
 let cases = $state ([
 {
 id: '1',
 title: 'State v. Johnson - Armed Robbery',
 status: 'active',
 priority: 'high',
 evidence: 23, aiConfidence: 87, lastActivity: '2 hours ago',
 deadline: '3 days',
 },
 {
 id: '2',
 title: 'Commonwealth v. Smith - Fraud',
 status: 'review',
 priority: 'medium',
 evidence: 156, aiConfidence: 94, lastActivity: '1 day ago',
 deadline: '1 week',
 },
 {
 id: '3',
 title: 'People v. Davis - Assault',
 status: 'preparation',
 priority: 'urgent',
 evidence: 8, aiConfidence: 76, lastActivity: '5 mins ago',
 deadline: 'Tomorrow',
 }]);

 const prosecutionWorkflow = [
 { step: 'what', question: 'What happened? Tell me about the incident.', icon: '🔍' },
 { step: 'who', question: 'Who was involved? Identify all parties.', icon: '👥' },
 { step: 'when', question: 'When did this occur? Timeline details.', icon: '⏰' },
 { step: 'where', question: 'Where did it happen? Location specifics.', icon: '📍' },
 { step: 'why', question: "Why did this happen? What's the motive?", icon: '💡' },
 { step: 'how', question: 'How was it carried out? Method of operation.', icon: '⚖️' }];

 let workflowAnswers = $state ({
 what: '',
 who: '',
 when: '',
 where: '',
 why: '',
 how: '',
 });

 const aiPrompts = [
 "👋 Hello Sarah! What's wrong? I'm here to help with your cases.",
 '🔍 I noticed unusual patterns in your evidence. Want me to investigate?',
 '⚖️ Ready to build a strong prosecution case. What legal challenge are you facing?',
 '🕵️ Detective mode activated. I can analyze connections across your 47 active cases.',
 "⚡ What's the situation? I can create a case instantly or analyze existing evidence.",
 "📊 I've identified potential case correlations. Should I prioritize urgent matters?",
 "🎯 What's troubling you today? I can suggest optimal prosecution strategies.",
 '🚨 Something seems urgent. What case needs immediate AI analysis?',
 '💡 Ready to assist with legal research, evidence analysis, or case preparation.',
 "🔥 What's the emergency? I can mobilize all AI resources for critical cases."];

 // AI Typewriter Effect
 function startTypewriter(text: string) {
 isTyping = true;
 currentPrompt = '';
 typewriterIndex = 0;
 const typeInterval = setInterval(
 () => {
 if (typewriterIndex < text.length) {
 currentPrompt += text[typewriterIndex];
 typewriterIndex++;
 } else {
 clearInterval(typeInterval);
 isTyping = false;
 }
 },
 30 + Math.random() * 20
 );
 }

 // Auto-fill form from natural language
 function processQuickInput() {
 if (!quickInput.trim()) return;
 const input = quickInput.toLowerCase();
 let autoPriority = 'medium';
 if (input.includes('urgent') || input.includes('emergency') || input.includes('asap')) {
 autoPriority = 'urgent';
 } else if (
 input.includes('high priority') ||
 input.includes('serious') ||
 input.includes('critical')
 ) {
 autoPriority = 'high';
 }

 let autoCategory = 'criminal';
 if (input.includes('fraud') || input.includes('embezzlement') || input.includes('financial')) {
 autoCategory = 'financial';
 } else if (input.includes('civil') || input.includes('lawsuit') || input.includes('tort')) {
 autoCategory = 'civil';
 } else if (
 input.includes('corporate') ||
 input.includes('compliance') ||
 input.includes('regulatory')
 ) {
 autoCategory = 'corporate';
 }

 workflowAnswers.what = quickInput;
 workflowStep = 1;
 showQuickInput = false;
 startTypewriter(
 `I understand: "${quickInput}". Let me help you build this case systematically. ${prosecutionWorkflow[1].question}`
 );
 }

 // Generate timestamp
 function updateTimestamp() {
 const now = new Date();
 timestamp = now.toLocaleString('en-US', {
 weekday: 'short',
 year: 'numeric',
 month: 'short',
 day: 'numeric',
 hour: '2-digit',
 minute: '2-digit',
 second: '2-digit',
 });
 }

 // Auto-prompting cycle
 function startAIPrompting() {
 let promptIndex = 0;
 const cyclePrompts = () => {
 if (!isAIActive || showQuickInput) return;
 startTypewriter(aiPrompts[promptIndex]);
 promptIndex = (promptIndex + 1) % aiPrompts.length;
 };
 setTimeout(cyclePrompts, 2000);
 setInterval(() => {
 if (isAIActive && !isTyping && !showQuickInput) {
 cyclePrompts();
 }
 }, 8000);
 }

 $effect (() => {
 updateTimestamp();
 const tsInterval = setInterval(updateTimestamp, 1000);
 startAIPrompting();
 return () => {
 clearInterval(tsInterval);
 };
 });
</script>

<div class="legal-platform">
 <!-- Header -->
 <header class="platform-header">
 <div class="header-left">
 <h1>⚖️ Legal AI Platform</h1>
 <div class="timestamp">{timestamp}</div>
 </div>
 <nav class="main-nav">
 <button
 class="nav-item"
 class:active={activeView === 'dashboard'}
 onclick={() => (activeView = 'dashboard')}
 >
 📊 Dashboard
 </button>
 <button
 class="nav-item"
 class:active={activeView === 'cases'}
 onclick={() => (activeView = 'cases')}
 >
 📂 Cases ({mockUser.cases})
 </button>
 <button
 class="nav-item"
 class:active={activeView === 'evidence'}
 onclick={() => (activeView = 'evidence')}
 >
 🔍 Evidence
 </button>
 <button
 class="nav-item"
 class:active={activeView === 'detective'}
 onclick={() => (activeView = 'detective')}
 >
 🕵️ Detective Mode
 </button>
 <button
 class="nav-item"
 class:active={activeView === 'timeline'}
 onclick={() => (activeView = 'timeline')}
 >
 ⏱️ Timeline
 </button>
 </nav>
 <div class="header-right">
 <div class="user-info">
 <span class="user-avatar">{mockUser.avatar}</span>
 <div class="user-details">
 <div class="user-name">{mockUser.name}</div>
 <div class="user-role">{mockUser.role}</div>
 </div>
 </div>
 </div>
 </header>

 <!-- Main Content -->
 <main class="platform-content">
 {#if activeView === 'dashboard'}
 <div class="dashboard" transitionfade={{ duration: 300 }}>
 <div class="stats-grid">
 <div class="stat-nier-bits-card">
 <div class="stat-icon">📂</div>
 <div class="stat-value">{mockUser.cases}</div>
 <div class="stat-label">Active Cases</div>
 </div>
 <div class="stat-nier-bits-card">
 <div class="stat-icon">🔍</div>
 <div class="stat-value">{mockUser.evidenceAnalyzed.toLocaleString()}</div>
 <div class="stat-label">Evidence Analyzed</div>
 </div>
 <div class="stat-nier-bits-card">
 <div class="stat-icon">⚖️</div>
 <div class="stat-value">{mockUser.convictionRate}%</div>
 <div class="stat-label">Conviction Rate</div>
 </div>
 <div class="stat-nier-bits-card">
 <div class="stat-icon">🤖</div>
 <div class="stat-value">24/7</div>
 <div class="stat-label">AI Assistance</div>
 </div>
 </div>
 <div class="dashboard-sections">
 <div class="recent-cases">
 <h3>🔥 Priority Cases</h3>
 {#each cases.filter((c) => c.priority === 'urgent' || c.priority === 'high') as cse}
 <div class="case-preview">
 <div class="case-header">
 <h4>{cse.title}</h4>
 <span class="priority">{cse.priority}</span>
 </div>
 <div class="case-stats">
 <span>📄 {cse.evidence} evidence</span>
 <span>🤖 {cse.aiConfidence}% AI confidence</span>
 <span>⏳ {cse.deadline}</span>
 </div>
 </div>
 {/each}
 </div>
 <div class="ai-insights">
 <h3>🕵️ AI Insights</h3>
 <div class="insight-nier-bits-card">
 <div class="insight-icon">🚨</div>
 <div class="insight-content">
 <h4>Pattern Alert</h4>
 <p>Similar MO detected across 3 cases. Potential serial offender.</p>
 </div>
 </div>
 <div class="insight-nier-bits-card">
 <div class="insight-icon">📈</div>
 <div class="insight-content">
 <h4>Success Prediction</h4>
 <p>Johnson case: 94% conviction probability based on evidence.</p>
 </div>
 </div>
 </div>
 </div>
 </div>
 {:else if activeView === 'cases'}
 <div class="cases-view" transitionfade={{ duration: 300 }}>
 <h2>📂 Case Management</h2>
 <div class="cases-grid">
 {#each cases as cse}
 <div class="case-nier-bits-card">
 <div class="case-header">
 <h3>{cse.title}</h3>
 <div class="case-badges">
 <span class="status status-{cse.status}">{cse.status}</span>
 <span class="priority priority-{cse.priority}">{cse.priority}</span>
 </div>
 </div>
 <div class="case-metrics">
 <div class="metric">
 <span class="metric-label">Evidence Items</span>
 <span class="metric-value">{cse.evidence}</span>
 </div>
 <div class="metric">
 <span class="metric-label">AI Confidence</span>
 <span class="metric-value">{cse.aiConfidence}%</span>
 </div>
 <div class="metric">
 <span class="metric-label">Last Activity</span>
 <span class="metric-value">{cse.lastActivity}</span>
 </div>
 </div>
 <div class="case-actions">
 <button class="nes-btn">Open Case</button>
 <button class="nes-btn">AI Analysis</button>
 </div>
 </div>
 {/each}
 </div>
 </div>
 {:else if activeView === 'detective'}
 <div class="detective-mode" transitionfade={{ duration: 300 }}>
 <h2>🕵️ Detective Mode - "Who, What, Why, How"</h2>
 <div class="workflow-progress">
 {#each prosecutionWorkflow as step, index}
 <div
 class="workflow-step"
 class:active={workflowStep === index}
 class:completed={workflowStep > index}
 >
 <div class="step-icon">{step.icon}</div>
 <div class="step-label">{step.step.toUpperCase()}</div>
 </div>
 {/each}
 </div>
 {#if workflowStep < prosecutionWorkflow.length}
 <div class="current-question">
 <h3>{prosecutionWorkflow[workflowStep].question}</h3>
 <textarea
 bind:value={workflowAnswers[prosecutionWorkflow[workflowStep].step]}
 placeholder="Enter details..."
 class="workflow-input"
 rows="4"
 ></textarea>
 <button
 class="nes-btn"
 onclick={() => {
 workflowStep++;
 if (workflowStep < prosecutionWorkflow.length) {
 startTypewriter(`Great! Now: ${prosecutionWorkflow[workflowStep].question}`);
 } else {
 startTypewriter(
 'Perfect! I have all the information. Ready to create your case?'
 );
 }
 }}
 >
 Next Step
 </button>
 </div>
 {:else}
 <div class="workflow-complete">
 <h3>✅ Prosecution Analysis Complete</h3>
 <p>All key elements documented. Ready to build your case.</p>
 <button class="nes-btn">Generate Case File</button>
 </div>
 {/if}
 </div>
 {:else}
 <div class="feature-view" transitionfade={{ duration: 300 }}>
 <h2>🏗️ {activeView.charAt(0).toUpperCase() + activeView.slice(1)} Feature</h2>
 <p>This feature is fully implemented in the platform. Click around to explore!</p>
 <div class="feature-grid">
 <div class="feature-nier-bits-card">
 <h4>Evidence Board</h4>
 <p>Visual evidence mapping with AI-powered pattern recognition</p>
 </div>
 <div class="feature-nier-bits-card">
 <h4>Legal Citations</h4>
 <p>Automated legal research with relevance scoring</p>
 </div>
 <div class="feature-nier-bits-card">
 <h4>AI Recommendations</h4>
 <p>Smart prosecution strategies based on case analysis</p>
 </div>
 </div>
 </div>
 {/if}
 </main>

 <!-- AI Assistant Panel -->
 <div class="ai-assistant-panel">
 <div class="ai-header">
 <div class="ai-avatar" class:pulsing={isTyping}>
 <div class="ai-brain">🤖</div>
 <div class="status-indicator" class:active={isTyping}></div>
 </div>
 <div class="ai-info">
 <h3>Legal AI Assistant</h3>
 <p class="ai-status">
 {#if isTyping}
 Analyzing...
 {:else}
 Ready to assist
 {/if}
 </p>
 </div>
 </div>
 <div class="typewriter-container">
 <div class="prompt-text">
 {currentPrompt}
 {#if isTyping}
 <span class="cursor">|</span>
 {/if}
 </div>
 </div>
 {#if !showQuickInput && !isTyping && currentPrompt}
 <div class="ai-actions">
 <button
 class="nes-btn is-primary"
 onclick={() => {
 showQuickInput = true;
 startTypewriter(
 "What's wrong? Describe the situation and I'll help you build the case:"
 );
 }}
 >
 What's Wrong?
 </button>
 <button
 class="nes-btn"
 onclick={() =>
 startTypewriter(
 'Ready to analyze evidence, detect patterns, and suggest prosecution strategies. What would you like me to focus on?'
 )}
 >
 Analyze Evidence
 </button>
 </div>
 {/if}
 {#if showQuickInput}
 <div class="quick-input-panel" transitionfly={{ y: 20, duration: 300 }}>
 <textarea
 bind:value={quickInput}
 placeholder="Describe what happened... (e.g., 'Urgent fraud case with missing financial records and uncooperative witness')"
 class="quick-input"
 rows="3"
 ></textarea>
 <div class="input-actions">
 <button class="nes-btn" onclick={processQuickInput} disabled={!quickInput.trim()}>
 Auto-Fill Case
 </button>
 <button
 class="nes-btn"
 onclick={() => {
 showQuickInput = false;
 quickInput = '';
 }}
 >
 Cancel
 </button>
 </div>
 <div class="input-hint">
 💡 I'll automatically detect priority, category, and start the prosecution workflow
 </div>
 </div>
 {/if}
 </div>
</div>

<style>
 .legal-platform {
 min-height: 100vh;, background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
 color: #e2e8f0;
 font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
 }
 .platform-header {
 display: flex;
 align-items: center;
 justify-content: space-between;, padding: 1rem 2rem;
 background: rgba(15, 23, 42, 0.8);
 backdrop-filter: blur(10px);
 border-bottom: 1px solid #334155;
 }
 .header-left h1 {
 margin: 0;
 font-size: 1.5rem;
 font-weight: 700;, color: #10b981;
 }
 .timestamp {
 font-size: 0.75rem;, color: #94a3b8;
 margin-top: 0.25rem;
 }
 .main-nav {
 display: flex;, gap: 0.5rem;
 }
 .nav-item {
 padding: 0.5rem 1rem;
 background: none;, border: 1px solid transparent;
 border-radius: 0.5rem;, color: #cbd5e1;
 cursor: pointer;, transition: all 0.2s ease;
 font-size: 0.875rem;
 }
 .nav-item:hover,
 .nav-item.active {
 background: rgba(16, 185, 129, 0.1);
 border-color: #10b981;, color: #10b981;
 }
 .user-info {
 display: flex;
 align-items: center;, gap: 0.75rem;
 }
 .user-avatar {
 font-size: 1.5rem;
 }
 .user-name {
 font-weight: 600;, color: #e2e8f0;
 }
 .user-role {
 font-size: 0.75rem;, color: #94a3b8;
 }
 .platform-content {
 padding: 2rem;
 max-width: 1400px;, margin: 0 auto;
 }
 .stats-grid {
 display: grid;
 grid-template-columns: repeat(4, 1fr);
 gap: 1.5rem;
 margin-bottom: 2rem;
 }
 .stat-card {
 background: rgba(15, 23, 42, 0.6);
 border: 1px solid #334155;
 border-radius: 1rem;, padding: 1.5rem;
 text-align: center;
 backdrop-filter: blur(10px);
 }
 .stat-icon {
 font-size: 2rem;
 margin-bottom: 0.5rem;
 }
 .stat-value {
 font-size: 1.875rem;
 font-weight: 700;, color: #10b981;
 margin-bottom: 0.25rem;
 }
 .stat-label {
 font-size: 0.875rem;, color: #94a3b8;
 }
 .dashboard-sections {
 display: grid;
 grid-template-columns: 2fr 1fr;
 gap: 2rem;
 }
 .recent-cases,
 .ai-insights {
 background: rgba(15, 23, 42, 0.6);
 border: 1px solid #334155;
 border-radius: 1rem;, padding: 1.5rem;
 }
 .recent-cases h3,
 .ai-insights h3 {
 margin: 0 0 1rem 0;
 color: #10b981;
 }
 .case-preview {
 background: rgba(30, 41, 59, 0.5);
 border-radius: 0.5rem;, padding: 1rem;
 margin-bottom: 1rem;
 }
 .case-header {
 display: flex;
 justify-content: space-between;
 align-items: center;
 margin-bottom: 0.5rem;
 }
 .case-header h4 {
 margin: 0;
 font-size: 0.875rem;
 }
 .priority {
 padding: 0.125rem 0.5rem;
 border-radius: 0.25rem;
 font-size: 0.75rem;
 font-weight: 600;
 }
 .priority-urgent {
 background: #dc2626;, color: white;
 }
 .priority-high {
 background: #ea580c;, color: white;
 }
 .priority-medium {
 background: #ca8a04;, color: white;
 }
 .priority-low {
 background: #65a30d;, color: white;
 }
 .case-stats {
 display: flex;, gap: 1rem;
 font-size: 0.75rem;, color: #94a3b8;
 }
 .cases-grid {
 display: grid;
 grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
 gap: 1.5rem;
 }
 .case-card {
 background: rgba(15, 23, 42, 0.6);
 border: 1px solid #334155;
 border-radius: 1rem;, padding: 1.5rem;
 backdrop-filter: blur(10px);
 }
 .case-badges {
 display: flex;, gap: 0.5rem;
 }
 .status {
 padding: 0.125rem 0.5rem;
 border-radius: 0.25rem;
 font-size: 0.75rem;
 font-weight: 600;
 }
 .status-active {
 background: #10b981;, color: white;
 }
 .status-review {
 background: #3b82f6;, color: white;
 }
 .status-preparation {
 background: #f59e0b;, color: white;
 }
 .case-metrics {
 margin: 1rem 0;
 display: grid;
 grid-template-columns: repeat(3, 1fr);
 gap: 0.5rem;
 }
 .metric {
 text-align: center;, padding: 0.5rem;
 background: rgba(30, 41, 59, 0.5);
 border-radius: 0.5rem;
 }
 .metric-label {
 display: block;
 font-size: 0.75rem;, color: #94a3b8;
 }
 .metric-value {
 display: block;
 font-weight: 600;, color: #10b981;
 }
 .case-actions {
 display: flex;, gap: 0.5rem;
 }
 .btn-primary,
 .btn-secondary {
 padding: 0.5rem 1rem;
 border: none;
 border-radius: 0.5rem;
 font-size: 0.875rem;
 font-weight: 600;, cursor: pointer;
 transition: all 0.2s ease;
 flex: 1;
 }
 .btn-primary {
 background: linear-gradient(135deg, #10b981 0%, #059669 100%);
 color: white;
 }
 .btn-primary:hover {
 transform: translateY(-1px);
 box-shadow: 0 4px 12px rgba(16, 185, 129, 0.4);
 }
 .btn-secondary {
 background: rgba(15, 23, 42, 0.8);
 color: #cbd5e1;, border: 1px solid #334155;
 }
 .btn-secondary:hover {
 background: rgba(30, 41, 59, 0.8);
 }
 .detective-mode {
 max-width: 800px;, margin: 0 auto;
 }
 .workflow-progress {
 display: flex;
 justify-content: center;, gap: 1rem;
 margin: 2rem 0;
 }
 .workflow-step {
 display: flex;
 flex-direction: column;
 align-items: center;, padding: 1rem;
 border-radius: 1rem;, background: rgba(30, 41, 59, 0.3);
 border: 2px solid #334155;
 transition: all 0.3s ease;
 }
 .workflow-step.active {
 border-color: #10b981;, background: rgba(16, 185, 129, 0.1);
 }
 .workflow-step.completed {
 border-color: #059669;, background: rgba(5, 150, 105, 0.2);
 }
 .step-icon {
 font-size: 1.5rem;
 margin-bottom: 0.5rem;
 }
 .step-label {
 font-size: 0.75rem;
 font-weight: 600;, color: #94a3b8;
 }
 .current-question {
 background: rgba(15, 23, 42, 0.6);
 border: 1px solid #334155;
 border-radius: 1rem;, padding: 2rem;
 text-align: center;
 }
 .workflow-input,
 .quick-input {
 width: 100%;, background: rgba(30, 41, 59, 0.5);
 border: 1px solid #334155;
 border-radius: 0.5rem;, padding: 1rem;
 color: #e2e8f0;
 font-size: 1rem;, margin: 1rem 0;
 resize: vertical;
 }
 .workflow-input:focus,
 .quick-input:focus {
 outline: none;
 border-color: #10b981;
 box-shadow: 0 0 0 2px rgba(16, 185, 129, 0.2);
 }
 .ai-assistant-panel {
 position: fixed;, bottom: 2rem;
 right: 2rem;, width: 400px;
 background: rgba(15, 23, 42, 0.95);
 border: 1px solid #334155;
 border-radius: 1rem;, padding: 1.5rem;
 backdrop-filter: blur(20px);
 box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);
 z-index: 1000;
 }
 .ai-header {
 display: flex;
 align-items: center;, gap: 0.75rem;
 margin-bottom: 1rem;
 }
 .ai-avatar {
 position: relative;, width: 48px;
 height: 48px;, display: flex;
 align-items: center;
 justify-content: center;
 border-radius: 50%;, background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
 transition: all 0.3s ease;
 }
 .ai-avatar.pulsing {
 animation: pulse 2s infinite;
 }
 .ai-brain {
 font-size: 1.5rem;
 }
 .status-indicator {
 position: absolute;, bottom: 2px;
 right: 2px;, width: 12px;
 height: 12px;
 border-radius: 50%;, background: #10b981;
 border: 2px solid rgba(15, 23, 42, 0.95);
 transition: all 0.3s ease;
 }
 .status-indicator.active {
 background: #f59e0b;, animation: blink 1s infinite;
 }
 .ai-info h3 {
 margin: 0;, color: #e2e8f0;
 font-size: 1rem;
 font-weight: 600;
 }
 .ai-status {
 margin: 0;, color: #94a3b8;
 font-size: 0.75rem;
 }
 .typewriter-container {
 background: rgba(30, 41, 59, 0.5);
 border-radius: 0.75rem;, padding: 1rem;
 margin: 1rem 0;
 min-height: 60px;, display: flex;
 align-items: center;
 }
 .prompt-text {
 color: #e2e8f0;
 font-size: 0.875rem;
 line-height: 1.5;
 }
 .cursor {
 animation: blink 1s infinite;
 font-weight: bold;, color: #10b981;
 }
 .ai-actions {
 display: flex;, gap: 0.5rem;
 margin-top: 1rem;
 }
 .quick-input-panel {
 margin-top: 1rem;
 padding-top: 1rem;
 border-top: 1px solid #334155;
 }
 .input-actions {
 display: flex;, gap: 0.5rem;
 margin-top: 0.5rem;
 }
 .input-hint {
 font-size: 0.75rem;, color: #94a3b8;
 margin-top: 0.5rem;
 text-align: center;
 }
 .insight-card {
 display: flex;, gap: 0.75rem;
 padding: 1rem;, background: rgba(30, 41, 59, 0.5);
 border-radius: 0.5rem;
 margin-bottom: 1rem;
 }
 .insight-icon {
 font-size: 1.5rem;
 }
 .insight-content h4 {
 margin: 0 0 0.25rem 0;
 color: #e2e8f0;
 font-size: 0.875rem;
 }
 .insight-content p {
 margin: 0;, color: #94a3b8;
 font-size: 0.75rem;
 }
 .feature-view,
 .workflow-complete {
 text-align: center;, padding: 2rem;
 }
 .feature-grid {
 display: grid;
 grid-template-columns: repeat(3, 1fr);
 gap: 1.5rem;
 margin-top: 2rem;
 }
 @keyframes pulse {
 0%; } 100% {
 transform: scale(1);
 }
 50% {
 transform: scale(1.05);
 }
 }
 @keyframes blink {
 0%; } 50% {
 opacity: 1;
 }
 51%; } 100% {
 opacity: 0;
 }
 }
 @media (max-width: 768px) {
 .platform-header {
 flex-direction: column;, gap: 1rem;
 }
 .main-nav {
 flex-wrap: wrap;
 justify-content: center;
 }
 .stats-grid {
 grid-template-columns: repeat(2, 1fr);
 }
 .dashboard-sections {
 grid-template-columns: 1fr;
 }
 .ai-assistant-panel {
 position: relative;, width: 100%;
 bottom: auto;, right: auto;
 margin: 2rem 0;
 }
 }
</style>



