#!/usr/bin/env node
// Seed a small Qdrant collection with example vectors for local testing
import fetch from 'node-fetch'

const QDRANT = process.env.QDRANT_URL || 'http://localhost:6333'
const COLLECTION = process.env.QDRANT_COLLECTION || 'demo_docs'

async function main(){
  console.log('Creating collection', COLLECTION)
  await fetch(`${QDRANT}/collections/${COLLECTION}`, {
    method: 'PUT', headers: {'Content-Type':'application/json'},
    body: JSON.stringify({ vectors: { size: 4, distance: 'Cosine' } })
  }).then(r=>r.text()).then(t=>console.log(t)).catch(e=>console.error(e))

  const points = [
    { id: 1, vector: [0.1,0.2,0.3,0.4], payload: { title: 'Alpha', text: 'Document alpha' } },
    { id: 2, vector: [0.2,0.1,0.4,0.3], payload: { title: 'Beta', text: 'Document beta' } },
    { id: 3, vector: [0.9,0.1,0.0,0.0], payload: { title: 'Gamma', text: 'Document gamma' } }
  ]

  console.log('Upserting points')
  await fetch(`${QDRANT}/collections/${COLLECTION}/points`, {
    method: 'PUT', headers: {'Content-Type':'application/json'},
    body: JSON.stringify({ points })
  }).then(r=>r.text()).then(t=>console.log(t)).catch(e=>console.error(e))
}

main().catch(e=>{ console.error(e); process.exit(1) })
