#!/usr/bin/env node
/**
 * Gemma4 Tool-Call Adapter + Sanitizer
 *
 * Two jobs:
 *   1. Strip <start_of_turn>/<end_of_turn> contamination markers from all responses
 *   2. Parse Gemma4's native <execute_tool> format and rewrite as OpenAI tool_calls[]
 *
 * Why: Gemma4 can do function calling but outputs its own format instead of OpenAI's.
 * The template (gemma4-summary-clean.jinja) has no tool_calls rendering, so the model
 * falls back to <execute_tool>fn(args)</execute_tool> in message.content.
 * OpenCode expects finish_reason="tool_calls" + message.tool_calls[].
 *
 * This adapter bridges the gap without replacing the model.
 */

import http from 'http';

const PORT = 8091;
const UPSTREAM = 'http://127.0.0.1:8090';

const DEBUG = process.env.GEMMA4_ADAPTER_DEBUG === '1';
function logDebug(label, data) {
  if (!DEBUG) return;
  const safe = typeof data === 'string' ? data : JSON.stringify(data);
  process.stderr.write(`[adapter:${label}] ${safe.slice(0, 4000)}\n`);
}

// Patterns Gemma4 uses for native tool calls
// Observed formats:
//   <execute_tool>get_time()</execute_tool>
//   <execute_tool>grep("pattern", "path")</execute_tool>
//   <execute_tool>{"name":"grep","arguments":{"pattern":"x"}}</execute_tool>
const EXECUTE_TOOL_RE = /<execute_tool>([\s\S]*?)<\/execute_tool>/g;
const RESULT_RE = /<result>([\s\S]*?)<\/result>/g;

// Gemma4 native template format (gemma4-tools.jinja):
//   <|tool_call>call:bash{command:<|"|>echo hello<|"|>,description:<|"|>run cmd<|"|>}<tool_call|>
// Use greedy match up to the LAST }<tool_call|> so nested braces in args don't truncate the match.
const NATIVE_TOOL_CALL_RE = /<\|tool_call>call:([a-zA-Z_][a-zA-Z0-9_:.-]*)\{([\s\S]*)\}<tool_call\|>/g;
// Thinking channel blocks:  <|channel>thought\n...\n<channel|>
const THINKING_CHANNEL_RE = /<\|channel>[\s\S]*?<channel\|>/g;

/**
 * Parse a single <execute_tool> block into {name, arguments}.
 * Handles three formats Gemma4 uses:
 *   1. JSON object:  {"name":"grep","arguments":{"pattern":"x"}}
 *   2. Function call: grep("pattern", "path")
 *   3. Bare name:    get_time()
 */
