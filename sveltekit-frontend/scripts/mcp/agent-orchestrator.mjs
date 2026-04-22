/**
 * Agent Orchestrator - Node.js Edition
 * Model-agnostic tool execution with Ollama/Triton support
 */

import { appendFileSync } from 'fs';

class AgentOrchestrator {
    constructor(backend = 'ollama') {
        this.backend = backend;
        this.ollamaUrl = process.env.OLLAMA_URL || 'http://localhost:11434';
        this.tritonUrl = process.env.TRITON_URL || 'http://localhost:8000';
        this.mcpUrl = process.env.MCP_URL || 'http://localhost:3003';
        this.apiToolUrl = process.env.TOOL_API_URL || process.env.APP_URL || 'http://localhost:5173';
        this.conversationState = [];
        this.toolCallLog = [];

        // Tool definitions for Ollama function calling
        this.tools = [
            {
                type: 'function',
                function: {
                    name: 'web_search',
                    description: 'Search the web for current information',
                    parameters: {
                        type: 'object',
                        properties: {
                            query: { type: 'string', description: 'Search query' },
                            recency_days: { type: 'integer', description: 'Only results from last N days' },
                            max_results: { type: 'integer', description: 'Max results to return' }
                        },
                        required: ['query']
                    }
                }
            },
            {
                type: 'function',
                function: {
                    name: 'github_search',
                    description: 'Search GitHub for issues, pull requests, and code. Use for deep technical research.',
                    parameters: {
                        type: 'object',
                        properties: {
                            query: { type: 'string', description: 'Search query' },
                            search_type: { type: 'string', enum: ['issues', 'code', 'repositories'], description: 'Type of search (default: issues)' },
                            limit: { type: 'integer', description: 'Max results to return (max 10)' }
                        },
                        required: ['query']
                    }
                }
            },
            {
                type: 'function',
                function: {
                    name: 'reddit_search',
                    description: 'Search Reddit for community discussions and unofficial workarounds.',
                    parameters: {
                        type: 'object',
                        properties: {
                            query: { type: 'string', description: 'Search query' },
                            limit: { type: 'integer', description: 'Max results to return (max 10)' }
                        },
                        required: ['query']
                    }
                }
            },
            {
                type: 'function',
                function: {
                    name: 'kb_vector_search',
                    description: 'Search the knowledge base using vector similarity',
                    parameters: {
                        type: 'object',
                        properties: {
                            query: { type: 'string', description: 'Search query' },
                            collection: { type: 'string', description: 'Collection name' },
                            limit: { type: 'integer', description: 'Max results' },
                            threshold: { type: 'number', description: 'Similarity threshold' }
                        },
                        required: ['query']
                    }
                }
            },
            {
                type: 'function',
                function: {
                    name: 'kb_upsert_documents',
                    description: 'Add documents to knowledge base',
                    parameters: {
                        type: 'object',
                        properties: {
                            documents: { type: 'array', items: { type: 'object' } },
                            collection: { type: 'string' },
                            chunk_size: { type: 'integer' },
                            overlap: { type: 'integer' }
                        },
                        required: ['documents']
                    }
                }
            },
            {
                type: 'function',
                function: {
                    name: 'graph_upsert_nodes',
                    description: 'Create or update entities in knowledge graph',
                    parameters: {
                        type: 'object',
                        properties: {
                            entities: { type: 'array', items: { type: 'object' } },
                            label: { type: 'string', description: 'Node label' }
                        },
                        required: ['entities']
                    }
                }
            },
            {
                type: 'function',
                function: {
                    name: 'graph_cypher_query',
                    description: 'Execute Cypher query on knowledge graph',
                    parameters: {
                        type: 'object',
                        properties: {
                            cypher: { type: 'string', description: 'Cypher query' },
                            params: { type: 'object', description: 'Query parameters' }
                        },
                        required: ['cypher']
                    }
                }
            }
        ];
    }

