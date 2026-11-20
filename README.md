# emLee WORLD — starter build

A browser-based 3D city prototype with a Three.js client and a Colyseus multiplayer room server.

## Requirements
- Node.js 20+
- npm 10+

## Run locally
From this folder:

```bash
npm install
npm run dev
```

Open the Vite URL printed in the terminal. The client expects the multiplayer server at `ws://localhost:2567` by default. To run the server separately:

```bash
npm run start:server
```

For a deployed client, set `VITE_GAME_SERVER` to the public `wss://` URL of the deployed Colyseus server before building.

## Controls
- WASD / arrow keys: move
- Shift: run
- Space: jump
- Drag the screen: rotate camera
- On phones: use the on-screen left/right/jump buttons; drag to look around

## Important prototype notes
- This is the first playable foundation: block-built city, third-person movement, and position sync between connected players.
- The city is procedural placeholder geometry, not a finished GTA-scale world.
- The multiplayer server must be deployed on a host that supports persistent WebSockets. Static hosting alone (for example, a basic static Pages site) cannot host the game server.
- Before public launch, add proper collision/physics, player identity and authentication, moderation/reporting, rate limits, server-side movement validation, persistence, optimized city assets, and secure production hosting. Do not expose server secrets in the client.