function parseExecuteToolBlock(raw) {
  const content = raw.trim();

  // Format 1: JSON
  if (content.startsWith('{')) {
    try {
      const parsed = JSON.parse(content);
      return {
        name: parsed.name || parsed.function || 'unknown',
        arguments: parsed.arguments || parsed.params || parsed.args || {},
      };
    } catch { /* fall through */ }
  }

  // Format 2/3: function-call syntax  fn_name(args...)
  const fnMatch = content.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*\((.*)\)\s*$/s);
  if (fnMatch) {
    const name = fnMatch[1];
    const argStr = fnMatch[2].trim();

    // Try to parse args as JSON object
    if (argStr.startsWith('{')) {
      try {
        return { name, arguments: JSON.parse(argStr) };
      } catch { /* fall through */ }
    }

    // Try positional args (quoted strings)
    if (argStr.length > 0) {
      // Build a best-effort object from positional args
      const positional = [];
      const argRe = /"([^"\\]*(\\.[^"\\]*)*)"|'([^'\\]*(\\.[^'\\]*)*)'|([^,\s]+)/g;
      let m;
      while ((m = argRe.exec(argStr)) !== null) {
        positional.push(m[1] ?? m[3] ?? m[5]);
      }
      return { name, arguments: { _positional: positional } };
    }

    return { name, arguments: {} };
  }

  // Unknown format — treat content as tool name
  return { name: content || 'unknown', arguments: {} };
}

/**
 * Parse Gemma4 native key:value argument body into a plain object.
 * Tries JSON.parse first (handles arrays, nested objects, proper quoting).
 * Falls back to key:<|"|>value<|"|> and key:barevalue patterns.
 */
function parseNativeArgs(body) {
  // Fast path: if the body is valid JSON, use it directly
  const trimmed = body.trim();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed);
      return typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : { _value: parsed };
    } catch { /* fall through to regex parser */ }
  }

  const result = {};
  // Match: key:<|"|>value<|"|>  OR  key:barevalue (including [], numbers, booleans)
  // The quoted form handles any value including commas, braces, brackets.
  // The bare form handles simple scalars (no commas or braces inside).
  const re = /([a-zA-Z_][a-zA-Z0-9_]*):<\|"\|>([\s\S]*?)<\|"\|>|([a-zA-Z_][a-zA-Z0-9_]*):(\[[^\]]*\]|[^,{}]+)/g;
  let m;
  while ((m = re.exec(body)) !== null) {
    if (m[1] !== undefined) {
      // Quoted value — try JSON parse for arrays/objects, else keep as string
      const val = m[2];
      try { result[m[1]] = JSON.parse(val); } catch { result[m[1]] = val; }
    } else if (m[3] !== undefined) {
      const raw = m[4].trim();
      // Try JSON first (handles [] and {})
      try {
        result[m[3]] = JSON.parse(raw);
      } catch {
        result[m[3]] = raw === 'true' ? true : raw === 'false' ? false : isNaN(Number(raw)) ? raw : Number(raw);
      }
    }
  }
  return result;
}

/**
 * Given a message content string that may contain <execute_tool> blocks,
 * bare JSON tool call lines, or Gemma4 native <|tool_call>call:name{...}<tool_call|> blocks,
 * extract all tool calls and return OpenAI tool_calls[] format.
 * Returns null if no tool call patterns found.
 */
function extractToolCalls(content) {
  if (!content) return null;
  const toolCalls = [];

  // Pattern 1: <execute_tool> blocks (old template / fallback)
  if (content.includes('<execute_tool>')) {
    EXECUTE_TOOL_RE.lastIndex = 0;
    let match;
    while ((match = EXECUTE_TOOL_RE.exec(content)) !== null) {
      const parsed = parseExecuteToolBlock(match[1]);
      toolCalls.push({
        id: `call_${Date.now()}_${toolCalls.length}`,
        type: 'function',
        function: { name: parsed.name, arguments: JSON.stringify(parsed.arguments) },
      });
    }
  }

  // Pattern 2: JSON object lines {"name": "...", "arguments": {...}} (new template)
  if (toolCalls.length === 0) {
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('{')) continue;
      try {
        const obj = JSON.parse(trimmed);
        if (obj.name && obj.arguments !== undefined) {
          toolCalls.push({
            id: `call_${Date.now()}_${toolCalls.length}`,
            type: 'function',
            function: {
              name: obj.name,
              arguments: typeof obj.arguments === 'string'
                ? obj.arguments
                : JSON.stringify(obj.arguments),
            },
          });
        }
      } catch { /* not JSON, skip */ }
    }
  }

  // Pattern 3: Gemma4 native <|tool_call>call:name{...}<tool_call|> (gemma4-tools.jinja)
  if (toolCalls.length === 0 && content.includes('<|tool_call>')) {
    NATIVE_TOOL_CALL_RE.lastIndex = 0;
    let match;
    while ((match = NATIVE_TOOL_CALL_RE.exec(content)) !== null) {
      const name = match[1];
      const args = parseNativeArgs(match[2]);
      toolCalls.push({
        id: `call_${Date.now()}_${toolCalls.length}`,
        type: 'function',
        function: { name, arguments: JSON.stringify(args) },
      });
    }
    if (toolCalls.length > 0) {
      console.log(`[adapter] Parsed ${toolCalls.length} native Gemma4 tool call(s) via <|tool_call> format`);
    }
  }

  // Ensure bash tool calls have the required 'description' field (OpenCode v1.14.x schema)
  for (const tc of toolCalls) {
    if (tc.function.name === 'bash') {
      try {
        const args = JSON.parse(tc.function.arguments || '{}');
        if (!args.description) {
          args.description = `Run: ${args.command || 'command'}`;
          tc.function.arguments = JSON.stringify(args);
        }
      } catch { /* malformed args — leave as-is */ }
    }
  }

  return toolCalls.length > 0 ? toolCalls : null;
}

