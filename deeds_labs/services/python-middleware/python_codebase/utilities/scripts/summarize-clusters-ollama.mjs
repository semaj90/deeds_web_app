import fs from "fs";
import path from "path";
import http from "http";
import https from "https";

const INDEX_DIR = path.resolve("svelte-check-errors-index");
const CLUSTERS_PATH = process.argv[2] || path.join(INDEX_DIR, "clusters.json");
const OUT_PATH = process.argv[3] || path.join(INDEX_DIR, "cluster-summaries.md");

const OLLAMA_URL = process.env.OLLAMA_URL || "http://localhost:11434";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "gemma3-legal:latest";
const GPU_LAYERS = Number(process.env.GPU_LAYERS || 28);
const NUM_GPU = process.env.NUM_GPU ? Number(process.env.NUM_GPU) : undefined;
const MAX_PER_CLUSTER = Number(process.env.SUMMARY_MAX || 10);

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

function buildPrompt(cluster) {
  const msgs = (cluster.sample || []).slice(0, MAX_PER_CLUSTER).map(s => {
    const tag = s.payload?.file ? `FILE:${s.payload.file}` : 'MSG';
    const txt = s.payload?.message || JSON.stringify(s.payload);
    return `- ${tag} ${txt}`;
  }).join('\n');
  return `Summarize this SvelteKit+TS error cluster (n=${cluster.size}). Provide:
- Root cause patterns (bulleted)
- Concrete fix steps (bulleted)
- Suggested repo-level mitigations (aliases, tsconfig, env)
Samples:\n${msgs}`;
}

async function main() {
  if (!fs.existsSync(CLUSTERS_PATH)) {
    console.error(`Clusters file not found: ${CLUSTERS_PATH}. Run clustering step first.`);
    process.exit(1);
  }
  const clusters = JSON.parse(fs.readFileSync(CLUSTERS_PATH, 'utf8')).clusters || [];
  const url = OLLAMA_URL.endsWith('/') ? `${OLLAMA_URL}api/chat` : `${OLLAMA_URL}/api/chat`;

  const sections = [];
  for (const c of clusters) {
    const payload = {
      model: OLLAMA_MODEL,
      messages: [
        { role: 'system', content: 'Be concise, precise, and safe. Provide SvelteKit+TS fixes.' },
        { role: 'user', content: buildPrompt(c) }
      ],
      stream: false,
      options: { gpu_layers: GPU_LAYERS, ...(NUM_GPU ? { num_gpu: NUM_GPU } : {}) }
    };
    try {
      const res = await requestJson(url, payload);
      const content = res?.message?.content || res?.choices?.[0]?.message?.content || '';
      sections.push(`## Cluster ${c.id} (n=${c.size})\n${content}`);
    } catch (e) {
      sections.push(`## Cluster ${c.id} (n=${c.size})\n[Summarization failed: ${e.message}]`);
    }
  }
  fs.writeFileSync(OUT_PATH, sections.join('\n\n'));
  console.log(`Wrote cluster summaries to ${OUT_PATH}`);
}

main();

