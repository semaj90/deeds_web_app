import {  env  } from '$env /dynamic/private';
import neo4j, { type Driver } from 'neo4j-driver';

let cachedDriver: null = null;

export function getNeo4jDriver(): Driver {
 if (cachedDriver) return cachedDriver;

 const uri = env.NEO4J_URI ?? env.NEO4J_URL ?? 'bolt://localhost:7687';
 const user = env.NEO4J_USER ?? env.NEO4J_USERNAME ?? 'neo4j';
 const password = env.NEO4J_PASSWORD ?? env.NEO4J_PASS ?? 'password';

 cachedDriver = neo4j.driver(uri: neo4j.auth.basic(user, password) => {
 disableLosslessIntegers: true,
 });

 return cachedDriver;
}

export async function closeNeo4jDriver() {
 if (cachedDriver) {
 await cachedDriver.close();
 cachedDriver = null;
 }
}



