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

export async function getNeo4jHealth(): Promise<{
    ok: boolean;
    serverVersion?: string;
    error?: string;
}> {
    try {
        const driver = getNeo4jDriver();
        const info = await driver.getServerInfo();
        return { ok: true, serverVersion: String(info.protocolVersion) };
    } catch (err) {
        return { ok: false, error: String(err) };
    }
}
