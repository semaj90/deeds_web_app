#!/usr/bin/env node
/**
 * log-server.mjs — Live log tail server for the GPU dev stack
 *
 * Watches the latest log file from each service directory and streams
 * new lines to connected browsers via SSE.
 *
 * Port: 7788  →  http://127.0.0.1:7788
 *
 * Usage:
 *   node scripts/log-server.mjs
 *   node scripts/log-server.mjs --port=9999
 *
 * npm script:  npm run log:server
 * npm script:  npm run log:server:open   (opens browser automatically)
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const LOGS_ROOT = path.join(REPO_ROOT, 'logs');
const PORT_ARG = process.argv.find(a => a.startsWith('--port='));
const PORT = PORT_ARG ? parseInt(PORT_ARG.split('=')[1]) : 7788;
const TAIL_LINES = 200;   // lines of history sent on connect
const POLL_MS = 500;      // filesystem poll interval

// ── Service definitions ───────────────────────────────────────────────────────
// Each service has a log directory; we watch the latest file there.
// Static files (fixed name) are watched directly.

const SERVICES = [
  {
    id: 'turboquant',
    label: 'TurboQuant (Gemma4 :8090)',
    dir: path.join(LOGS_ROOT, 'turboquant'),
    pattern: /^launch-.*\.out$/,
    color: '#7c3aed',
  },
  {
    id: 'turboquant-err',
    label: 'TurboQuant stderr',
    dir: path.join(LOGS_ROOT, 'turboquant'),
    pattern: /^launch-.*\.err$/,
    color: '#dc2626',
  },
  {
    id: 'embed-server',
    label: 'ONNX Embed Server (:8081)',
    dir: path.join(REPO_ROOT, 'logs'),
    pattern: /^engram-embed-stdout\.log$/,
    color: '#0891b2',
  },
  {
    id: 'embed-server-err',
    label: 'ONNX Embed stderr',
    dir: path.join(REPO_ROOT, 'logs'),
    pattern: /^engram-embed-stderr\.log$/,
    color: '#b45309',
  },
  {
    id: 'trace-mcp',
    label: 'TRACE MCP (:8788)',
    dir: path.join(LOGS_ROOT, 'mcp'),
    pattern: /^grpc-bridge\.out\.log$/,
    color: '#059669',
  },
  {
    id: 'trace-mcp-err',
    label: 'TRACE MCP stderr',
    dir: path.join(LOGS_ROOT, 'mcp'),
    pattern: /^grpc-bridge\.err\.log$/,
    color: '#dc2626',
  },
  {
    id: 'turbovec',
    label: 'TurboVec (:8791)',
    dir: path.join(LOGS_ROOT, 'dev-server'),
    pattern: /^turbovec-python-8791\.out\.log$/,
    color: '#d97706',
  },
  {
    id: 'dev-server',
    label: 'Vite dev (:5173)',
    dir: path.join(LOGS_ROOT, 'sveltekit-frontend', 'dev-server'),
    pattern: /^dev-server.*\.log$/,
    staticFallback: path.join(REPO_ROOT, 'logs', 'dev-server.log'),
    color: '#f59e0b',
  },
  {
    id: 'phase7',
    label: 'Phase7 Workers',
    dir: path.join(LOGS_ROOT, 'sveltekit-frontend'),
    pattern: /^phase7-worker-combined.*\.log$/,
    color: '#6366f1',
  },
  {
    id: 'atlas-indexer',
    label: 'Atlas Indexer (summaries→Qdrant)',
    dir: path.join(LOGS_ROOT, 'task-output'),
    pattern: /^atlas-summaries.*\.log$/,
    color: '#8b5cf6',
  },
  {
    id: 'reranker',
    label: 'Mixedbread Reranker (:8099)',
    staticFallback: path.join(REPO_ROOT, 'logs', 'reranker-stdout.log'),
    color: '#10b981',
  },
  {
    id: 'reranker-err',
    label: 'Reranker stderr',
    staticFallback: path.join(REPO_ROOT, 'logs', 'reranker-stderr.log'),
    color: '#dc2626',
  },
];

// ── File watcher state ────────────────────────────────────────────────────────

// Map<serviceId, { filePath, size, watchers: Set<(line)=>void> }>
const watchers = new Map();

function latestFile(dir, pattern) {
  try {
    const files = fs.readdirSync(dir)
      .filter(f => pattern.test(f))
      .map(f => ({ name: f, mtime: fs.statSync(path.join(dir, f)).mtime }))
      .sort((a, b) => b.mtime - a.mtime);
    return files[0] ? path.join(dir, files[0].name) : null;
  } catch {
    return null;
  }
}

function tailFile(filePath, n) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n').filter(Boolean);
    return lines.slice(-n).join('\n');
  } catch {
    return '';
  }
}

function initWatcher(svc) {
  const state = { filePath: null, size: 0, clients: new Set() };
  watchers.set(svc.id, state);

  function resolveFile() {
    const f = (svc.dir && svc.pattern ? latestFile(svc.dir, svc.pattern) : null) || svc.staticFallback || null;
    if (f !== state.filePath) {
      state.filePath = f;
      state.size = f ? (fs.statSync(f).size || 0) : 0;
    }
    return f;
  }

  setInterval(() => {
    const filePath = resolveFile();
    if (!filePath || state.clients.size === 0) return;
    try {
      const stat = fs.statSync(filePath);
      if (stat.size <= state.size) return;
      const fd = fs.openSync(filePath, 'r');
      const buf = Buffer.alloc(stat.size - state.size);
      fs.readSync(fd, buf, 0, buf.length, state.size);
      fs.closeSync(fd);
      state.size = stat.size;
      const chunk = buf.toString('utf8');
      const lines = chunk.split('\n').filter(Boolean);
      for (const line of lines) {
        for (const cb of state.clients) cb(line);
      }
    } catch {
      // file may have rotated — reset size
      state.size = 0;
    }
  }, POLL_MS);
}

for (const svc of SERVICES) initWatcher(svc);

// ── HTML UI ───────────────────────────────────────────────────────────────────

const HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>GPU Dev Stack — Log Server</title>
<style>
  :root { --bg:#0f0f0f; --panel:#1a1a1a; --border:#2a2a2a; --text:#e2e8f0; --dim:#64748b; }
  * { box-sizing:border-box; margin:0; padding:0; }
  body { background:var(--bg); color:var(--text); font-family:'Cascadia Code',monospace; font-size:12px; display:flex; flex-direction:column; height:100vh; overflow:hidden; }
  header { padding:8px 16px; border-bottom:1px solid var(--border); display:flex; align-items:center; gap:12px; flex-shrink:0; }
  header h1 { font-size:14px; font-weight:600; }
  header .status { font-size:11px; color:var(--dim); }
  #tabs { display:flex; gap:4px; padding:6px 8px; border-bottom:1px solid var(--border); flex-shrink:0; flex-wrap:wrap; }
  .tab { padding:3px 10px; border-radius:4px; cursor:pointer; border:1px solid transparent; font-size:11px; transition:all .15s; white-space:nowrap; }
  .tab:hover { border-color:var(--border); }
  .tab.active { background:var(--panel); border-color:var(--border); }
  .tab .dot { display:inline-block; width:6px; height:6px; border-radius:50%; margin-right:5px; }
  #panes { flex:1; overflow:hidden; position:relative; }
  .pane { position:absolute; inset:0; display:none; flex-direction:column; }
  .pane.active { display:flex; }
  .pane-header { padding:6px 12px; background:var(--panel); border-bottom:1px solid var(--border); font-size:11px; color:var(--dim); display:flex; align-items:center; gap:8px; flex-shrink:0; }
  .pane-header .file { font-size:10px; color:var(--dim); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; flex:1; }
  .clear-btn { padding:2px 8px; border-radius:3px; border:1px solid var(--border); background:transparent; color:var(--dim); cursor:pointer; font-size:10px; }
  .clear-btn:hover { color:var(--text); }
  .log { flex:1; overflow-y:auto; padding:8px 12px; font-size:11px; line-height:1.55; word-break:break-all; white-space:pre-wrap; }
  .log .line { padding:1px 0; }
  .log .line.err { color:#fca5a5; }
  .log .line.warn { color:#fde68a; }
  .log .line.ok { color:#6ee7b7; }
  .log .line.info { color:#93c5fd; }
  .log .ts { color:var(--dim); margin-right:6px; user-select:none; }
  .badge { padding:1px 5px; border-radius:3px; font-size:9px; background:var(--border); margin-left:4px; }
  #scroll-lock { padding:4px 12px; display:flex; align-items:center; gap:8px; border-top:1px solid var(--border); flex-shrink:0; font-size:11px; color:var(--dim); }
  input[type=checkbox] { accent-color:#7c3aed; }
  .new-lines { color:#a78bfa; font-weight:600; }
</style>
</head>
<body>
<header>
  <h1>⚡ GPU Dev Stack Logs</h1>
  <span class="status" id="conn-status">Connecting…</span>
  <span class="status" id="uptime"></span>
</header>
<div id="tabs"></div>
<div id="panes"></div>
<div id="scroll-lock">
  <label><input type="checkbox" id="auto-scroll" checked> Auto-scroll</label>
  <span id="line-count"></span>
</div>
<script>
const SERVICES = ${JSON.stringify(SERVICES.map(s => ({ id: s.id, label: s.label, color: s.color })))};
const startTime = Date.now();
let activeId = SERVICES[0].id;
const paneCounts = {};
const paneElems = {};
const tabElems = {};

function colorClass(line) {
  const l = line.toLowerCase();
  if (/error|fatal|failed|✗|❌/.test(l)) return 'err';
  if (/warn|warning|⚠/.test(l)) return 'warn';
  if (/✅|✓|success|ready|started|listening|complete/.test(l)) return 'ok';
  if (/info|→|loading|starting|indexing|progress/.test(l)) return 'info';
  return '';
}

function appendLine(id, text, isHistory=false) {
  const pane = paneElems[id];
  if (!pane) return;
  const log = pane.querySelector('.log');
  paneCounts[id] = (paneCounts[id] || 0) + 1;

  const div = document.createElement('div');
  div.className = 'line ' + colorClass(text);
  const ts = document.createElement('span');
  ts.className = 'ts';
  ts.textContent = isHistory ? '' : new Date().toLocaleTimeString('en-US', { hour12:false });
  div.appendChild(ts);
  div.appendChild(document.createTextNode(text));
  log.appendChild(div);

  if (document.getElementById('auto-scroll').checked && id === activeId) {
    log.scrollTop = log.scrollHeight;
  }
  // Update tab badge if not active
  if (id !== activeId && !isHistory) {
    const dot = tabElems[id]?.querySelector('.dot');
    if (dot) dot.style.animation = 'pulse 1s';
  }
  if (id === activeId) {
    document.getElementById('line-count').textContent = paneCounts[id] + ' lines';
  }
}

// Build UI
const tabsEl = document.getElementById('tabs');
const panesEl = document.getElementById('panes');

for (const svc of SERVICES) {
  paneCounts[svc.id] = 0;
  // Tab
  const tab = document.createElement('div');
  tab.className = 'tab' + (svc.id === activeId ? ' active' : '');
  tab.innerHTML = \`<span class="dot" style="background:\${svc.color}"></span>\${svc.label}\`;
  tab.onclick = () => activate(svc.id);
  tabsEl.appendChild(tab);
  tabElems[svc.id] = tab;

  // Pane
  const pane = document.createElement('div');
  pane.className = 'pane' + (svc.id === activeId ? ' active' : '');
  pane.innerHTML = \`
    <div class="pane-header">
      <span class="dot" style="background:\${svc.color}"></span>
      <strong>\${svc.label}</strong>
      <span class="file" id="file-\${svc.id}">waiting for log file…</span>
      <button class="clear-btn" onclick="clearPane('\${svc.id}')">Clear</button>
    </div>
    <div class="log" id="log-\${svc.id}"></div>\`;
  panesEl.appendChild(pane);
  paneElems[svc.id] = pane;
}

function activate(id) {
  activeId = id;
  for (const svc of SERVICES) {
    tabElems[svc.id].classList.toggle('active', svc.id === id);
    paneElems[svc.id].classList.toggle('active', svc.id === id);
  }
  document.getElementById('line-count').textContent = (paneCounts[id] || 0) + ' lines';
  if (document.getElementById('auto-scroll').checked) {
    const log = paneElems[id].querySelector('.log');
    log.scrollTop = log.scrollHeight;
  }
}

function clearPane(id) {
  const log = paneElems[id].querySelector('.log');
  log.innerHTML = '';
  paneCounts[id] = 0;
}

// SSE connections per service
for (const svc of SERVICES) {
  const es = new EventSource('/stream/' + svc.id);
  es.addEventListener('history', e => {
    const { lines, file } = JSON.parse(e.data);
    const fileEl = document.getElementById('file-' + svc.id);
    if (fileEl && file) fileEl.textContent = file;
    for (const l of lines) appendLine(svc.id, l, true);
  });
  es.addEventListener('line', e => {
    const { text, file } = JSON.parse(e.data);
    const fileEl = document.getElementById('file-' + svc.id);
    if (fileEl && file) fileEl.textContent = file;
    appendLine(svc.id, text);
  });
  es.onopen = () => {
    document.getElementById('conn-status').textContent = '● Connected';
    document.getElementById('conn-status').style.color = '#6ee7b7';
  };
  es.onerror = () => {
    document.getElementById('conn-status').textContent = '○ Reconnecting…';
    document.getElementById('conn-status').style.color = '#fca5a5';
  };
}

setInterval(() => {
  const s = Math.floor((Date.now() - startTime) / 1000);
  const m = Math.floor(s / 60), sec = s % 60;
  document.getElementById('uptime').textContent = \`uptime \${m}m\${sec}s\`;
}, 1000);
</script>
</body>
</html>`;

// ── HTTP server ───────────────────────────────────────────────────────────────

const server = http.createServer((req, res) => {
  // SSE stream per service
  const sseMatch = req.url?.match(/^\/stream\/(.+)$/);
  if (sseMatch) {
    const id = sseMatch[1];
    const state = watchers.get(id);
    const svc = SERVICES.find(s => s.id === id);
    if (!state || !svc) { res.writeHead(404); res.end(); return; }

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    });
    res.write(':\n\n'); // ping

    // Send history
    const filePath = latestFile(svc.dir, svc.pattern) || svc.staticFallback || null;
    if (filePath) {
      const history = tailFile(filePath, TAIL_LINES);
      const lines = history.split('\n').filter(Boolean);
      res.write(`event: history\ndata: ${JSON.stringify({ lines, file: filePath })}\n\n`);
      state.filePath = filePath;
      state.size = fs.existsSync(filePath) ? fs.statSync(filePath).size : 0;
    } else {
      res.write(`event: history\ndata: ${JSON.stringify({ lines: ['(no log file found yet)'], file: null })}\n\n`);
    }

    // Register live callback
    const send = (line) => {
      try {
        res.write(`event: line\ndata: ${JSON.stringify({ text: line, file: state.filePath })}\n\n`);
      } catch { state.clients.delete(send); }
    };
    state.clients.add(send);
    req.on('close', () => state.clients.delete(send));
    return;
  }

  // Service list JSON
  if (req.url === '/services') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(SERVICES.map(s => ({
      id: s.id, label: s.label, color: s.color,
      file: (() => {
        const st = watchers.get(s.id);
        return st?.filePath ?? null;
      })(),
    }))));
    return;
  }

  // Health check
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, port: PORT, services: SERVICES.length }));
    return;
  }

  // Serve browser UI
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(HTML);
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`\n⚡ Log server running at http://127.0.0.1:${PORT}`);
  console.log(`   Services: ${SERVICES.map(s => s.id).join(', ')}`);
  console.log(`   Logs root: ${LOGS_ROOT}`);
  console.log(`   Poll interval: ${POLL_MS}ms\n`);
});

server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} already in use. Use --port=NNNN to change.`);
  } else {
    console.error('Server error:', e.message);
  }
  process.exit(1);
});
