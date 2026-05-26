import { json } from '@sveltejs/kit'

export async function POST({ request }) {
  const body = await request.json()
  try {
    // delegate to server-side ingestion library
    // dynamic import to keep bundler friendly
    const mod = await import('$lib/server/memory/claude-mem-ingest.js')
    if (typeof mod.ingestObservations !== 'function') {
      return json({ ok: false, error: 'ingestObservations not available' }, { status: 500 })
    }
    const observations = Array.isArray(body) ? body : [body]
    const result = await mod.ingestObservations(observations)
    return json({ ok: true, result }, { status: 200 })
  } catch (err) {
    return json({ ok: false, error: String(err) }, { status: 500 })
  }
}
