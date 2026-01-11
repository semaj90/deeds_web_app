// Compatibility shim: delegate to the real RabbitMQ service implementation
export * from '$lib/server/messaging/rabbitmq-service';
export { rabbitmqService, as rabbitMQService } from '$lib/server/messaging/rabbitmq-service';
