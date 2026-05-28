// scripts/opencode/smoke-searxng.mjs

const base =
  process.env.SEARXNG_INSTANCE || 'http://localhost:8889';

const url =
  `${base.replace(/\/$/, '')}/search?q=opencode%20webfetch&format=json`;

async function main() {
  let res;
  let text;

  try {
    res = await fetch(url, {
      headers: {
        accept: 'application/json'
      }
    });

    text = await res.text();
  } catch (err) {
    console.error('[searxng] FAIL: connection/request error');
    console.error(String(err));
    process.exit(1);
  }

  if (text.trim().startsWith('<')) {
    console.error('[searxng] FAIL: HTML returned instead of JSON');
    console.error(JSON.stringify({
      status: res.status,
      contentType: res.headers.get('content-type'),
      preview: text.slice(0, 1000)
    }, null, 2));
    process.exit(2);
  }

  let json;

  try {
    json = JSON.parse(text);
  } catch (err) {
    console.error('[searxng] FAIL: JSON parse error');

    console.error(JSON.stringify({
      status: res.status,
      contentType: res.headers.get('content-type'),
      preview: text.slice(0, 1000)
    }, null, 2));

    process.exit(3);
  }

  if (!Array.isArray(json.results)) {
    console.error('[searxng] FAIL: missing results array');
    console.error(JSON.stringify({ keys: Object.keys(json) }, null, 2));
    process.exit(4);
  }

  console.log('[searxng] PASS');

  console.log(JSON.stringify({
    base,
    results: json.results.length,
    sample: json.results[0]?.title || null
  }, null, 2));
}

main().catch(err => {
  console.error('[searxng] FATAL: Execution error', err);
  process.exit(1);
});