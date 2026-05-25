import { json } from '@sveltejs/kit';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';

const execAsync = promisify(exec);

export async function POST({ request }) {
  const { query } = await request.json();
  if (!query) {
    return json({ error: "Missing query" }, { status: 400 });
  }

  const scriptPath = path.join(process.cwd(), 'scripts', 'ace', 'ask-gemma4.mjs');
  
  try {
    const { stdout } = await execAsync(`node ${scriptPath} "${query}"`);
    return json({ result: stdout });
  } catch (err) {
    return json({ error: "Ask failed", details: err.message }, { status: 500 });
  }
}
