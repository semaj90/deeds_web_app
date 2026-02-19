const sockets = new Set<WebSocket>();

export function registerEvidenceSocket(socket: WebSocket) {
  sockets.add(socket);
  const cleanup = () => sockets.delete(socket);
  socket.addEventListener('close', cleanup);
  socket.addEventListener('error', cleanup);
}

export function broadcastEvidenceUpdate(payload: unknown) {
  const serialized = JSON.stringify(payload);
  for (const socket of sockets) {
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(serialized);
    }
  }
}
