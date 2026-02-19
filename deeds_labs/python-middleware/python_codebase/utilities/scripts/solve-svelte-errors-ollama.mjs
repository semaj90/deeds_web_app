import fs from "fs";
import http from "http";
import https from "https";
import { URL } from "url";

const TOP_PATH = process.argv[2] || "svelte-top100.json";
const OUT_PATH = process.argv[3] || "svelte-top100-solutions.md";
const MAX_ITEMS = Number(process.env.OLLAMA_MAX || 20);
const OLLAMA_URL = process.env.OLLAMA_URL || "http://localhost:11434";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "gemma3-legal:latest";
const GPU_LAYERS = Number(process.env.GPU_LAYERS || 28);
const NUM_GPU = process.env.NUM_GPU ? Number(process.env.NUM_GPU) : undefined;

function requestJson(urlStr, body) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlStr);
    const lib = u.protocol === 'https:' ? https : http;
    const req = lib.request({
      method: 'POST',
      hostname: u.hostname,
      port: u.port,
      path: u.pathname,
      headers: { 'Content-Type': 'application/json' }
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.write(JSON.stringify(body));
    req.end();
  });
}

function buildPrompt(topEntries) {
  const list = topEntries.map(([msg, count], i) => `${i+1}. (${count}) ${msg}`).join("\n");
  return `You are an expert SvelteKit + TypeScript troubleshooter.
Project context:
- Framework: SvelteKit 5, TS 5.x, vite
- Large workspace; want systematic, safe fixes

Task: For each of the following common diagnostics, provide:
- Root cause patterns (1-2 lines)
- Safe fix steps (bulleted)
- Quick code snippets if helpful
- Suggested repo-wide mitigations (tsconfig, svelte config, path aliases)

TOP ERRORS:
${list}

Output format:
## <short name>
- Root Cause: ...
- Fix: ...
- Snippet: \n\n\`\`\`ts
// example or command
\`\`\`
- Mitigations: ...
`;
}

async function main() {
  if (!fs.existsSync(TOP_PATH)) {
    console.error(`Top file not found: ${TOP_PATH}`);
    process.exit(1);
  }
  const json = JSON.parse(fs.readFileSync(TOP_PATH, 'utf8'));
  // json may be object of message->count OR array; normalize to array of [msg,count]
  let entries;
  if (Array.isArray(json)) {
    entries = json.map(e => [e.message || e[0], e.count || e[1]]);
  } else {
    entries = Object.entries(json);
  }
  const top = entries.sort((a,b)=>b[1]-a[1]).slice(0, MAX_ITEMS);
  const prompt = buildPrompt(top);

  const payload = {
    model: OLLAMA_MODEL,
    messages: [
      { role: 'system', content: 'Be concise, precise, and safe. Provide SvelteKit+TS fixes.' },
      { role: 'user', content: prompt }
    ],
    stream: false,
    options: {
      gpu_layers: GPU_LAYERS,
      ...(NUM_GPU ? { num_gpu: NUM_GPU } : {})
    }
  };

  const url = OLLAMA_URL.endsWith('/') ? `${OLLAMA_URL}api/chat` : `${OLLAMA_URL}/api/chat`;
  let result;
  try {
    result = await requestJson(url, payload);
  } catch (e) {
    console.error('Ollama request failed:', e.message);
    process.exit(1);
  }

  const content = result?.message?.content || result?.choices?.[0]?.message?.content || String(result);
  fs.writeFileSync(OUT_PATH, String(content), 'utf8');
  console.log(`Wrote ${OUT_PATH} using ${OLLAMA_MODEL} @ ${OLLAMA_URL}`);
}

main();
