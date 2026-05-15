import neo4j from 'neo4j-driver';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const uri = process.env.NEO4J_URI || 'bolt://localhost:7687';
const user = process.env.NEO4J_USER || 'neo4j';
const password = process.env.NEO4J_PASSWORD || 'password';

console.log(`Connecting to Neo4j at ${uri} as ${user}...`);

async function test() {
  const driver = neo4j.driver(uri, neo4j.auth.basic(user, password));
  const session = driver.session();
  try {
    const result = await session.run('RETURN "Connection Successful" as msg');
    console.log('✅', result.records[0].get('msg'));
  } catch (err) {
    console.error('❌ Neo4j Connection Failed:', err.message);
  } finally {
    await session.close();
    await driver.close();
  }
}

test();