/**
 * Extract thinking channel content from <|channel>thought\n...\n<channel|> blocks.
 * Returns the thought text (without markers), or empty string if none.
 */
function extractThinking(content) {
  if (!content || !content.includes('<|channel>')) return '';
  const thoughts = [];
  // Match <|channel>thought\n...content...\n<channel|>
  const re = /<\|channel>([\s\S]*?)<channel\|>/g;
  let m;
  while ((m = re.exec(content)) !== null) {
    const inner = m[1].replace(/^thought\n?/, '').trim();
    if (inner) thoughts.push(inner);
  }
  return thoughts.join('\n\n');
}

/**
 * Strip contamination markers; preserve thinking channel as a <think>...</think> block
 * at the start of the content so OpenCode/UI can display it.
 */
function sanitizeContent(content) {
  if (!content || typeof content !== 'string') return content;
  let s = content;

  // Extract thinking before stripping (so we can re-inject in clean form)
  const thinking = extractThinking(s);

  s = s.replace(/<start_of_turn>/g, '');
  s = s.replace(/<end_of_turn>/g, '');
  // Strip Gemma4 native thinking channels (now extracted above)
  s = s.replace(THINKING_CHANNEL_RE, '');
  s = s.replace(/<\|channel\|>thought/g, '');
  s = s.replace(/<channel\|>/g, '');
  s = s.replace(/<thinking>[\s\S]*?<\/thinking>/g, '');
  // Remove hallucinated result blocks (model shouldn't fabricate these)
  s = s.replace(RESULT_RE, '');
  // Remove <execute_tool> blocks from visible content (they become tool_calls)
  s = s.replace(EXECUTE_TOOL_RE, '');
  // Remove native <|tool_call>...<tool_call|> blocks from visible content
  s = s.replace(NATIVE_TOOL_CALL_RE, '');
  s = s.replace(/^_response\n/, '');
  s = s.trim();

  // Re-inject thinking as a standard <think> block (OpenCode renders these)
  if (thinking) {
    s = `<think>\n${thinking}\n</think>\n\n${s}`.trim();
    console.log(`[adapter] Thinking channel preserved (${thinking.length} chars)`);
  }

  return s;
}

/**
 * Rewrite a non-streaming chat completion response.
 * If content contains <execute_tool>, convert to tool_calls[].
 */
function rewriteResponse(obj, requestedTools) {
  const choice = obj.choices?.[0];
  if (!choice) return obj;

  const content = choice.message?.content;
  const toolCalls = requestedTools ? extractToolCalls(content) : null;

  if (toolCalls) {
    // Rewrite as a proper tool call response
    choice.finish_reason = 'tool_calls';
    choice.message = {
      role: 'assistant',
      content: null,
      tool_calls: toolCalls,
    };
    console.log(`[adapter] Rewrote ${toolCalls.length} tool call(s): ${toolCalls.map(t => t.function.name).join(', ')}`);
  } else if (content) {
    choice.message.content = sanitizeContent(content);
  }

  return obj;
}

/** Parse request body to check if tools were sent */
function parseRequestBody(body) {
  try {
    return JSON.parse(body);
  } catch {
    return {};
  }
}

