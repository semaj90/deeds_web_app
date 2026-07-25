
// poc_amqp_diagnostics.mjs

import * as amqp from 'amqplib';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

// --- 1. Environment Loading/Discovery Simulation ---
// NOTE: In a real scenario, we would need the specific loader logic 
// (e.g., calling process.env setup or using a specific config module).
// For this POC, we assume the variables are loaded into the process scope 
// before execution, as per the assumed application startup contract.
dotenv.config({ path: '.env.local' }); // Assuming .env.local is the source
const env = process.env;

// --- 2. Configuration Extraction ---
const RABBITMQ_URL = env.RABBITMQ_URL; // e.g., "amqp://guest:guest@localhost:5672"
const AMQP_HOST = env.RABBITMQ_HOST;
const AMQP_PORT = env.RABBITMQ_PORT;
const AMQP_USER = env.RABBITMQ_USER;
const AMQP_PASS = env.RABBITMQ_PASS;

/**
 * Executes a non-destructive AMQP connection test.
 * @returns {object} Contains connection status and errors.
 */
async function testAmqpConnection() {
    const result = {
        timestamp: new Date().toISOString(),
        amqp_connected: false,
        protocol_status: "UNTESTED",
        host_reachable: false,
        credentials_valid: false,
        errors: [],
        connection_attempt: {
            url_used: RABBITMQ_URL || "N/A",
            status_code: 0, // 0 = failure, 1 = success
            message: "No attempt made"
        }
    };

    if (!RABBITMQ_URL) {
        result.errors.push("RABBITMQ_URL environment variable not found in the process environment.");
        return result;
    }

    console.log("Attempting non-destructive AMQP connection test...");
    
    let connection;
    try {
        // Attempt connection using the full URL (best practice)
        connection = await amqp.connect(RABBITMQ_URL, { clientInitialTimeout: 5000 });
        
        // Connection succeeded. Now attempt to use a non-destructive channel operation.
        const channel = await connection.createChannel();
        
        // Use a non-destructive operation: declare an exchange.
        // This requires the channel to be active and authenticated.
        await channel.exchangeDeclare('test_diagnostics_exchange', 'direct', { durable: true });
        
        await channel.close();
        await connection.close();
        
        result.amqp_connected = true;
        result.protocol_status = "SUCCESS";
        result.credentials_valid = true;
        result.connection_attempt.status_code = 1;
        result.connection_attempt.message = "Successfully connected and declared a test exchange.";
        
    } catch (e) {
        // This catches connection refusals, auth failures, or operation errors.
        result.errors.push(`Connection/Operation Failed: ${e.message}`);
        result.connection_attempt.status_code = 0;
        result.connection_attempt.message = `Failed to connect or perform operation. Check ${e.message}`;
    }

    return result;
}


// --- 3. Execution Logic ---
async function runTest() {
    console.log("--- AMQP DIAGNOSTICS SCRIPT RUNNING ---");
    const result = await testAmqpConnection();
    
    console.log("\n=====================================");
    console.log("     AMQP DIAGNOSTICS SUMMARY");
    console.log("=====================================");
    
    if (result.amqp_connected) {
        console.log("✅ AMQP CONNECTION: SUCCESS");
        console.log("  > Status: Connected and non-destructive test operations succeeded.");
    } else {
        console.error("❌ AMQP CONNECTION: FAILED");
        result.errors.forEach(err => console.error(`  - ${err}`));
    }
    console.log("-------------------------------------\n");
    
    // Output the raw result JSON to a file for audit/retrieval
    const outputPath = path.join(process.cwd(), "poc_amqp_diagnostic_result.json");
    fs.writeFileSync(outputPath, JSON.stringify(result, null, 2));
    console.log(`[AUDIT] Diagnostics saved raw JSON to: ${outputPath}`);
}

runTest();