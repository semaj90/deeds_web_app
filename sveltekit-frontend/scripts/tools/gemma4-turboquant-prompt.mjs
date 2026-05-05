#!/usr/bin/env node
/**
 * gemma4-turboquant-prompt.mjs
 *
 * Stable VS-Code-callable prompt runner for the TurboQuant llama-server (:8090).
 * Replaces the previous `node -e '...'` task body that broke under PowerShell
 * because pwsh treats parentheses + commas inside unquoted strings as parameter
 * lists. By keeping the script on disk we avoid the pwsh quoting hell entirely.
 *
 * Reads from env (set by the VS Code task `options.env`):
 *   GEMMA_PROMPT       required
 *   GEMMA_SYSTEM       optional (default: legal-AI assistant system prompt)
 *   GEMMA_MAX_TOKENS   optional (default 1024)
 *   GEMMA_TEMP         optional (default 0.3)
 *   GEMMA_BASE         optional (default http://localhost:8090)
 *
 * Output is plain text — Gemma4 reply + a small Tokens/Model/Finish footer.
 */

const q = process.env.GEMMA_PROMPT;
if (!q) {
  console.error('No prompt set');
  process.exit(1);
}

const sys = process.env.GEMMA_SYSTEM
  ?? 'You are a legal AI assistant specializing in case law, evidence rules, and document analysis.';
const maxTok = parseInt(process.env.GEMMA_MAX_TOKENS ?? '1024', 10);
const temp = parseFloat(process.env.GEMMA_TEMP ?? '0.3');
const base = process.env.GEMMA_BASE ?? 'http://localhost:8090';

console.log(`\n🦙 Querying TurboQuant at ${base} ...\n`);

try {
  const res = await fetch(`${base}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'gemma4-legal',
      messages: [
        { role: 'system', content: sys },
        { role: 'user', content: q },
      ],
      max_tokens: maxTok,
      temperature: temp,
      stream: false,
    }),
  });

  const d = await res.json();

  if (d.error) {
    console.error('Error:', JSON.stringify(d.error));
    process.exit(1);
  }

  const reply = d.choices?.[0]?.message?.content ?? '(no content)';
  console.log(reply);
  console.log('\n---');
  console.log(
    `Tokens: prompt=${d.usage?.prompt_tokens} completion=${d.usage?.completion_tokens} total=${d.usage?.total_tokens}`
  );
  console.log('Model:', d.model, 'Finish:', d.choices?.[0]?.finish_reason);
} catch (e) {
  console.error(`\n❌ TurboQuant not reachable on ${base}`);
  console.error("   Start it with: '⚡ TurboQuant: Start (text-only :8090)'");
  console.error('   Error:', e?.message ?? e);
  process.exit(1);
}
