import amqplib from 'amqplib';

const url = process.env.RABBITMQ_URL || 'amqp://legal_admin:secret123@127.0.0.1:5673/%2F';

console.log('Testing Docker AMQP connection...');
console.log(`  Endpoint: 127.0.0.1:5673`);
console.log(`  Username: legal_admin`);
console.log(`  Vhost: /`);

try {
  const conn = await amqplib.connect(url, {
    clientProperties: {
      connection_name: 'ornith-diagnostic-test',
    },
  });
  
  const ch = await conn.createChannel();
  console.log('✅ AMQP_CONNECTION_PASSED=TRUE');
  console.log('   Channel created successfully');
  
  await ch.close();
  await conn.close();
  process.exit(0);
} catch (err) {
  console.log('❌ AMQP_CONNECTION_FAILED=TRUE');
  console.log(`   Error: ${err.message}`);
  process.exit(1);
}
