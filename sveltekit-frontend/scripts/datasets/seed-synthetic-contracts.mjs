import fs from 'node:fs/promises';
import path from 'node:path';

const outDir = path.resolve('memory/datasets/legal-contracts/synthetic');

const syntheticContracts = [
  {
    sourceRef: 'memory/datasets/legal-contracts/synthetic/contract_001_nda.json',
    title: 'Synthetic Non-Disclosure Agreement',
    content: 'This Non-Disclosure Agreement is entered into by Alice Smith (Email: alice@example.com, Phone: 555-0199) and Bob Corp. The Confidential Information includes trade secrets. Neither party shall offer legal advice based on this document.',
    type: 'NDA'
  },
  {
    sourceRef: 'memory/datasets/legal-contracts/synthetic/contract_002_employment.json',
    title: 'Synthetic Employment Contract',
    content: 'This Employment Agreement is for John Doe (SSN: 000-11-2222). Employee agrees to work for ACME Corp. Salary is $100,000 per year. Contains intellectual property clauses.',
    type: 'Employment'
  }
];

async function seed() {
  await fs.mkdir(outDir, { recursive: true });
  for (const doc of syntheticContracts) {
    const filePath = path.join(outDir, path.basename(doc.sourceRef));
    await fs.writeFile(filePath, JSON.stringify(doc, null, 2), 'utf8');
    console.log(`[Seed] Created synthetic document: ${filePath}`);
  }
  console.log('[Seed] Finished seeding synthetic contracts.');
}

seed().catch(console.error);
