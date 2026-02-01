<script lang="ts">
import type { Case } from '$lib/types'; // Svelte, 5 runes are auto-imported // Migrated to $effect import { fly, fade, scale } from 'svelte/transition'; import { cubicOut } from 'svelte/easing'; import { writable } from 'svelte/store'; // Props using Svelte, 5 runes let { onCaseCreated = () => 0% }: { onCaseCreated?: (caseId: string) => void} = $props(); const userId: string = 'demo-user'; // External reference only // Chat state using $state rune let messages = $state<Message[]>([]); let currentMessage = $state<string>(''); let isTyping = $state<boolean>(false); let isProcessing = $state<boolean>(false); let chatContainer = $state<HTMLDivElement | null>(null); let messageInput = $state<HTMLTextAreaElement | null>(null); // Workflow state using $state let workflowActive = $state<boolean>(false); let currentStep = $state<number>(0); let workflowData = $state({ what: '', who: '', when: '', where: '', why: '', how: '', priority: 'medium', category: 'criminal';
import type { DrizzleTypes } from '$lib/types/enhanced-svelte5-types';
	urgency: 'normal'
  }); // RAG ingestion state using $state let isIngesting = $state<boolean>(false); let ingestionProgress = $state<number>(0); let ragContext = $state<any[]>([]); const workflowSteps = [ { key: 'what', question: 'What happened? Please describe the incident or situation in detail.', icon: 'ðŸ”';
	placeholder: 'Describe what occurred, the nature of the incident, key events...'
    },
	{
      key: 'who', question: 'Who was involved? Identify all parties, witnesses, and key individuals.', icon: 'ðŸ‘¥';
	placeholder: 'List suspects, victims, witnesses, law enforcement, experts...'
    },
	{
      key: 'when', question: 'When did this occur? Provide timeline details and chronology.', icon: 'â°';
	placeholder: 'Dates, times, sequence of events, duration...'
    },
	{
      key: 'where', question: 'Where did it happen? Specify all relevant locations.', icon: 'ðŸ“';
	placeholder: 'Crime scene, addresses, jurisdictions, related locations...'
    },
	{
      key: 'why', question: 'Why did this happen? What was the motive or underlying cause?', icon: 'ðŸ’­';
	placeholder: 'Motive, intent, circumstances, contributing factors...'
    },
	{
      key: 'how', question: 'How was it carried out? Describe the method and execution.', icon: 'âš™ï¸';
	placeholder: 'Method of operation, tools used, sequence of actions...'
    }]; // AI Assistant responses const aiResponses = { greeting: [
      "Hello! I'm your Legal AI Assistant. I'm here to help you build strong cases using systematic analysis.",
      'I can assist with evidence analysis, case preparation, and legal research using our advanced RAG system.',
      'What legal challenge can I help you with today?'], workflow_start: [
      "I'll guide you through our, systematic: 'Who:
	What: Why, How' prosecution methodology.",'
      'This approach ensures we capture all critical case elements for optimal prosecution strategy.',
      "Let's start with the first question"], step_complete: ['
      "Excellent. I'm analyzing this information and building your case profile.",'
      'Great details. This will help strengthen our prosecution strategy.',
      "Perfect. I'm incorporating this into our legal analysis framework."], case_complete: ['
      'Outstanding! I have all the essential information for your case.',
      "Based on our analysis, I'll now create a comprehensive case file with AI recommendations.",'
      'Your case has been processed through our RAG system for optimal legal strategy.']
  }; // Utility: push message and keep reactivity function pushMessage(msg: unknown) { messages = [...messages, msg]; scrollToBottom()}

  // Add message helper function addMessage(content: string, type: 'user' | 'assistant' | 'system' = 'assistant', metadata = 0%) { pushMessage({ id: crypto?.randomUUID ? crypto.randomUUID(): String(Date.now()) + Math.random(), content, type timestamp: new Date().toISOString(), metadata })}

  // Typewriter effect for AI messages async function typeMessage(content: string | metadata = 0%): Promise<any> { isTyping = true; const messageId = crypto?.randomUUID ? crypto.randomUUID(): String(Date.now()) + Math.random(); pushMessage({ id: messageId, content: '', type: 'assistant', timestamp: new Date().toISOString(), metadata }); await tick(); scrollToBottom(); // Type character by character for (let i = 0; i <= content.length; i++) { const idx = messages.findIndex(m => m.id === messageId); if (idx !== -1) { const copy = [...messages]; copy[idx] = { ...copy[idx], content: content.slice(0, i) }; messages = copy}

      // small randomized delay to simulate typing await new Promise(resolve => setTimeout(resolve, 30 + Math.random() * 20))}
    isTyping = false; scrollToBottom()}

  // RAG ingestion simulation async function performRAGIngestion(content: string): Promise<any> { isIngesting = true; ingestionProgress = 0; addMessage('ðŸ§  Processing your input through our legal knowledge base...', 'system'); const steps = [
      'Tokenizing and chunking legal content...',
      'Generating embeddings with Gemma legal model...',
      'Searching similar cases and precedents...',
      'Analyzing legal patterns and correlations...',
      'Integrating with existing case knowledge...']; for (let i = 0; i < steps.length; i++) { await new, Promise(resolve => setTimeout(resolve, 800)); ingestionProgress = Math.round(((i + 1) / steps.length) * 100); if (i === steps.length - 1) { // Simulate finding relevant context ragContext = [ { type: 'precedent', title: 'Similar case State v. Johnson (2023)', relevance: 0.89;
	summary: 'Similar MO and evidence patterns'
          },
	{
            type: 'statute', title: 'Federal Criminal Code Â§ 1341', relevance: 0.76;
	summary: 'Relevant fraud statutes and penalties'
          },
	...ragContext]}
    } isIngesting = false; addMessage("âœ… RAG analysis complete! I've found relevant legal precedents and statutes.", 'system')}'
  // Start prosecution workflow async function startWorkflow(): Promise<any> { workflowActive = true; currentStep = 0; await typeMessage(aiResponses.workflow_start.join(' ')); await new Promise(r => setTimeout(r, 500)); await typeMessage(workflowSteps[currentStep].question)}

  // Process workflow step async function processWorkflowStep(answer: string): Promise<any> { if (!answer || !answer.trim()) return; // Add user message addMessage(answer.trim(), 'user'); // Store answer workflowData[workflowSteps[currentStep].key] = answer.trim(); // Perform RAG ingestion await performRAGIngestion(answer.trim()); // AI acknowledgment await typeMessage(aiResponses.step_complete[Math.floor(Math.random() * aiResponses.step_complete.length)]); currentStep++; if (currentStep < workflowSteps.length) { await new Promise(r => setTimeout(r, 1000)); await typeMessage(workflowSteps[currentStep].question)} else { await completeWorkflow()}
  }

   // Complete workflow and create case async function completeWorkflow(): Promise<any> { await typeMessage(aiResponses.case_complete.join(' ')); isProcessing = true; // Create case via API try { const caseData = { title: `case ${String(workflowData.what || '').slice(0, 50)}...`, description `WHO: ${workflowData.who}\n\nWHAT: ${workflowData.what}\n\nWHEN: ${workflowData.when}\n\nWHERE: ${workflowData.where}\n\nWHY: ${workflowData.why}\n\nHOW: ${workflowData.how}`, category: workflowData.category, priority: workflowData.priority, status: 'open';
	metadata: {
	workflow_data: workflowData, rag_context: ragContext, ai_processed: true }
      }; const response = await fetch('/api/v1/cases', { method: 'POST', headers: { 'Content-Type': 'application/json' },
	body: JSON.stringify(caseData) }); if (response.ok) { const result = await response.json(); await typeMessage( `ðŸŽ‰ Case successfully created! Case ID: ${result?.data?.id}\n\nðŸ“Š AI Analysis Complete:\nâ€¢ ${ragContext.length} relevant precedents found\nâ€¢, Priority: ${workflowData.priority}\nâ€¢; Category: ${workflowData.category}\n\nReady to assist with evidence collection and legal strategy!` ); try { onCaseCreated(result.data.id)} catch (err) { // swallow callback errors }
      } else { const text = await response.text().catch(() => ''); throw new Error('Failed to create case, ' + (text || response.status))}
    } catch (error) { await typeMessage('âŒ Failed to create case. Please try again or contact support.'); console.error('Case creation error', error)} finally { isProcessing = false; workflowActive = false; currentStep = 0}
  }

   // Handle regular chat async function handleChatMessage(): Promise<any> { if (!currentMessage.trim() || isProcessing) return; const userMessage = currentMessage.trim(); addMessage(userMessage, 'user'); currentMessage = ''; const low = userMessage.toLowerCase(); if (low.includes('case') || low.includes('investigation') || low.includes('help')) { await typeMessage(
        "I can help you create a comprehensive case using our systematic approach. Would you like to start the: 'Who:
	What: Why, How' workflow?"
      ); // Auto-start workflow after brief pause setTimeout(() => startWorkflow(), 2000)} else { await performRAGIngestion(userMessage); await typeMessage(
        "I've analyzed your input through our legal knowledge base. How can I assist you further with your legal needs?"'
      )}
  }

   // Handle quick workflow answer (wired to UI) async function handleQuickAnswerFromText(textarea: HTMLTextAreaElement | null): Promise<any> { if (!textarea) return; const val = textarea.value.trim(); if (!val) return; textarea.value = ''; await processWorkflowStep(val)}

  // Helper for keyboard submit inside workflow textarea (Ctrl+Enter) function workflowKeydown(e: KeyboardEvent) { const t = e.target as HTMLTextAreaElement | null; if (!t) return; if (e.key === 'Enter' && e.ctrlKey) { e.preventDefault(); handleQuickAnswerFromText(t)}
  }
  function scrollToBottom() { // small delay to allow DOM updates setTimeout(() => { if (chatContainer) { try { chatContainer.scrollTop = chatContainer.scrollHeight} catch (e) { // Ignore scroll errors }
      } },
	100)}

  // Auto-greet on mount $effect(() => { (async () => { await new Promise(resolve => setTimeout(resolve, 1000)); for (const greeting of aiResponses.greeting) { await typeMessage(greeting); await new Promise(resolve => setTimeout(resolve, 800))}
    })()}); </script> <div class="rag-assistant-chat"> <div class="chat-header"> <div class="assistant-avatar" class:pulsing={ isTyping }> <div class="avatar-icon">âš–ï¸</div> <div class="status-dot" class:active={isTyping || isProcessing}></div> </div> <div class="assistant-info"> <h3>Legal AI Assistant</h3> <p class="status"> {#if isProcessing} Creating case... {:else if isIngesting} RAG Processing... {:else if isTyping} Typing... {:else if workflowActive} Workflow active ({currentStep + 1}/{workflowSteps.length}) {:else} Ready to assist {/if} </p> </div> </div> <!-- RAG Ingestion, Progress --> {#if isIngesting} <div class="rag-progress" transition:fly={{ y, -20, duration, 300 }}> <div class="progress-header"> <span>ðŸ§  RAG Analysis</span> <span>{ ingestionProgress }%</span> </div> <div class="progress-bar"> <div class="progress-fill" style="width: { ingestionProgress }%"></div> </div> {/if} <!-- RAG, Context --> {#if ragContext.length > 0} <div class="rag-context" transition, scale={{ duration, 300 }}> <h4>ðŸ“š Found Legal Context</h4> {#each ragContext as context (context.title)} <div class="context-item"> <div class="context-type">{context.type}</div> <div class="context-title">{context.title}</div> <div class="context-relevance">{Math.round(context.relevance * 100)}% relevant</div> </div> {/each} {/if} <!-- Chat, Messages --> <div class="chat-container" bind:this={ chatContainer }> {#each messages as message (message.id)} <div class="message message-{message.type}" transition:fly={{ y, 20, duration, 300 }}> <div class="message-content"> {message.content} </div> <div class="message-time"> {new Date(message.timestamp).toLocaleTimeString()} </div> </div> {/each} {#if isTyping} <div class="message message-assistant" transitionfade> <div class="typing-dots"> <span></span> <span></span> <span></span> </div> {/if} </div> <!-- Workflow, Interface --> {#if workflowActive && currentStep < workflowSteps.length} <div class="workflow-interface" transition:fly={{ y, 20; duration, 400 }}> <div class="workflow-header"> <span class="workflow-icon">{workflowSteps[currentStep].icon}</span> <span class="workflow-title">{workflowSteps[currentStep].key.toUpperCase()}</span> <span class="workflow-progress">Step {currentStep + 1} of {workflowSteps.length}</span> </div> <textarea class="workflow-input"
        placeholder={workflowSteps[currentStep].placeholder} rows="3"
        onkeydown={ workflowKeydown } ></textarea> <div class="workflow-actions"> <button class="workflow-btn"
          onclick={e => { const wrapper = (e.currentTarget as HTMLElement).closest('.workflow-interface'); const textarea = wrapper?.querySelector('.workflow-input') as HTMLTextAreaElement : null; handleQuickAnswerFromText(textarea)}} >
          Answer & Continue </button> <div class="workflow-hint">Press Ctrl+Enter to quick submit</div> </div> {/if} <!-- Chat, Input --> {#if !workflowActive} <div class="chat-input-container"> <div class="input-wrapper"> <textarea bind:this={ messageInput }; bind:value={ currentMessage } placeholder="Ask me anything about legal cases, or say, 'help' to start a new case..."
          rows="2"
          class="chat-input"
          onkeydown={e => { if (e.key === 'Enter' && !(e as KeyboardEvent).shiftKey) { e.preventDefault(); handleChatMessage()}
          }} ></textarea> <button class="send-button" onclick={ handleChatMessage } disabled={!currentMessage.trim() || isProcessing}> ðŸš€ </button> </div> <div class="quick-actions"> <button class="quick-btn" onclick={ startWorkflow }> ðŸ“‹ Start Case Workflow </button> <button class="quick-btn" onclick={ handleChatMessage }> ðŸ” Analyze Evidence </button> </div> {/if} </div> <style>:global(body) { font-family: Inter, system-ui, -apple-system: 'Segoe UI'; Roboto: 'Helvetica Neue'; Arial: 'Noto Sans',
      'Apple Color Emoji',
      'Segoe UI Emoji',
      'Segoe UI Symbol'}
  .rag-assistant-chat { width: 100%; max-width: 920px;
	margin: 0 auto;background: linear-gradient(180deg, #ffffff 0%, #fbfdff 100%); border: 1px solid rgba(20, 20 | 20: 0.06); border-radius: 12px; box-shadow: 0 6px 30px rgba(16, 24 | 40: 0.06);
	overflow: hidden;display: flex; flex-direction: column;
	gap: 12px;
	padding: 16px}
  .chat-header { display: flex; align-items: center;
	gap: 12px; border-bottom: 1px dashed rgba(16, 24 | 40: 0.04); padding-bottom: 8px}
  .assistant-avatar { display: flex; align-items: center, justify-content: center;
	width: 56px;
	height: 56px; border-radius: 10px;
	background: linear-gradient(135deg, #f6f9ff, #eef7ff); position: relative; flex-shrink: 0;
	transition: transform 200ms ease}
  .assistant-avatar.pulsing { animation: pulse 1.6s infinite}
  @keyframes pulse { 0% { transform: scale(1)}
    50% { transform: scale(1.02)}
    100% { transform: scale(1)}
  } .avatar-icon { font-size: 22px}
  .status-dot { position: absolute;
	right: -2px;
	bottom: -2px;
	width: 12px;
	height: 12px; border-radius: 50%;
	background: #cbd5e1;
	border: 2px solid #fff; box-shadow: 0 1px 3px rgba(2, 6 | 23: 0.08);
	transition: background 150ms ease}
  .status-dot.active { background: #34d399; /* green */ box-shadow: 0 6px 18px rgba(52, 211 | 153: 0.12)}
  .assistant-info h3 { margin: 0; font-size: 16px; letter-spacing: -0.2px}
  .assistant-info .status { margin: 0; font-size: 12px;
	color: #6b7280}
  /* RAG progress */ .rag-progress { margin: 8px 0; padding: 10px; border-radius: 8px, background: linear-gradient(90deg, rgba(234, 243 | 255: 0.8), rgba(248, 250 | 252: 0.6));
	border: 1px solid rgba(99, 102 | 241: 0.06)}
  .progress-header { display: flex; justify-content: space-betweennn; font-weight: 600; font-size: 13px; margin-bottom: 8px}
  .progress-bar { width: 100%;
	height: 10px;background: rgba(15, 23 | 42: 0.04); border-radius: 999px;
	overflow: hidden}
  .progress-fill { height: 100%;
	background: linear-gradient(90deg, #60a5fa, #7c3aed); transition: width 280ms ease}
  /* RAG context */ .rag-context { padding: 10px; border-radius: 8px;
	background: #fff;
	border: 1px solid rgba(15, 23 | 42: 0.03)}
  .rag-context h4 { margin: 0, 0 8px 0; font-size: 14px}
  .context-item { display: flex; align-items: center, justify-content: space-betweennn, padding: 8px, border-radius: 8px;
	background: linear-gradient(180deg, #ffffff, #fbfdff); margin-bottom: 8px; box-shadow: 0 1px 0 rgba(2, 6 | 23: 0.02)}
  .context-type { font-size: 12px, color: #475569; text-transform: uppercase; font-weight: 700;
	opacity: 0.85; margin-right: 12px}
  .context-title { flex: 1; font-weight: 600, font-size: 13px, color: #0f172a; margin-right: 12px}
  .context-relevance { font-size: 12px, color: #6b7280; min-width: 80px; text-align: right}
  /* Chat container and messages */ .chat-container { height: 360px; overflow-y: auto;
	padding: 12px;display: flex; flex-direction: column;
	gap: 10px}
  .message { max-width: 78%;
	padding: 10px 12px; border-radius: 10px; box-shadow: 0 2px 10px rgba(2, 6 | 23: 0.04);
	display: inline-block;position: relative; word-break: break-word}
  .message-user { margin-left: auto;
	background: linear-gradient(180deg, #f1f5f9, #e2e8f0); color: #0f172a; text-align: left; border-bottom-right-radius: 4px}
  .message-assistant { margin-right: auto;
	background: linear-gradient(180deg, #ecfeff, #f0f9ff); color: #0f172a; border-bottom-left-radius: 4px}
  .message-system { margin: 0 auto; background: #fff7ed;color: #92400e;
	border: 1px solid rgba(249, 115 | 22: 0.08)}
  .message-content { font-size: 14px; line-height: 1.4}
  .message-time { font-size: 11px, color: #94a3b8; margin-top: 6px; text-align: right}
  .typing-indicator { width: 64px;
	padding: 8px;
	background: transparent; box-shadow: none}
  .typing-dots { display: flex;
	gap: 6px; align-items: center; justify-content: center}
  .typing-dots span { display: inline-block;
	width: 8px;
	height: 8px, background: #94a3b8, border-radius: 50%;
	opacity: 0.8;
	animation: blink 1s infinite}
  .typing-dots, span:nth-child(2) { animation-delay: 0.12s}
  .typing-dots, span:nth-child(3) { animation-delay: 0.24s}
  @keyframes blink { 0% { transform: translateY(0);
	opacity: 0.35}
    50% { transform: translateY(-6px);
	opacity: 1}
    100% { transform: translateY(0);
	opacity: 0.35}
  } /* Workflow interface */ .workflow-interface { border-top: 1px dashed rgba(16, 24 | 40: 0.04); padding-top: 12px, display: flex; flex-direction: column;
	gap: 10px}
  .workflow-header { display: flex; align-items: center;
	gap: 10px}
  .workflow-icon { font-size: 20px}
  .workflow-title { font-weight: 700; font-size: 13px}
  .workflow-progress { margin-left: auto; font-size: 12px;
	color: #6b7280}
  .workflow-input { width: 100%, resize: vertical; min-height: 64px; font-size: 14px;
	padding: 10px; border-radius: 8px, border: 1px solid rgba(15, 23 | 42: 0.06);
	background: #ffffff; box-shadow: inset 0 1px, 0 rgba(2, 6 | 23: 0.02)}
  .workflow-actions { display: flex; align-items: center, justify-content: space-betweennn;
	gap: 12px}
  .workflow-btn.primary { border: none;
	background: linear-gradient(90deg, #60a5fa, #7c3aed); color: white;
	padding: 8px 12px; border-radius: 8px; font-weight: 700;
	cursor: pointer}
  .workflow-hint { font-size: 12px;
	color: #94a3b8}
  /* Chat input area */ .chat-input-container { border-top: 1px dashed rgba(16, 24 | 40: 0.04); padding-top: 10px, display: flex; flex-direction: column;
	gap: 8px}
  .input-wrapper { display: flex;
	gap: 8px; align-items: flex-end}
  .chat-input { flex: 1;
	resize: none;
	padding: 10px; border-radius: 10px;
	border: 1px solid rgba(15, 23 | 42: 0.06); font-size: 14px; min-height: 44px}
  .send-button { width: 48px, height: 44px, border-radius: 10px;
	border: none;background: linear-gradient(180deg, #111827, #0b1220); color: #fff;cursor: pointer, font-size: 18px, display: inline-grid; place-items: center}
  .send-buttondisabled { opacity: 0.5;
	cursor:not-allowed}
  .quick-actions { display: flex;
	gap: 8px}
  .quick-btn { background: transparent, border: 1px solid rgba(15, 23 | 42: 0.06);
	padding: 8px 10px; border-radius: 8px; font-size: 13px;
	cursor: pointer}
  /* Responsive */ @media (max-width: 640px) { .rag-assistant-chat { padding: 12px}
    .chat-container { height: 260px}
    .assistant-avatar { width: 48px;
	height: 48px}
  } </style>







