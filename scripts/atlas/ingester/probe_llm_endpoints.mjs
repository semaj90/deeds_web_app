import { setTimeout } from 'node:timers/promises';
import fetch from 'node-fetch';

const ports = [11434,11400,8080,8000,5000,9090,8090,11443];
const paths = ['/', '/api/generate', '/v1/generate', '/v1/chat/completions', '/generate'];

async function probe(){
  for(const p of ports){
    for(const path of paths){
      const url = `http://localhost:${p}${path}`;
      try{
        const controller = new AbortController();
        const id = setTimeout(2000).then(()=>controller.abort());
        const res = await fetch(url, { method: 'GET', signal: controller.signal });
        console.log(`${p} ${path} -> ${res.status}`);
      }catch(e){
        console.log(`${p} ${path} -> ${e.name||e.message}`);
      }
    }
  }
}

probe().catch(e=>{ console.error('probe error', e); process.exit(1); });
