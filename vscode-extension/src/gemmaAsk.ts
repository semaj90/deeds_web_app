/**
 * gemmaAsk.ts — Ask Gemma4/YorHA about the active editor selection.
 *
 * POSTs to the local SvelteKit OpenAI-compatible facade at
 * http://localhost:5173/api/v1/chat/completions and shows the response
 * in a VS Code output channel.
 */

import * as vscode from 'vscode';
import * as http from 'http';

const OUTPUT_CHANNEL = vscode.window.createOutputChannel('Deeds — Gemma4');
const BASE_URL = 'http://localhost:5173';

interface ChatCompletionResponse {
  choices?: Array<{ message?: { content?: string } }>;
  yorha?: {
    aceUsed?: boolean;
    contextChunks?: number;
    cacheHit?: string;
    durationMs?: number;
  };
  error?: string;
}

async function postJson(url: string, body: unknown): Promise<ChatCompletionResponse> {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const parsed = new URL(url);
    const req = http.request(
      {
        hostname: parsed.hostname,
        port: parseInt(parsed.port || '80'),
        path: parsed.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
          // Cookie-based auth flows through the SvelteKit server;
          // when no session cookie is present, the route returns 401
          // which is caught below and shown as an info message.
        },
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          try { resolve(JSON.parse(data)); }
          catch { reject(new Error(`Non-JSON response (${res.statusCode}): ${data.slice(0, 200)}`)); }
        });
      }
    );
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

export async function askGemma4AboutSelection(
  clusterKey?: string,
  graphStatus?: string
): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showWarningMessage('Deeds: Open a file and select text first.');
    return;
  }

  const selection = editor.selection;
  const selectedText = editor.document.getText(selection);
  if (!selectedText.trim()) {
    vscode.window.showWarningMessage('Deeds: Select some code or text first.');
    return;
  }

  const filePath = vscode.workspace.asRelativePath(editor.document.uri);
  const lang = editor.document.languageId;

  const contextLines: string[] = [
    `File: ${filePath}`,
    `Language: ${lang}`,
  ];
  if (clusterKey) contextLines.push(`Cluster: ${clusterKey}`);
  if (graphStatus) contextLines.push(`Graph: ${graphStatus}`);

  const prompt = [
    contextLines.join(' | '),
    '',
    '```' + lang,
    selectedText,
    '```',
    '',
    'Please explain this code, identify any risks, and suggest a safe next step.',
  ].join('\n');

  OUTPUT_CHANNEL.show(true);
  OUTPUT_CHANNEL.appendLine(`\n─── Gemma4 Ask [${new Date().toLocaleTimeString()}] ─────────────────`);
  OUTPUT_CHANNEL.appendLine(`File: ${filePath}`);
  if (clusterKey) OUTPUT_CHANNEL.appendLine(`Cluster: ${clusterKey}`);
  OUTPUT_CHANNEL.appendLine('Sending…');

  try {
    const res = await postJson(`${BASE_URL}/api/v1/chat/completions`, {
      model: 'yorha-legal',
      messages: [{ role: 'user', content: prompt }],
      file_path: filePath,
    });

    if (res.error) {
      OUTPUT_CHANNEL.appendLine(`Error: ${res.error}`);
      return;
    }

    const content = res.choices?.[0]?.message?.content ?? '(no response)';
    OUTPUT_CHANNEL.appendLine('');
    OUTPUT_CHANNEL.appendLine(content);

    if (res.yorha) {
      const y = res.yorha;
      OUTPUT_CHANNEL.appendLine(
        `\n[yorha] chunks=${y.contextChunks ?? 0} ace=${y.aceUsed} ` +
        `cache=${y.cacheHit ?? 'none'} ${y.durationMs ?? 0}ms`
      );
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    OUTPUT_CHANNEL.appendLine(`Request failed: ${msg}`);
    if (msg.includes('ECONNREFUSED')) {
      OUTPUT_CHANNEL.appendLine('→ Is the SvelteKit dev server running on port 5173?');
    }
  }
}
