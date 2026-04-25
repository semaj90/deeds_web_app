#!/usr/bin/env node
import fetch from 'node-fetch';

async function main(){
  try {
    const r = await fetch('http://127.0.0.1:8001/health');
    const t = await r.text();
    console.log(`GET /health -> ${r.status}`);
    console.log(t);
  } catch(e){
    console.error('FastEmbed health failed:', e.message);
    process.exit(1);
  }
}

main();