    /**
     * Execute agent conversation with tool calling
     */
    async chat(userMessage, systemPrompt = null, maxToolIterations = 5) {
        // Initialize conversation
        if (systemPrompt) {
            this.conversationState.push({
                role: 'system',
                content: systemPrompt
            });
        }

        this.conversationState.push({
            role: 'user',
            content: userMessage
        });

        // Tool calling loop
        for (let iteration = 0; iteration < maxToolIterations; iteration++) {
            console.log(`\n🔄 Iteration ${iteration + 1}/${maxToolIterations}`);

            // Call LLM
            const llmResponse = await this._callLLM(this.conversationState);

            // Check for tool calls
            const toolCalls = this._extractToolCalls(llmResponse);

            if (toolCalls.length === 0) {
                // No more tools - return final response
                const assistantMessage = llmResponse.message?.content || '';
                this.conversationState.push({
                    role: 'assistant',
                    content: assistantMessage
                });

                return {
                    response: assistantMessage,
                    toolCalls: this.toolCallLog,
                    conversationState: this.conversationState,
                    metadata: {
                        iterations: iteration + 1,
                        backend: this.backend,
                        timestamp: new Date().toISOString()
                    }
                };
            }

            console.log(`🔧 ${toolCalls.length} tool call(s) detected`);

            // Add assistant message with tool calls
            this.conversationState.push({
                role: 'assistant',
                content: llmResponse.message?.content || '',
                tool_calls: toolCalls
            });

            // Execute tools
            const toolResults = await this._executeTools(toolCalls);

            // Add tool results to conversation
            for (const result of toolResults) {
                this.conversationState.push({
                    role: 'tool',
                    content: JSON.stringify(result.result),
                    tool_call_id: result.tool_call_id
                });
            }
        }

        // Max iterations reached
        return {
            response: 'Max tool iterations reached - conversation incomplete',
            toolCalls: this.toolCallLog,
            conversationState: this.conversationState,
            metadata: {
                iterations: maxToolIterations,
                backend: this.backend,
                status: 'max_iterations',
                timestamp: new Date().toISOString()
            }
        };
    }

    /**
     * Call LLM (Ollama or Triton)
     */
    async _callLLM(messages) {
        if (this.backend === 'ollama') {
            return await this._callOllama(messages);
        } else if (this.backend === 'triton') {
            return await this._callTriton(messages);
        } else {
            throw new Error(`Unknown backend: ${this.backend}`);
        }
    }

