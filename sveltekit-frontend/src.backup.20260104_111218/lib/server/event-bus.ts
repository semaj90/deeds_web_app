type EventPayload = Record<string, unknown> & { type: string };
type EventCallback = (event: EventPayload) => void;

class EventBus {
 private subscribers = new Set<EventCallback>();

 subscribe(callback: EventCallback) {
 this.subscribers.add(callback);
 return () => this.subscribers.delete(callback);
 }

 emit(event: EventPayload) {
 for (const cb of this.subscribers) {
 try {
 cb(event);
 } catch (err) {
 console.error('EventBus subscriber error:', err);
 }
 }
 }
}

export const eventBus = new EventBus();
