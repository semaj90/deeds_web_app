import amqp from 'amqplib';

let channel: amqp.Channel | null = null;

export async function setupQueues() {
  const conn = await amqp.connect(process.env.RABBITMQ_URL || 'amqp://localhost');
  channel = await conn.createChannel();
  await channel.assertQueue('tasks', { durable: false });
  await channel.assertQueue('logs', { durable: false });
  console.log('🐇 RabbitMQ ready');
}

export async function publishToQueue(queue: string, data: any) {
  if (!channel) await setupQueues();
  channel!.sendToQueue(queue, Buffer.from(JSON.stringify(data)));
}

export async function consumeQueue(queue: string, handler: (msg: any) => Promise<void>) {
  if (!channel) await setupQueues();
  channel!.consume(queue, async (msg) => {
    if (!msg) return;
    try {
      const data = JSON.parse(msg.content.toString());
      await handler(data);
    } finally {
      channel!.ack(msg);
    }
  });
}
