import fetch from 'node-fetch';

async function tryPost(url, body){
  try{
    const res = await fetch(url, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(body), timeout: 8000 });
    const txt = await res.text();
    console.log(url, '->', res.status, txt.slice(0,1000));
  }catch(e){
    console.log(url, '-> ERROR', e.message);
  }
}

(async()=>{
  const body = { model: 'rotorquant', prompt: 'Create a short title: Test card', max_tokens: 64 };
  await tryPost('http://localhost:11434/api/generate', body);
  await tryPost('http://localhost:11434/v1/chat/completions', { messages:[{role:'user',content:'Create a short title: Test card'}], model:'rotorquant' });
  await tryPost('http://localhost:8090/api/generate', body);
  await tryPost('http://localhost:8090/v1/chat/completions', { messages:[{role:'user',content:'Create a short title: Test card'}], model:'rotorquant' });
})();
