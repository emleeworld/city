
import * as THREE from 'three';
import { Client } from 'colyseus.js';
import './style.css';

const app = document.querySelector('#app');

app.innerHTML = `
<div class="hud">
  <div class="top">
    <div class="brand">emLee <span style="color:#8fa8ff">WORLD</span></div>
    <div class="pill">CITY TEST BUILD · 0.1</div>
  </div>

  <div class="status" id="status">CONNECTING TO WORLD…</div>

  <div class="players">
    <b>PLAYERS ONLINE</b>
    <div id="playerList"><span>Connecting…</span></div>
  </div>

  <div class="cross"></div>

  <div class="help">
    WASD / Arrow keys · Move<br>
    Mouse drag · Look around<br>
    Space · Jump<br>
    <span style="color:#9db8ff">Mobile: use the action buttons</span>
  </div>

  <div class="mobile">
    <button id="left">◀</button>
    <button id="jump">↑</button>
    <button id="right">▶</button>
  </div>

  <div class="name">YOUR CITY. YOUR WORLD.</div>
  <div class="credit">CREATED BY <strong>LEE</strong></div>
</div>`;


// =====================================
// SCENE
// =====================================

const scene = new THREE.Scene();

scene.background = new THREE.Color(0x9bb7cf);
scene.fog = new THREE.Fog(0x9bb7cf, 75, 260);

const camera = new THREE.PerspectiveCamera(
  65,
  innerWidth / innerHeight,
  0.1,
  600
);

const renderer = new THREE.WebGLRenderer({
  antialias: true
});

renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.7));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;

app.prepend(renderer.domElement);


// =====================================
// LIGHTING
// =====================================

scene.add(
  new THREE.HemisphereLight(
    0xd9eaff,
    0x45505d,
    2
  )
);

const sun = new THREE.DirectionalLight(0xffe1bd, 3);

sun.position.set(-45, 80, 30);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);

scene.add(sun);


// =====================================
// MATERIALS AND GROUND
// =====================================

const mat = (c, r = 0.8) =>
  new THREE.MeshStandardMaterial({
    color: c,
    roughness: r
  });

const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(500, 500),
  mat(0x59665f)
);

ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;

scene.add(ground);


// =====================================
// CITY ROADS
// =====================================

const roadMat = mat(0x252b32);
const lineMat = mat(0xd7d0ad);

for (let i = -4; i <= 4; i++) {

  const roadX = new THREE.Mesh(
    new THREE.PlaneGeometry(13, 420),
    roadMat
  );

  roadX.rotation.x = -Math.PI / 2;
  roadX.position.set(i * 48, 0.025, 0);

  scene.add(roadX);

  const roadZ = new THREE.Mesh(
    new THREE.PlaneGeometry(420, 13),
    roadMat
  );

  roadZ.rotation.x = -Math.PI / 2;
  roadZ.position.set(0, 0.026, i * 48);

  scene.add(roadZ);

  for (let k = -8; k <= 8; k++) {

    const dash = new THREE.Mesh(
      new THREE.BoxGeometry(0.18, 0.035, 3.2),
      lineMat
    );

    dash.position.set(i * 48, 0.06, k * 12);

    scene.add(dash);

    const dash2 = new THREE.Mesh(
      new THREE.BoxGeometry(3.2, 0.035, 0.18),
      lineMat
    );

    dash2.position.set(k * 12, 0.061, i * 48);

    scene.add(dash2);
  }
}


// =====================================
// CITY BUILDINGS
// =====================================

const buildingMats = [
  0x697783,
  0x8b9297,
  0x4e5b69,
  0xb1a99a,
  0x596b75,
  0x777b83
].map(c => mat(c, 0.65));

for (let x = -4; x <= 4; x++) {

  for (let z = -4; z <= 4; z++) {

    if (Math.abs(x) === 4 && Math.abs(z) === 4) {
      continue;
    }

    const cx = x * 48;
    const cz = z * 48;

    for (let n = 0; n < 5; n++) {

      const bx = cx + (Math.random() - 0.5) * 28;
      const bz = cz + (Math.random() - 0.5) * 28;

      const w = 7 + Math.random() * 9;
      const d = 7 + Math.random() * 9;
      const h = 9 + Math.random() * 43;

      const b = new THREE.Mesh(
        new THREE.BoxGeometry(w, h, d),
        buildingMats[
          Math.floor(Math.random() * buildingMats.length)
        ]
      );

      b.position.set(bx, h / 2, bz);
      b.castShadow = true;
      b.receiveShadow = true;

      scene.add(b);

      const roof = new THREE.Mesh(
        new THREE.BoxGeometry(
          w * 0.55,
          0.5,
          d * 0.55
        ),
        mat(0x343d48)
      );

      roof.position.set(bx, h + 0.25, bz);

      scene.add(roof);
    }
  }
}


// =====================================
// PLAYER CREATION
// =====================================

function makePlayer(color = 0x426fe8) {

  const g = new THREE.Group();

  const body = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.48, 0.95, 4, 8),
    mat(color)
  );

  body.position.y = 1.15;
  body.castShadow = true;

  g.add(body);

  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.32, 16, 12),
    mat(0xd2a17f)
  );

  head.position.y = 2.05;
  head.castShadow = true;

  g.add(head);

  return g;
}

const me = makePlayer(0x416fe8);

scene.add(me);
me.position.set(0, 0, 0);


// =====================================
// KEYBOARD CONTROLS
// =====================================

const keys = {};

addEventListener('keydown', e => {
  keys[e.key.toLowerCase()] = true;
});

addEventListener('keyup', e => {
  keys[e.key.toLowerCase()] = false;
});


// =====================================
// CAMERA CONTROLS
// =====================================

