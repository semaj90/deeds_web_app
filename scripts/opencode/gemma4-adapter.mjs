#!/usr/bin/env node
import { execFile } from 'child_process';
import { promisify } from 'util';
import fetch from 'node-fetch';

const execFileP = promisify(execFile);

async function checkMcp(){
  try{
    const res = await fetch('http://localhost:8788/health', { method: 'GET', timeout: 2000 });
    if(res.ok) return true;
  }catch(e){}
  return false;
}

async function callMcpPrompt(prompt){
  try{
    const res = await fetch('http://localhost:8788/v1/llm/infer', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ prompt }),
      timeout: 20000,
    });
    if(!res.ok) throw new Error(`mcp status ${res.status}`);
    const j = await res.json();
    return j.output || j.text || JSON.stringify(j);
  }catch(e){
    throw e;
  }
}

async function callLocalCli(prompt){
  // Fallback stub: if a gemma4 CLI exists, prefer it. Otherwise echo a placeholder.
  try{
    const { stdout } = await execFileP('gemma4', ['--prompt', prompt], { timeout: 20000 });
    return stdout.toString();
  }catch(e){
    return `[[GEMMA4-STUB]] suggestion for prompt: ${prompt.slice(0,200)}`;
  }
}

export async function isAvailable(){
  const mcp = await checkMcp();
  if(mcp) return { available: true, via: 'mcp' };
  // quick check for cli presence
  try{ await execFileP('gemma4', ['--version'], { timeout: 2000 }); return { available:true, via:'cli' }; }catch(e){}
  return { available:false };
}

export async function generate(prompt){
  const mcp = await checkMcp();
  if(mcp){
    try{ return await callMcpPrompt(prompt); }catch(e){ /* fallthrough */ }
  }
  return await callLocalCli(prompt);
}
