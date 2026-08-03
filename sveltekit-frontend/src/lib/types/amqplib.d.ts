declare module 'amqplib' {
  export interface Channel {
    assertExchange(...args: any[]): Promise<any>;
    assertQueue(...args: any[]): Promise<any>;
    bindQueue(...args: any[]): Promise<any>;
    consume(...args: any[]): Promise<any>;
    cancel(...args: any[]): Promise<any>;
    prefetch(...args: any[]): Promise<any>;
    ack(...args: any[]): void;
    nack(...args: any[]): void;
    publish(...args: any[]): boolean;
    waitForConfirms(): Promise<void>;
  }

  export interface ConsumeMessage {
    content: Buffer;
    fields?: Record<string, unknown>;
    properties?: Record<string, unknown>;
  }
}
