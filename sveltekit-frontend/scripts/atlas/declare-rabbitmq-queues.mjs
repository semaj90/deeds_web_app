const DLX = 'dlx.dead-letter';

await channel.assertExchange(DLX, 'topic', { durable: true });

for (const queueName of QUEUES) {
  const info = await channel.assertQueue(queueName, {
    durable: true,
    arguments: {
      'x-message-ttl': 300000,
      'x-dead-letter-exchange': DLX,
      'x-dead-letter-routing-key': queueName,
    },
  });

  console.log(`✅ ${queueName} (${info.messageCount} msgs, ${info.consumerCount} consumers)`);
}