    /**
     * Call Ollama with tool calling support
     */
    async _callOllama(messages) {
        try {
            const model = process.env.OLLAMA_MODEL || 'gemma4-legal:latest';
            const response = await fetch(`${this.ollamaUrl}/api/chat`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                model,
                messages: messages,
                tools: this.tools,
                stream: false,
              }),
            });

            if (response.ok) {
                return await response.json();
            } else {
                console.error(`Ollama call failed: ${response.status}`);
                return {
                    message: {
                        content: 'LLM call failed',
                        tool_calls: []
                    }
                };
            }
        } catch (error) {
            console.error('Ollama error:', error.message);
            return {
                message: {
                    content: `Error: ${error.message}`,
                    tool_calls: []
                }
            };
        }
    }

    /**
     * Call Triton/TRT-LLM
     */
    async _callTriton(messages) {
        try {
            const prompt = this._formatTritonPrompt(messages);

            const response = await fetch(`${this.tritonUrl}/v2/models/gemma3_trt/infer`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    inputs: [
                        {
                            name: 'text_input',
                            shape: [1, 1],
                            datatype: 'BYTES',
                            data: [prompt]
                        }
                    ],
                    parameters: {
                        max_tokens: 512,
                        temperature: 0.7
                    }
                })
            });

            if (response.ok) {
                const data = await response.json();
                const outputText = data.outputs?.[0]?.data?.[0] || '';

                return {
                    message: {
                        content: outputText,
                        tool_calls: this._parseTritonToolCalls(outputText)
                    }
                };
            } else {
                return {
                    message: {
                        content: 'Triton call failed',
                        tool_calls: []
                    }
                };
            }
        } catch (error) {
            console.error('Triton error:', error.message);
            return {
                message: {
                    content: `Error: ${error.message}`,
                    tool_calls: []
                }
            };
        }
    }

    /**
     * Format messages for Triton
     */
    _formatTritonPrompt(messages) {
        const parts = [];

        for (const msg of messages) {
            const role = msg.role || 'user';
            const content = msg.content || '';

            if (role === 'system') {
                parts.push(`<|system|>\n${content}\n`);
            } else if (role === 'user') {
                parts.push(`<|user|>\n${content}\n`);
            } else if (role === 'assistant') {
                parts.push(`<|assistant|>\n${content}\n`);
            } else if (role === 'tool') {
                parts.push(`<|tool_result|>\n${content}\n`);
            }
        }

        parts.push('<|assistant|>\n');
        return parts.join('');
    }

    /**
     * Parse tool calls from Triton output
     */
    _parseTritonToolCalls(outputText) {
        const toolCalls = [];

        try {
            // Find JSON in output
            if (outputText.includes('{') && outputText.includes('}')) {
                const start = outputText.indexOf('{');
                const end = outputText.lastIndexOf('}') + 1;
                const jsonStr = outputText.substring(start, end);

                const data = JSON.parse(jsonStr);

                if (data.tool) {
                    toolCalls.push({
                        id: this._hashString(jsonStr).substring(0, 8),
                        type: 'function',
                        function: {
                            name: data.tool,
                            arguments: JSON.stringify(data.args || {})
                        }
                    });
                } else if (Array.isArray(data)) {
                    for (const item of data) {
                        if (item.tool) {
                            toolCalls.push({
                                id: this._hashString(JSON.stringify(item)).substring(0, 8),
                                type: 'function',
                                function: {
                                    name: item.tool,
                                    arguments: JSON.stringify(item.args || {})
                                }
                            });
                        }
                    }
                }
            }
        } catch (error) {
            // Silent fail - no tool calls found
        }

        return toolCalls;
    }

    /**
     * Extract tool calls from LLM response
     */
    _extractToolCalls(llmResponse) {
        return llmResponse.message?.tool_calls || [];
    }

    _getToolAliases(toolName) {
        const aliases = {
            web_search: ['web_search_tool'],
            web_search_tool: ['web_search'],
            graph_upsert_edges: ['graph_upsert_relationships'],
            graph_upsert_relationships: ['graph_upsert_edges']
        };

        return [toolName, ...(aliases[toolName] || [])];
    }

    async _callToolEndpoint(toolName, args) {
        const attempts = [];
        const aliases = this._getToolAliases(toolName);

        for (const candidateName of aliases) {
            const directUrl = `${this.mcpUrl.replace(/\/$/, '')}/tools/${candidateName}`;
            attempts.push({
                url: directUrl,
                init: {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(args)
                },
                parser: async (response) => await response.json(),
                candidateName,
                kind: 'fastmcp-direct'
            });
        }

        for (const candidateName of aliases) {
            const apiUrl = `${this.apiToolUrl.replace(/\/$/, '')}/api/tools/execute`;
            attempts.push({
                url: apiUrl,
                init: {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ tool: candidateName, args })
                },
                parser: async (response) => await response.json(),
                candidateName,
                kind: 'svelte-api-execute'
            });
        }

        const failures = [];

        for (const attempt of attempts) {
            try {
                const response = await fetch(attempt.url, attempt.init);
                if (!response.ok) {
                    const text = await response.text();
                    console.log(`   ⚠️ Endpoint ${attempt.candidateName} returned ${response.status}: ${text.substring(0, 200)}`);
                    failures.push(`${attempt.kind}:${attempt.candidateName}:${response.status}`);
                    continue;
                }

                const payload = await attempt.parser(response);

                if (payload?.success === false) {
                    failures.push(`${attempt.kind}:${attempt.candidateName}:${payload.error || 'execution failed'}`);
                    continue;
                }

                return {
                    ok: true,
                    candidateName: attempt.candidateName,
                    endpointKind: attempt.kind,
                    result: payload?.result ?? payload
                };
            } catch (error) {
                failures.push(`${attempt.kind}:${attempt.candidateName}:${error.message}`);
            }
        }

        return {
            ok: false,
            result: {
                error: `Tool execution failed for ${toolName}`,
                attempts: failures
            }
        };
    }

    /**
     * Execute tool calls via MCP server
     */
    async _executeTools(toolCalls) {
        const results = [];

        for (const call of toolCalls) {
            const toolId = call.id || 'unknown';
            const toolName = call.function?.name || '';
            const rawArgs = call.function?.arguments || '{}';
            const args = typeof rawArgs === 'string' ? JSON.parse(rawArgs) : rawArgs;

            console.log(`   🔧 Calling ${toolName}...`);

            // Log tool call
            this.toolCallLog.push({
                tool: toolName,
                args: args,
                timestamp: new Date().toISOString()
            });

            try {
                const execution = await this._callToolEndpoint(toolName, args);
                const result = execution.result;

                if (execution.ok) {
                  console.log(
                    `   ✅ ${toolName} succeeded via ${execution.endpointKind} (${execution.candidateName})`
                  );
                } else {
                  console.log(`   ❌ ${toolName} failed across all configured tool endpoints:`, execution.result.attempts);
                }

                results.push({
                    tool_call_id: toolId,
                    tool: toolName,
                    result: result
                });
            } catch (error) {
                console.log(`   ❌ ${toolName} error: ${error.message}`);
                results.push({
                    tool_call_id: toolId,
                    tool: toolName,
                    result: { error: error.message }
                });
            }
        }

        return results;
    }

    /**
     * Simple hash function for IDs
     */
    _hashString(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return Math.abs(hash).toString(16);
    }

    /**
     * Save conversation to JSONL
     */
    saveConversation(outputPath) {
        const data = {
            conversation_state: this.conversationState,
            tool_calls: this.toolCallLog,
            metadata: {
                backend: this.backend,
                timestamp: new Date().toISOString()
            }
        };

        appendFileSync(outputPath, JSON.stringify(data) + '\n');
        console.log(`\n💾 Conversation saved to ${outputPath}`);
    }
}

