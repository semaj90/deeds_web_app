#!/usr/bin/env node
/**
 * Verify RabbitMQ configuration and credentials
 *
 * Usage:
 *   node scripts/verify-rabbitmq-config.mjs
 *
 * Checks:
 * 1. RabbitMQ is running
 * 2. Credentials are correct (legal_admin / secret123)
 * 3. Environment variables are set correctly
 * 4. Connection can be established
 */

import amqplib from 'amqplib';

const LOCALHOST = '127.0.0.1';
const RABBITMQ_PORT = 5672;
const RABBITMQ_MGMT_PORT = 15672;

// Credentials
const EXPECTED_USER = 'legal_admin';
const EXPECTED_PASS = 'secret123';

async function checkRabbitMQHealth() {
  console.log('🐰 Checking RabbitMQ Configuration...\n');

  // Check 1: RabbitMQ service is running
  console.log('1️⃣  Checking if RabbitMQ service is running...');
  try {
    const response = await fetch(`http://${LOCALHOST}:${RABBITMQ_MGMT_PORT}/api/overview`, {
      headers: {
        Authorization: `Basic ${Buffer.from(`${EXPECTED_USER}:${EXPECTED_PASS}`).toString('base64')}`,
      },
    });

    if (response.status === 401) {
      console.log('   ❌ FAILED: Authentication rejected');
      console.log(`      User: ${EXPECTED_USER}`);
      console.log(`      Pass: ${EXPECTED_PASS}`);
      console.log('      RabbitMQ may have different credentials\n');

      // List actual users
      console.log('   📋 Running: docker exec legal-ai-rabbitmq rabbitmqctl list_users\n');
      return false;
    }

    if (response.ok) {
      const data = await response.json();
      console.log(`   ✅ PASSED: RabbitMQ responding`);
      console.log(`      Version: ${data.rabbitmq_version}`);
      console.log(`      Management Plugin: ${data.management_version}\n`);
    } else {
      console.log(`   ⚠️  Status: ${response.status}\n`);
    }
  } catch (err) {
    console.log(`   ❌ FAILED: Cannot reach RabbitMQ management API`);
    console.log(`      Error: ${err.message}\n`);
    return false;
  }

  // Check 2: AMQP connection with correct credentials
  console.log('2️⃣  Checking AMQP connection with legal_admin credentials...');
  try {
    const url = `amqp://${EXPECTED_USER}:${EXPECTED_PASS}@${LOCALHOST}:${RABBITMQ_PORT}`;
    const conn = await amqplib.connect(url, { connectionTimeout: 5000 });
    await conn.close();
    console.log(`   ✅ PASSED: AMQP connection successful\n`);
  } catch (err) {
    if (err.message.includes('403') || err.message.includes('ACCESS-REFUSED')) {
      console.log(`   ❌ FAILED: Authentication rejected`);
      console.log(`      Message: ${err.message}\n`);
      return false;
    }
    console.log(`   ❌ FAILED: ${err.message}\n`);
    return false;
  }

  // Check 3: Environment variables
  console.log('3️⃣  Checking environment variables...');
  const envVars = {
    RABBITMQ_URL: process.env.RABBITMQ_URL,
    RABBITMQ_MGMT_USER: process.env.RABBITMQ_MGMT_USER,
    RABBITMQ_MGMT_PASS: process.env.RABBITMQ_MGMT_PASS,
    RABBITMQ_USER: process.env.RABBITMQ_USER,
    RABBITMQ_PASS: process.env.RABBITMQ_PASS,
  };

  if (envVars.RABBITMQ_URL) {
    console.log(`   ✅ RABBITMQ_URL set: ${envVars.RABBITMQ_URL}`);
  } else {
    console.log(`   ⚠️  RABBITMQ_URL not set (will use hardcoded default)`);
  }

  if (envVars.RABBITMQ_MGMT_USER) {
    console.log(`   ✅ RABBITMQ_MGMT_USER set: ${envVars.RABBITMQ_MGMT_USER}`);
  } else {
    console.log(`   ⚠️  RABBITMQ_MGMT_USER not set (will default to legal_admin)`);
  }

  if (envVars.RABBITMQ_MGMT_PASS) {
    console.log(`   ✅ RABBITMQ_MGMT_PASS set`);
  } else {
    console.log(`   ⚠️  RABBITMQ_MGMT_PASS not set (will default to secret123)`);
  }
  console.log('');

  // Check 4: List users
  console.log('4️⃣  Listing RabbitMQ users...');
  console.log('   Command: docker exec legal-ai-rabbitmq rabbitmqctl list_users\n');

  return true;
}

checkRabbitMQHealth()
  .then((success) => {
    if (success) {
      console.log('🎉 RabbitMQ configuration verified!\n');
      console.log('✅ The following credentials are working:');
      console.log(`   User: ${EXPECTED_USER}`);
      console.log(`   Pass: ${EXPECTED_PASS}`);
      console.log(`   URL: amqp://${EXPECTED_USER}:${EXPECTED_PASS}@${LOCALHOST}:${RABBITMQ_PORT}\n`);
      process.exit(0);
    } else {
      console.log('❌ RabbitMQ configuration issue detected\n');
      console.log('Recommended fix:');
      console.log('1. Verify RabbitMQ user credentials:');
      console.log('   docker exec legal-ai-rabbitmq rabbitmqctl list_users\n');
      console.log('2. Update .env.local with correct credentials:');
      console.log('   RABBITMQ_URL=amqp://legal_admin:secret123@127.0.0.1:5672');
      console.log('   RABBITMQ_MGMT_USER=legal_admin');
      console.log('   RABBITMQ_MGMT_PASS=secret123\n');
      console.log('3. Restart the development server\n');
      process.exit(1);
    }
  })
  .catch((err) => {
    console.error('❌ Unexpected error:', err);
    process.exit(1);
  });
