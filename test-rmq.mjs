import amqplib from 'amqplib';

async function test() {
    try {
        const conn = await amqplib.connect('amqp://legal_admin:secret123@localhost:5672');
        console.log('RabbitMQ connected successfully!');
        await conn.close();
    } catch (e) {
        console.error('RabbitMQ connection failed:', e);
    }
}
test();
