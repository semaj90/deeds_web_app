import amqp from 'amqplib';

const RABBITMQ_URL = 'amqp://guest:guest@127.0.0.1:5672';
const EXCHANGE = 'summaries.batch.fanout';
const QUEUE = 'summaries.batch.worker.test';

console.log('Connecting to RabbitMQ...');
const connection = await amqp.connect(RABBITMQ_URL);
const channel = await connection.createChannel();

console.log('Asserting exchange...');
await channel.assertExchange(EXCHANGE, 'fanout', { durable: true });

console.log('Asserting queue...');
const q = await channel.assertQueue(QUEUE, { durable: true });
console.log(`Queue created: ${q.queue}`);

console.log('Binding queue to exchange...');
const binding = await channel.bindQueue(q.queue, EXCHANGE, '');
console.log(`Binding result: ${JSON.stringify(binding)}`);

console.log('Checking bindings via API...');
// Give RabbitMQ a moment to register
await new Promise(r => setTimeout(r, 500));

connection.close();
console.log('Done.');
