import amqplib from 'amqplib';

async function testAMQP() {
  try {
    const conn = await amqplib.connect('amqp://legal_admin:secret123@127.0.0.1:5672');
    const ch = await conn.createChannel();
    console.log('✅ AMQP_LANE_VERIFIED=TRUE');
    console.log('   Connection established');
    console.log('   Channel created');
    await ch.close();
    await conn.close();
    process.exit(0);
  } catch (err) {
    console.log('❌ AMQP_LANE_FAILED=TRUE');
    console.log(`   Error: ${err.message}`);
    process.exit(1);
  }
}

testAMQP();
