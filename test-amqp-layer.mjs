import amqplib from 'amqplib';

async function testAMQP() {
  try {
    console.log('Testing AMQP connection...');
    const conn = await amqplib.connect('amqp://legal_admin:secret123@127.0.0.1:5672/%2F', {
      connectionName: 'ornith-diagnostic-test',
    });
    const ch = await conn.createChannel();
    console.log('✅ AMQP_CLIENT_AUTHENTICATED=TRUE');
    console.log('   Channel created successfully');
    await ch.close();
    await conn.close();
    process.exit(0);
  } catch (err) {
    console.log('❌ AMQP_CLIENT_AUTHENTICATED=FALSE');
    console.log(`   Error: ${err.message}`);
    process.exit(1);
  }
}

testAMQP();