let yaw = 0;
let pitch = 0.22;

let drag = false;
let lastX = 0;
let lastY = 0;

let vy = 0;
let onGround = true;

renderer.domElement.addEventListener(
  'pointerdown',
  e => {
    drag = true;
    lastX = e.clientX;
    lastY = e.clientY;
  }
);

addEventListener('pointerup', () => {
  drag = false;
});

addEventListener('pointermove', e => {

  if (!drag) return;

  yaw -= (e.clientX - lastX) * 0.004;

  pitch = THREE.MathUtils.clamp(
    pitch + (e.clientY - lastY) * 0.003,
    -0.2,
    0.8
  );

  lastX = e.clientX;
  lastY = e.clientY;
});


// =====================================
// MULTIPLAYER CONNECTION
// =====================================

const remote = new Map();

let room = null;
let sendTimer = 0;

const status = document.querySelector('#status');
const list = document.querySelector('#playerList');

const serverUrl =
  'wss://emlee-world-server.onrender.com';

async function connectToWorld() {

  try {

    status.textContent = 'CONNECTING TO MULTIPLAYER...';

    const client = new Client(serverUrl);

    room = await client.joinOrCreate('city');

    status.textContent =
      '● CONNECTED · MULTIPLAYER LIVE';

    room.onMessage('snapshot', data => {

      for (const [id, p] of Object.entries(data)) {

        if (id === room.sessionId) continue;

        if (!remote.has(id)) {

          const m = makePlayer(0xe2a84b);

          scene.add(m);

          remote.set(id, {
            mesh: m
          });
        }

        const r = remote.get(id);

        r.target = new THREE.Vector3(
          p.x,
          p.y,
          p.z
        );

        r.yaw = p.yaw || 0;
      }
    });

    room.onLeave(() => {

      status.textContent =
        '○ DISCONNECTED · RELOAD TO REJOIN';

      room = null;
    });

  } catch (e) {

    room = null;

    status.textContent =
      '● LOCAL PREVIEW · SERVER CONNECTION FAILED';

    console.warn(
      'Multiplayer connection failed:',
      e
    );
  }
}

connectToWorld();


// =====================================
// MOBILE CONTROLS
// =====================================

function bindHold(id, key) {

  const el = document.getElementById(id);

  el.addEventListener('pointerdown', e => {

    e.preventDefault();

    keys[key] = true;
  });

  [
    'pointerup',
    'pointerleave',
    'pointercancel'
  ].forEach(ev => {

    el.addEventListener(ev, () => {
      keys[key] = false;
    });
  });
}

bindHold('left', 'a');
bindHold('right', 'd');

document.getElementById('jump').addEventListener(
  'pointerdown',
  () => {

    if (onGround) {

      vy = 8;
      onGround = false;
    }
  }
);


// =====================================
// GAME LOOP
// =====================================

const clock = new THREE.Clock();

function animate() {

  requestAnimationFrame(animate);

  const dt = Math.min(clock.getDelta(), 0.04);

  const forward =
    (keys.w || keys.arrowup ? 1 : 0) -
    (keys.s || keys.arrowdown ? 1 : 0);

  const side =
    (keys.d || keys.arrowright ? 1 : 0) -
    (keys.a || keys.arrowleft ? 1 : 0);

  const speed = keys.shift ? 13 : 7;

  const dir = new THREE.Vector3(
    Math.sin(yaw),
    0,
    Math.cos(yaw)
  );

  const right = new THREE.Vector3(
    Math.cos(yaw),
    0,
    -Math.sin(yaw)
  );

  me.position.addScaledVector(
    dir,
    -forward * speed * dt
  );

  me.position.addScaledVector(
    right,
    side * speed * dt
  );

  me.position.x = THREE.MathUtils.clamp(
    me.position.x,
    -205,
    205
  );

  me.position.z = THREE.MathUtils.clamp(
    me.position.z,
    -205,
    205
  );

  // Jump

  if (keys[' '] && onGround) {

    vy = 8;
    onGround = false;
  }

  vy -= 22 * dt;

  me.position.y += vy * dt;

  if (me.position.y < 0) {

    me.position.y = 0;
    vy = 0;
    onGround = true;
  }

  if (forward || side) {
    me.rotation.y = yaw;
  }

  // Camera follow

  const target = new THREE.Vector3(
    me.position.x,
    me.position.y + 2.3,
    me.position.z
  );

  const offset = new THREE.Vector3(
    Math.sin(yaw) * 8,
    4.2 + pitch * 4,
    Math.cos(yaw) * 8
  );

  camera.position.lerp(
    target.clone().add(offset),
    1 - Math.pow(0.001, dt)
  );

  camera.lookAt(target);

  // Remote players

  for (const r of remote.values()) {

    if (r.target) {

      r.mesh.position.lerp(
        r.target,
        Math.min(1, dt * 12)
      );

      r.mesh.rotation.y = r.yaw || 0;
    }
  }

  // Send position to server

  sendTimer += dt;

  if (room && sendTimer > 0.07) {

    sendTimer = 0;

    room.send('move', {
      x: me.position.x,
      y: me.position.y,
      z: me.position.z,
      yaw
    });
  }

  // Player list

  list.innerHTML =
    `<span>You · ${room ? 'online' : 'local'}</span>` +
    [...remote.keys()]
      .map((_, i) => `<span>Player ${i + 2}</span>`)
      .join('');

  renderer.render(scene, camera);
}

animate();


// =====================================
// RESPONSIVE SCREEN
// =====================================

addEventListener('resize', () => {

  camera.aspect = innerWidth / innerHeight;

  camera.updateProjectionMatrix();

  renderer.setSize(
    innerWidth,
    innerHeight
  );
});
