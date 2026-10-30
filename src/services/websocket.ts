import { WebSocketServer, WebSocket } from 'ws';
import { Server as HttpServer } from 'http';
import { db } from '../database/connection.js';

interface ClientConnection {
  ws: WebSocket;
  displayCode?: string;
  isAlive: boolean;
}

const clients = new Set<ClientConnection>();

export function setupWebSocket(server: HttpServer): WebSocketServer {
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws: WebSocket) => {
    const client: ClientConnection = { ws, isAlive: true };
    clients.add(client);

    ws.on('pong', () => {
      client.isAlive = true;
    });

    ws.on('message', async (data: string) => {
      try {
        const message = JSON.parse(data.toString());

        // Display heartbeat / registration
        if (message.type === 'display:register') {
          client.displayCode = message.displayCode;
          // Update display status to online in database
          await db.run(
            `UPDATE displays SET status = 'online', last_ping = CURRENT_TIMESTAMP WHERE code = ?`,
            [message.displayCode]
          );
          console.log(`[WebSocket] Display connected and registered: ${message.displayCode}`);
        }

        if (message.type === 'display:ping') {
          client.isAlive = true;
          if (client.displayCode) {
            await db.run(
              `UPDATE displays SET status = 'online', last_ping = CURRENT_TIMESTAMP WHERE code = ?`,
              [client.displayCode]
            );
          }
        }
      } catch (err) {
        console.error('[WebSocket] Error processing message:', err);
      }
    });

    ws.on('close', async () => {
      if (client.displayCode) {
        console.log(`[WebSocket] Display disconnected: ${client.displayCode}`);
        await db.run(
          `UPDATE displays SET status = 'offline' WHERE code = ?`,
          [client.displayCode]
        );
      }
      clients.delete(client);
    });

    // Send welcome ack
    ws.send(JSON.stringify({ type: 'connected', message: 'Conectado ao Hub de Sinalização Digital' }));
  });

  // Heartbeat interval to detect dead sockets
  const interval = setInterval(() => {
    wss.clients.forEach((ws: WebSocket) => {
      // Find client record
      for (const client of clients) {
        if (client.ws === ws) {
          if (!client.isAlive) {
            client.ws.terminate();
            clients.delete(client);
          } else {
            client.isAlive = false;
            client.ws.ping();
          }
        }
      }
    });
  }, 30000);

  wss.on('close', () => {
    clearInterval(interval);
  });

  return wss;
}

export function broadcast(event: string, data: any, targetDisplayCode?: string): void {
  const payload = JSON.stringify({ type: event, data, timestamp: new Date().toISOString() });

  clients.forEach((client) => {
    if (client.ws.readyState === WebSocket.OPEN) {
      if (!targetDisplayCode || client.displayCode === targetDisplayCode) {
        client.ws.send(payload);
      }
    }
  });
}

export function broadcastQueueCall(ticket: any): void {
  broadcast('queue:call', ticket);
}

export function broadcastScreenReload(displayCode?: string): void {
  broadcast('screen:reload', { displayCode }, displayCode);
}
