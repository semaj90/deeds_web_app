import 'dotenv/config';
import { synthesizeCommunityRelationships } from '../../src/lib/server/graph/relationship-synthesizer.js';

async function main() {
  await synthesizeCommunityRelationships();
}

main().catch(console.error);