// CLI for testing
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
if (process.argv[1] && (process.argv[1] === __filename || process.argv[1].endsWith('agent-orchestrator.mjs'))) {
    const backend = process.argv[2] || 'ollama';
    const query = process.argv.slice(3).join(' ') || 'Search for TypeScript 5.7 features and summarize';

    console.log(`\n🤖 Agent Orchestrator - Backend: ${backend}`);
    console.log(`📝 Query: ${query}\n`);

    const agent = new AgentOrchestrator(backend);

    const systemPrompt = `You are a helpful AI assistant with access to:
- web_search: Search the web for current information
- kb_vector_search: Search the knowledge base
- graph_cypher_query: Query the knowledge graph

Use tools when needed to answer questions accurately.`;

    agent.chat(query, systemPrompt)
        .then(result => {
            console.log(`\n✅ Final Response:`);
            console.log(result.response);

            console.log(`\n🔧 Tool Calls: ${result.toolCalls.length}`);
            for (const call of result.toolCalls) {
                console.log(`   • ${call.tool}: ${JSON.stringify(call.args).substring(0, 100)}`);
            }

            console.log(`\n📊 Metadata:`);
            console.log(`   Iterations: ${result.metadata.iterations}`);
            console.log(`   Backend: ${result.metadata.backend}`);

            // Save conversation
            agent.saveConversation('data/agent-conversations.jsonl');
        })
        .catch(error => {
            console.error(`\n❌ Error: ${error.message}`);
            process.exit(1);
        });
}

export default AgentOrchestrator;
