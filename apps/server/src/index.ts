import { createServer } from 'node:http';
import { WebSocketServer } from 'ws';
const port = Number(process.env.PORT ?? 3001);
const httpServer = createServer((request, response) => {
  if (request.url === '/health') {
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ status: 'ok', service: 'tileworks-server' }));
    return;
  }
  response.writeHead(404);
  response.end();
});
const webSocketServer = new WebSocketServer({ server: httpServer });
webSocketServer.on('connection', (socket) =>
  socket.send(JSON.stringify({ type: 'hello', service: 'tileworks-server' })),
);
httpServer.listen(port, () =>
  console.log(`Tileworks server listening on http://localhost:${port}`),
);
