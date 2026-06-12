import neo4j, { type Driver } from 'neo4j-driver';
import { ENV } from './env.server.js';

let cachedDriver: Driver | null = null;

export function getNeo4jDriver(): Driver {
    if (cachedDriver) return cachedDriver;

    const uri      = ENV.NEO4J_URI;
    const user     = ENV.NEO4J_USER;
    const password = ENV.NEO4J_PASSWORD;

    cachedDriver = neo4j.driver(uri, neo4j.auth.basic(user, password), {
        disableLosslessIntegers: true,
        connectionTimeout: 5000,
        maxTransactionRetryTime: 0,
    });

    return cachedDriver;
}

export async function closeNeo4jDriver() {
    if (cachedDriver) {
        await cachedDriver.close();
        cachedDriver = null;
    }
}