const server = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', adapter: 'gemma4-tool-call-adapter', port: PORT }));
    return;
  }

  // Buffer the request body so we can check if tools were sent
  let reqBody = '';
  req.on('data', chunk => { reqBody += chunk.toString(); });
  req.on('end', () => {
    const isChatCompletions = req.url.includes('/chat/completions');
    const parsedReq = isChatCompletions ? parseRequestBody(reqBody) : {};
    const requestedTools = parsedReq.tools?.length > 0;

    if (isChatCompletions) {
      console.log(`[adapter] → ${req.method} ${req.url} stream=${parsedReq.stream} tools=${parsedReq.tools?.length ?? 0} msgs=${parsedReq.messages?.length ?? 0}`);
      logDebug('request', {
        method: req.method,
        url: req.url,
        model: parsedReq.model,
        stream: parsedReq.stream,
        tool_count: parsedReq.tools?.length ?? 0,
        tool_names: parsedReq.tools?.map(t => t.function?.name),
        messages: parsedReq.messages?.map(m => ({
          role: m.role,
          content_preview: typeof m.content === 'string' ? m.content.slice(0, 120) : typeof m.content,
        })),
      });
    }

    // When tools are requested, force non-streaming so we get a clean JSON response.
    // The streaming tool_calls delta format varies across AI SDK versions; non-streaming
    // message.tool_calls[] is unambiguous and works reliably with all OpenCode versions.
    let upstreamBody = reqBody;
    if (requestedTools && parsedReq.stream === true) {
      const forced = { ...parsedReq, stream: false };
      upstreamBody = JSON.stringify(forced);
      console.log('[adapter] Tools requested — forcing stream:false for reliable tool_calls parsing');
    }

    const upstreamUrl = new URL(req.url, UPSTREAM);
    const upstreamReq = http.request(
      upstreamUrl,
      { method: req.method, headers: { ...req.headers, host: '127.0.0.1:8090', 'content-length': Buffer.byteLength(upstreamBody).toString() } },
      (upstreamRes) => {
        if (!isChatCompletions) {
          res.writeHead(upstreamRes.statusCode, upstreamRes.headers);
          upstreamRes.pipe(res);
          return;
        }

        const isStreaming = upstreamRes.headers['content-type']?.includes('text/event-stream');

        let data = '';
        upstreamRes.on('data', chunk => { data += chunk.toString(); });
        upstreamRes.on('end', () => {
          try {
            logDebug('upstream-status', {
              status: upstreamRes.statusCode,
              contentType: upstreamRes.headers['content-type'],
              dataLength: data.length,
              dataPreview: data.slice(0, 200),
            });

            // If we forced non-streaming for tool calls, upstream returns JSON even though
            // the client requested SSE. Handle as non-streaming regardless of content-type.
            const forcedNonStreaming = requestedTools && parsedReq.stream === true;

            if (isStreaming && !forcedNonStreaming) {
              // SSE streaming: buffer all deltas, assemble full content, detect tool calls.
              // If tool calls found, inject a synthetic tool_calls chunk + [DONE].
              // If not, pass through with contamination stripped.
              let firstChunkId = null;
              let firstModel = null;
              let assembledContent = '';

              const lines = data.split('\n');
              const cleanLines = lines.map(line => {
                if (!line.startsWith('data: ')) return line;
                const payload = line.slice(6).trim();
                if (payload === '[DONE]') return line;
                try {
                  const obj = JSON.parse(payload);
                  if (!firstChunkId && obj.id) firstChunkId = obj.id;
                  if (!firstModel && obj.model) firstModel = obj.model;
                  const delta = obj.choices?.[0]?.delta;
                  if (delta?.content) {
                    assembledContent += delta.content;
                    // Strip contamination from streaming delta so it doesn't leak
                    obj.choices[0].delta.content = sanitizeContent(delta.content);
                  }
                  return `data: ${JSON.stringify(obj)}`;
                } catch { return line; }
              });

              // After assembling, check if the full content contains a tool call
              const toolCalls = requestedTools ? extractToolCalls(assembledContent) : null;
              if (toolCalls) {
                // Emit proper OpenAI incremental streaming format for tool calls.
                // AI SDK (vercel/ai) requires: role chunk → per-tool (index+id+name) chunk
                // → arguments chunk → finish chunk. Full args in one delta is NOT parsed.
                const chunkId = firstChunkId || `chatcmpl-${Date.now()}`;
                const chunkModel = firstModel || 'gemma4-legal.gguf';
                const created = Math.floor(Date.now() / 1000);
                const sseLines = [];

                const mk = (delta, finish_reason = null) => ({
                  id: chunkId,
                  object: 'chat.completion.chunk',
                  created,
                  model: chunkModel,
                  choices: [{ index: 0, delta, finish_reason }],
                });

                // 1. Role announcement
                sseLines.push(`data: ${JSON.stringify(mk({ role: 'assistant', content: null }))}`);

                // 2. Per tool call: index + id + type + name, then arguments
                for (let i = 0; i < toolCalls.length; i++) {
                  const tc = toolCalls[i];
                  // Name chunk
                  sseLines.push(`data: ${JSON.stringify(mk({
                    tool_calls: [{ index: i, id: tc.id, type: 'function', function: { name: tc.function.name, arguments: '' } }],
                  }))}`);
                  // Arguments chunk (send full args as one delta — SDK accumulates)
                  if (tc.function.arguments) {
                    sseLines.push(`data: ${JSON.stringify(mk({
                      tool_calls: [{ index: i, function: { arguments: tc.function.arguments } }],
                    }))}`);
                  }
                }

                // 3. Finish chunk — delta must be null/missing so SDK doesn't try to init a new tool call
                // finish_reason is read at line 490 BEFORE delta check at line 497, so this is safe
                sseLines.push(`data: ${JSON.stringify({
                  id: chunkId,
                  object: 'chat.completion.chunk',
                  created,
                  model: chunkModel,
                  choices: [{
                    index: 0,
                    delta: null,
                    finish_reason: 'tool_calls',
                  }],
                })}`);
                sseLines.push('data: [DONE]');

                // Each SSE event must be separated by \n\n (double newline)
                const sseOut = sseLines.join('\n\n') + '\n\n';
                const headers = { ...upstreamRes.headers, 'content-length': undefined };
                delete headers['content-length'];
                res.writeHead(upstreamRes.statusCode, headers);
                res.end(sseOut);
                console.log(`[adapter] Streaming: rewrote ${toolCalls.length} tool call(s): ${toolCalls.map(t => t.function.name).join(', ')}`);
              } else {
                // No tool calls — pass through cleaned stream
                res.writeHead(upstreamRes.statusCode, upstreamRes.headers);
                res.end(cleanLines.join('\n'));
              }
            } else if (forcedNonStreaming) {
              // We forced non-streaming upstream but the client expects SSE.
              // Parse the JSON response, rewrite tool calls, then re-wrap as SSE
              // so the AI SDK streaming parser can consume it correctly.
              const obj = JSON.parse(data);
              const rewritten = rewriteResponse(obj, requestedTools);
              const choice = rewritten.choices?.[0];
              const chunkId = rewritten.id || `chatcmpl-${Date.now()}`;
              const chunkModel = rewritten.model || 'gemma4-legal.gguf';
              const created = rewritten.created || Math.floor(Date.now() / 1000);

              const sseLines = [];

              if (choice?.message?.tool_calls?.length > 0) {
                // Emit proper incremental streaming format for tool calls
                const toolCalls = choice.message.tool_calls;

                const mk = (delta, finish_reason = null) => ({
                  id: chunkId,
                  object: 'chat.completion.chunk',
                  created,
                  model: chunkModel,
                  choices: [{ index: 0, delta, finish_reason }],
                });

                // 1. Role announcement
                sseLines.push(`data: ${JSON.stringify(mk({ role: 'assistant', content: null }))}`);

                // 2. Per tool call: header (index + id + name), then arguments
                for (let i = 0; i < toolCalls.length; i++) {
                  const tc = toolCalls[i];
                  sseLines.push(`data: ${JSON.stringify(mk({
                    tool_calls: [{ index: i, id: tc.id, type: 'function', function: { name: tc.function.name, arguments: '' } }],
                  }))}`);
                  if (tc.function.arguments) {
                    sseLines.push(`data: ${JSON.stringify(mk({
                      tool_calls: [{ index: i, function: { arguments: tc.function.arguments } }],
                    }))}`);
                  }
                }

                // 3. Finish chunk — delta:null so AI SDK doesn't try to init a new tool call
                sseLines.push(`data: ${JSON.stringify({
                  id: chunkId, object: 'chat.completion.chunk', created, model: chunkModel,
                  choices: [{ index: 0, delta: null, finish_reason: 'tool_calls' }],
                })}`);
                sseLines.push('data: [DONE]');

                console.log(`[adapter] ForcedNonStream→SSE: rewrote ${toolCalls.length} tool call(s): ${toolCalls.map(t => t.function.name).join(', ')}`);
                sseLines.filter(l => l.startsWith('data: ') && l !== 'data: [DONE]').forEach(l => {
                  try { logDebug('sse-out', JSON.parse(l.slice(6))); } catch { logDebug('sse-out', l); }
                });
              } else {
                // Regular content response — emit as single content chunk
                const content = sanitizeContent(choice?.message?.content || '');
                const mk = (delta, finish_reason = null) => ({
                  id: chunkId, object: 'chat.completion.chunk', created, model: chunkModel,
                  choices: [{ index: 0, delta, finish_reason }],
                });
                sseLines.push(`data: ${JSON.stringify(mk({ role: 'assistant', content: null }))}`);
                if (content) {
                  sseLines.push(`data: ${JSON.stringify(mk({ content }))}`);
                }
                sseLines.push(`data: ${JSON.stringify(mk(null, choice?.finish_reason || 'stop'))}`);
                sseLines.push('data: [DONE]');
              }

              // Each SSE event must be separated by \n\n (double newline per RFC 8895)
              const sseOut = sseLines.join('\n\n') + '\n\n';
              logDebug('response-mode', {
                stream: parsedReq.stream,
                forcedNonStreaming,
                hasSseToolCalls: choice?.message?.tool_calls?.length > 0,
                sseLineCount: sseLines.length,
                sseByteLength: sseOut.length,
              });
              console.log(`[adapter] ForcedNonStream→SSE response (${sseOut.length} bytes):\n${sseOut.slice(0, 400)}`);
              const headers = {
                'content-type': 'text/event-stream',
                'cache-control': 'no-cache',
                'connection': 'keep-alive',
                'transfer-encoding': 'chunked',
              };
              res.writeHead(200, headers);
              res.end(sseOut);
            } else {
              // Genuine non-streaming request (client did not ask for stream)
              const obj = JSON.parse(data);
              const rewritten = rewriteResponse(obj, requestedTools);
              const responseJson = JSON.stringify(rewritten);
              const headers = {
                ...upstreamRes.headers,
                'content-length': Buffer.byteLength(responseJson).toString(),
              };
              res.writeHead(upstreamRes.statusCode, headers);
              res.end(responseJson);
            }
          } catch (e) {
            console.error('[sanitizer] Parse error:', e.message);
            res.writeHead(upstreamRes.statusCode, upstreamRes.headers);
            res.end(data);
          }
        });
      }
    );

    upstreamReq.on('error', e => {
      console.error('[sanitizer] Upstream error:', e.message);
      res.writeHead(502);
      res.end(JSON.stringify({ error: 'Bad Gateway', details: e.message }));
    });

    upstreamReq.write(upstreamBody);
    upstreamReq.end();
  });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[gemma4-tool-call-adapter] Listening on http://127.0.0.1:${PORT}`);
  console.log(`[gemma4-tool-call-adapter] Upstream: ${UPSTREAM}`);
  console.log(`[gemma4-tool-call-adapter] Rewrites <execute_tool> → tool_calls[] for OpenCode`);
});
