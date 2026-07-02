import amqp from 'amqplib';

const RABBITMQ_URL = 'amqp://guest:guest@127.0.0.1:5672';

const conn = await amqp.connect(RABBITMQ_URL);
const ch = await conn.createChannel();

// List all bindings for the fanout exchange
const ex = 'summaries.batch.fanout';

// We need to check via the connection object
// Unfortunately amqplib doesn't expose a direct API for listing bindings
// But we can test by asserting and binding

const q = 'test.binding.queue';
await ch.assertExchange(ex, 'fanout', { durable: true });
await ch.assertQueue(q, { durable: false });
const bindResult = await ch.bindQueue(q, ex, '');
console.log('Bind result:', bindResult);

// Now consume from the test queue
let received = false;
await ch.consume(q, (msg) => {
  if (msg) {
    console.log('Test message received!', msg.content.toString());
    received = true;
  }
});

// Publish a test message
const testMsg = Buffer.from(JSON.stringify({ test: 'message' }));
ch.publish(ex, '', testMsg);

// Wait a bit to see if message arrives
await new Promise(r => setTimeout(r, 500));

if (!received) {
  console.log('No message received on bound queue');
}

conn.close();
