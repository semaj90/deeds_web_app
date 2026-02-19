import fs from "fs";
import http from "http";
import https from "https";

const TOP_FILES_PATH = process.argv[2] || "svelte-check-errors-index/top-files.json";
const OUT_PATH = process.argv[3] || "svelte-top-files-solutions.md";
const MAX_FILES = Number(process.env.OLLAMA_MAX_FILES || 50);
const OLLAMA_URL = process.env.OLLAMA_URL || "http://localhost:11434";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "gemma3-legal:latest";
const GPU_LAYERS = Number(process.env.GPU_LAYERS || 28);
const NUM_GPU = process.env.NUM_GPU ? Number(process.env.NUM_GPU) : undefined;

function requestJson(urlStr, body) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlStr);
    const lib = u.protocol === 'https:' ? https : http;
    const req = lib.request({ method: 'POST', hostname: u.hostname, port: u.port, path: u.pathname, headers: { 'Content-Type': 'application/json' } }, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch (e) { reject(e); } });
    });
    req.on('error', reject);
    req.write(JSON.stringify(body));
    req.end();
  });
}

function buildPrompt(files) {
  const list = files.map((f, i) => `${i+1}. (${f.count}) ${f.file}`).join("\n");
  return `We have a large SvelteKit + TypeScript repo. Provide targeted, minimal suggestions per file to eliminate recurring diagnostics. For each file, give:
- Likely root-cause categories (1-2 bullets)
- Specific change suggestions (bulleted, include import/alias/typing notes)
- If global config change is needed, mention it once at the end

TOP FILES (by error count):
${list}
`;
}

async function main() {
  if (!fs.existsSync(TOP_FILES_PATH)) {
    console.error(`Input not found: ${TOP_FILES_PATH}`);
    process.exit(1);
  }
  const arr = JSON.parse(fs.readFileSync(TOP_FILES_PATH, 'utf8'));
  const top = arr.slice(0, MAX_FILES);
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
  const res = await requestJson(url, payload);
  const content = res?.message?.content || res?.choices?.[0]?.message?.content || String(res);
  fs.writeFileSync(OUT_PATH, String(content));
  console.log(`Wrote ${OUT_PATH} for ${top.length} files using ${OLLAMA_MODEL}.`);
}

main();

