import fs from 'fs/promises';
import fetch from 'node-fetch';

const SEED_PATH = new URL('../seeds/persons-seed.json', import.meta.url);
const API = process.env.API_URL || 'http://localhost:5173/api/persons-of-interest';

async function main() {
  try {
    const raw = await fs.readFile(SEED_PATH, 'utf-8');
    const payload = JSON.parse(raw);
    console.log('Seeding persons to', API);
    for (const person of payload.persons || []) {
      const res = await fetch(API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(person)
      });
      if (!res.ok) {
        console.error('Failed to seed person', person.id, await res.text());
      } else {
        const body = await res.json();
        console.log('Seeded:', body.id || person.id);
      }
    }
    console.log('Seeding complete');
  } catch (err) {
    console.error('Seeding failed', err);
    process.exit(1);
  }
}

main();
