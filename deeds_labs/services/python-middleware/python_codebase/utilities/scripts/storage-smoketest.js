// Simple smoke test script for storage flow.
// NOTE: Update LOGIN_URL, CREDENTIALS, and host before running.

const fetch = (...args) => import('node-fetch').then(({default: f}) => f(...args));

const BASE = process.env.BASE_URL || 'http://localhost:5175';

async function run() {
  try {
    console.log('Starting storage smoke test...');
    // Placeholder: this assumes an existing session cookie is available.
    // If you have an auth endpoint, login and capture cookies.

    const key = `testfile-${Date.now()}.txt`;
    const bucket = 'legal-documents';

    // Request signed URL
    const signed = await fetch(`${BASE}/api/v1/storage/signed-url`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key, bucket })
    });

    const sj = await signed.json();
    console.log('Signed URL response:', sj);
    if (!sj.ok) throw new Error('Signed URL failed');

    // Upload directly
    const content = 'hello smoke test';
    const put = await fetch(sj.url, { method: 'PUT', body: content });
    console.log('PUT status:', put.status);
    if (put.status !== 200 && put.status !== 204) throw new Error('Upload failed');

    // Delete via server
    const del = await fetch(`${BASE}/api/v1/storage/object`, { method: 'DELETE', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ bucket, key: sj.key }) });
    console.log('Delete response:', await del.json());

    // Query audit logs (admin required)
    // const audits = await fetch(`${BASE}/api/v1/storage/audits?limit=10`, { method: 'GET', credentials: 'include' });
    // console.log('Audits:', await audits.json());

    console.log('Smoke test completed');
  } catch (e) {
    console.error('Smoke test failed:', e);
  }
}

run();
