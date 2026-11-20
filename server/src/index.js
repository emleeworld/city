import { createServer } from 'node:http';
import { Server, Room } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';

class CityRoom extends Room {
  maxClients = 24;
  onCreate() {
    this.players = new Map();
    this.setSimulationInterval(() => {
      const snapshot = Object.fromEntries(this.players);
      this.broadcast('snapshot', snapshot);
    }, 50);
    this.onMessage('move', (client, data) => {
      if (!data || !Number.isFinite(data.x) || !Number.isFinite(data.z)) return;
      const p = this.players.get(client.sessionId);
      if (!p) return;
      p.x = Math.max(-205, Math.min(205, data.x));
      p.y = Math.max(0, Math.min(10, Number(data.y) || 0));
      p.z = Math.max(-205, Math.min(205, data.z));
      p.yaw = Number(data.yaw) || 0;
    });
  }
  onJoin(client) { this.players.set(client.sessionId, { x: 0, y: 0, z: 0, yaw: 0 }); }
  onLeave(client) { this.players.delete(client.sessionId); }
}

const port = Number(process.env.PORT || 2567);
const httpServer = createServer();
const server = new Server({ transport: new WebSocketTransport({ server: httpServer, pingInterval: 3000 }) });
server.define('city', CityRoom);
server.listen(port);
console.log(`emLee WORLD multiplayer server listening on ${port}`);
