export const rabbitmqXStateBridge = {
 async subscribe(_queue, _actor, _mapper) {
 return true;
 },
 async shutdown() {
 return true;
 },
 getStatus() {
 return { connected: false };
 },
};


