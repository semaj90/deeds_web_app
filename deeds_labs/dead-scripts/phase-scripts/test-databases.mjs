import chalk from 'chalk';
import net from 'net';
import fetch from 'node-fetch';
import pg from 'pg';

const CONFIG = {
    couchdb: 'http://localhost:5984',
    qdrant: 'http://localhost:6333',
    postgres: {
        host: 'localhost',
        port: 5432,
        user: 'legal_admin',
        password: 'password',
        database: 'legal_ai_db'
    },
    minio: 'http://localhost:9000'
};

async function checkPort(host, port) {
    return new Promise((resolve) => {
        const socket = new net.Socket();
        socket.setTimeout(2000);
        socket.on('connect', () => {
            socket.destroy();
            resolve(true);
        });
        socket.on('timeout', () => {
            socket.destroy();
            resolve(false);
        });
        socket.on('error', () => {
            resolve(false);
        });
        socket.connect(port, host);
    });
}

async function checkHttp(url, name) {
    try {
        const res = await fetch(url);
        if (res.ok) {
            console.log(chalk.green(`✅ ${name} is reachable at ${url}`));
            return true;
        } else {
            console.log(chalk.yellow(`⚠️ ${name} returned ${res.status} at ${url}`));
            return false;
        }
    } catch (e) {
        console.log(chalk.red(`❌ ${name} is unreachable at ${url}: ${e.message}`));
        return false;
    }
}

async function main() {
    console.log(chalk.cyan('🔍 Testing Database Connections...'));

    // CouchDB
    await checkHttp(CONFIG.couchdb, 'CouchDB');

    // Qdrant
    await checkHttp(CONFIG.qdrant + '/collections', 'Qdrant');

    // MinIO
    await checkHttp(CONFIG.minio + '/minio/health/live', 'MinIO');

    // Postgres
    const pgReachable = await checkPort(CONFIG.postgres.host, CONFIG.postgres.port);
    if (pgReachable) {
        console.log(chalk.green(`✅ Postgres port ${CONFIG.postgres.port} is open`));
        try {
            const { Client } = pg;
            const client = new Client({
                user: 'legal_admin',
                host: 'localhost',
                database: 'legal_ai_db',
                password: '123456', // From package.json
                port: 5432,
            });

            await client.connect();
            const res = await client.query('SELECT version()');
            console.log(chalk.green(`✅ Postgres connected: ${res.rows[0].version}`));

            // Check pgvector
            try {
                const ext = await client.query("SELECT * FROM pg_extension WHERE extname = 'vector'");
                if (ext.rows.length > 0) {
                    console.log(chalk.green('✅ pgvector extension is installed'));
                } else {
                    console.log(chalk.yellow('⚠️ pgvector extension NOT found'));
                }
            } catch (e) {
                console.log(chalk.yellow(`⚠️ Failed to check pgvector: ${e.message}`));
            }

            await client.end();
        } catch (e) {
            console.log(chalk.yellow(`⚠️ Postgres connection failed (auth/db error?): ${e.message}`));
        }
    } else {
        console.log(chalk.red(`❌ Postgres port ${CONFIG.postgres.port} is closed`));
    }
}

main();
