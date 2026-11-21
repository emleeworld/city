import * as THREE from 'three';
import { Client } from '@colyseus/sdk';
import './style.css';

const app = document.querySelector('#app');
const defaults = { username: 'Lee', gender: 'male', skin: '#b87958', hair: '#211914', shirt: '#426fe8', pants: '#202b3b', shoes: '#17191d', hairStyle: 'short' };
let stored = {};
try { stored = JSON.parse(localStorage.getItem('emlee-profile') || '{}'); } catch {}
const profile = { ...defaults, ...stored };
const API_BASE = import.meta.env.VITE_API_BASE || import.meta.env.VITE_GAME_SERVER?.replace(/^wss:/,'https:').replace(/^ws:/,'http:') || 'http://localhost:2567';
let signedInUser = null;
const cleanName = value => String(value || 'Player').trim().replace(/[<>]/g, '').slice(0, 20) || 'Player';
const esc = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
app.innerHTML = `
<div class="hud">
  <header><div class="brand">emLee <span>WORLD</span></div><div class="build">OPEN CITY · 0.2</div><button id="login" class="small-btn">GOOGLE / YOUTUBE LOGIN</button><button id="editProfile" class="small-btn">CHARACTER</button></header>
  <div class="status" id="status">CONNECTING TO WORLD…</div>
  <aside class="players"><b>PLAYERS ONLINE <i id="count">1</i></b><div id="playerList">Connecting…</div></aside>
  <div class="cross"></div>
  <div class="help">WASD / ARROWS · MOVE<br>SHIFT · RUN &nbsp; SPACE · JUMP<br>DRAG · LOOK AROUND<br><span>Mobile: use the controls</span></div>
  <div class="mobile">
    <div class="pad"><button data-key="w">▲</button><div><button data-key="a">◀</button><button data-key="s">▼</button><button data-key="d">▶</button></div></div>
    <button id="jump" class="jump">JUMP</button>
  </div>
  <div class="name">YOUR CITY. YOUR WORLD.</div><div class="credit">CREATED BY <strong>LEE</strong></div>
</div>
<section class="creator hidden" id="creator"><div class="creator-card">
  <div class="creator-head"><div><small>PLAYER IDENTITY</small><h2>Build your character</h2></div><button id="closeCreator" class="close">×</button></div>
  <label>DISPLAY NAME<input id="username" maxlength="20" value="${esc(profile.username)}" placeholder="Your name"></label>
  <div class="field"><span>BODY TYPE</span><div class="seg"><button data-gender="male">MALE</button><button data-gender="female">FEMALE</button></div></div>
  <div class="field"><span>SKIN TONE</span><div class="swatches" id="skins"></div></div>
  <div class="field"><span>HAIR COLOR</span><div class="swatches" id="hairs"></div></div>
  <div class="field"><span>HAIR STYLE</span><div class="seg"><button data-hair="short">SHORT</button><button data-hair="long">LONG</button></div></div>
  <div class="field"><span>TOP</span><div class="swatches" id="shirts"></div></div>
  <div class="field"><span>PANTS</span><div class="swatches" id="pants"></div></div>
  <div class="field"><span>SHOES</span><div class="swatches" id="shoes"></div></div>
  <button id="saveProfile" class="save">SAVE CHARACTER</button>
  <p class="note">Saved on this device. Your selected appearance is shared with other players while you are online.</p>
</div></section>
<div class="social-ui">
  <section class="social-card"><div class="social-title"><b>NEARBY PLAYERS</b><span id="friendProgress">Friends: 0 · Mission: 0/3</span></div><div id="nearbyList" class="nearby-list"><small>Walk close to other players to meet them.</small></div></section>
  <section class="social-card chat-card"><div class="social-title"><b>LOCAL CHAT</b><span>24m range</span></div><div id="chatLog" class="chat-log"><small>Say hello to players nearby.</small></div><form id="chatForm"><input id="chatInput" maxlength="180" placeholder="Message nearby players…" autocomplete="off"><button> SEND </button></form></section>
  <button id="quizOpen" class="quiz-launch">LIVE QUIZ EVENT</button>
</div>
<section id="quizPanel" class="quiz-panel hidden"><div class="quiz-top"><div><small>EMLEE WORLD EVENT</small><h2>Live Quiz</h2></div><button id="quizClose" class="close">×</button></div><p id="quizStatus">Join the live quiz with everyone in this world.</p><div id="quizQuestion" class="quiz-question">Waiting for the next event…</div><div id="quizOptions" class="quiz-options"></div><div id="quizTimer" class="quiz-timer"></div><div id="quizRanking" class="quiz-ranking"></div><button id="quizStart" class="save">START LIVE QUIZ</button></section>
<div id="toast" class="toast hidden"></div>`;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x91adc5);
scene.fog = new THREE.Fog(0x91adc5, 100, 340);
const camera = new THREE.PerspectiveCamera(65, innerWidth / innerHeight, .1, 800);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.7));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;
app.prepend(renderer.domElement);

scene.add(new THREE.HemisphereLight(0xd9eaff, 0x45505d, 2));
const sun = new THREE.DirectionalLight(0xffe1bd, 3);
sun.position.set(-45, 80, 30); sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048); scene.add(sun);
const mat = (c, r=.8) => new THREE.MeshStandardMaterial({ color: c, roughness: r });
const ground = new THREE.Mesh(new THREE.PlaneGeometry(600,600), mat(0x59665f));
ground.rotation.x = -Math.PI/2; ground.receiveShadow = true; scene.add(ground);

// City block and road layout retained from the starter, with added sidewalks and street furniture.
const roadMat = mat(0x252b32), lineMat = mat(0xd7d0ad), sidewalkMat = mat(0x858b8b);
for (let i=-4;i<=4;i++) {
  const rx = new THREE.Mesh(new THREE.PlaneGeometry(13,460),roadMat); rx.rotation.x=-Math.PI/2; rx.position.set(i*48,.025,0); scene.add(rx);
  const rz = new THREE.Mesh(new THREE.PlaneGeometry(460,13),roadMat); rz.rotation.x=-Math.PI/2; rz.position.set(0,.026,i*48); scene.add(rz);
  const sx1=new THREE.Mesh(new THREE.PlaneGeometry(3,460),sidewalkMat); sx1.rotation.x=-Math.PI/2; sx1.position.set(i*48+8,.035,0); scene.add(sx1);
  const sx2=sx1.clone(); sx2.position.x=i*48-8; scene.add(sx2);
  const sz1=new THREE.Mesh(new THREE.PlaneGeometry(460,3),sidewalkMat); sz1.rotation.x=-Math.PI/2; sz1.position.set(0,.036,i*48+8); scene.add(sz1);
  const sz2=sz1.clone(); sz2.position.z=i*48-8; scene.add(sz2);
  for(let k=-8;k<=8;k++){
    const dash=new THREE.Mesh(new THREE.BoxGeometry(.18,.035,3.2),lineMat); dash.position.set(i*48,.06,k*12); scene.add(dash);
    const dash2=new THREE.Mesh(new THREE.BoxGeometry(3.2,.035,.18),lineMat); dash2.position.set(k*12,.061,i*48); scene.add(dash2);
  }
}
const buildingMats=[0x697783,0x8b9297,0x4e5b69,0xb1a99a,0x596b75,0x777b83].map(c=>mat(c,.65));
for(let x=-4;x<=4;x++) for(let z=-4;z<=4;z++) {
  if(Math.abs(x)===4&&Math.abs(z)===4) continue;
  const cx=x*48,cz=z*48;
  for(let n=0;n<5;n++){
    const bx=cx+(Math.random()-.5)*28,bz=cz+(Math.random()-.5)*28,w=7+Math.random()*9,d=7+Math.random()*9,h=9+Math.random()*43;
    const b=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),buildingMats[Math.floor(Math.random()*buildingMats.length)]);
    b.position.set(bx,h/2,bz);b.castShadow=true;b.receiveShadow=true;scene.add(b);
    const roof=new THREE.Mesh(new THREE.BoxGeometry(w*.55,.5,d*.55),mat(0x343d48));roof.position.set(bx,h+.25,bz);scene.add(roof);
  }
}
// Scattered street lights.
for(let i=-3;i<=3;i++) for(let j=-3;j<=3;j++) {
  const x=i*48+10,z=j*48+10;
  const pole=new THREE.Mesh(new THREE.CylinderGeometry(.09,.13,5,8),mat(0x303944));pole.position.set(x,2.5,z);pole.castShadow=true;scene.add(pole);
  const arm=new THREE.Mesh(new THREE.BoxGeometry(1.3,.12,.12),mat(0x303944));arm.position.set(x+.55,4.9,z);scene.add(arm);
  const lamp=new THREE.Mesh(new THREE.BoxGeometry(.55,.16,.42),mat(0xffe3a1));lamp.position.set(x+1.1,4.85,z);scene.add(lamp);
}

// Character construction: stylized realistic proportions; appearance is data-driven.
function makePlayer(look={}) {
  const p={...defaults,...look};
  const group=new THREE.Group();
  const skin=mat(p.skin), hair=mat(p.hair), shirt=mat(p.shirt), pants=mat(p.pants), shoes=mat(p.shoes);
  const add=(geo,material,x,y,z)=>{const m=new THREE.Mesh(geo,material);m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;group.add(m);return m;};
  const female=p.gender==='female';
  // shoes and legs
  add(new THREE.BoxGeometry(.34,.18,.55),shoes,-.22,.12,.04);
  add(new THREE.BoxGeometry(.34,.18,.55),shoes,.22,.12,.04);
  add(new THREE.CapsuleGeometry(female?.17:.19,.72,4,8),pants,-.22,.58,0);
  add(new THREE.CapsuleGeometry(female?.17:.19,.72,4,8),pants,.22,.58,0);
  // torso, neck, head
  add(new THREE.CapsuleGeometry(female?.34:.39,.62,5,12),shirt,0,1.48,0);
  add(new THREE.CylinderGeometry(.12,.13,.18,12),skin,0,1.94,0);
  add(new THREE.SphereGeometry(.29,24,20),skin,0,2.22,0);
  // ears
  add(new THREE.SphereGeometry(.07,12,10),skin,-.29,2.22,0);
  add(new THREE.SphereGeometry(.07,12,10),skin,.29,2.22,0);
  // hair cap and optional long hair
  add(new THREE.SphereGeometry(.30,20,12,0,Math.PI*2,0,Math.PI*.55),hair,0,2.29,-.015);
  if(p.hairStyle==='long'){
    add(new THREE.BoxGeometry(.5,.58,.18),hair,0,2.03,-.17);
  } else {
    add(new THREE.BoxGeometry(.48,.12,.24),hair,0,2.38,.02);
  }
  // arms with shoulder joints
  const armL=add(new THREE.CapsuleGeometry(.105,.55,4,8),shirt,-.48,1.48,0);armL.rotation.z=-.13;
  const armR=add(new THREE.CapsuleGeometry(.105,.55,4,8),shirt,.48,1.48,0);armR.rotation.z=.13;
  add(new THREE.SphereGeometry(.11,12,10),skin,-.49,1.15,0);
  add(new THREE.SphereGeometry(.11,12,10),skin,.49,1.15,0);
  // simple facial features
  const eyeMat=mat(0x211b1a,.4);
  add(new THREE.SphereGeometry(.025,8,8),eyeMat,-.105,2.25,.265);
  add(new THREE.SphereGeometry(.025,8,8),eyeMat,.105,2.25,.265);
  const labelCanvas=document.createElement('canvas');labelCanvas.width=512;labelCanvas.height=128;
  const ctx=labelCanvas.getContext('2d');ctx.clearRect(0,0,512,128);ctx.font='bold 48px Arial';ctx.textAlign='center';ctx.fillStyle='#ffffff';ctx.shadowColor='#000000';ctx.shadowBlur=10;ctx.fillText(cleanName(p.username),256,78);
  const texture=new THREE.CanvasTexture(labelCanvas);const label=new THREE.Sprite(new THREE.SpriteMaterial({map:texture,transparent:true,depthTest:false}));
  label.scale.set(2.5,.62,1);label.position.y=2.95;group.add(label);group.userData.label=label;
  return group;
}
let me=makePlayer(profile);scene.add(me);
const remotes=new Map();
const keys={};addEventListener('keydown',e=>{keys[e.key.toLowerCase()]=true;if([' ','arrowup','arrowdown','arrowleft','arrowright'].includes(e.key.toLowerCase()))e.preventDefault();});
addEventListener('keyup',e=>keys[e.key.toLowerCase()]=false);
let yaw=0,pitch=.2,drag=false,lastX=0,lastY=0,vy=0,onGround=true;
renderer.domElement.addEventListener('pointerdown',e=>{drag=true;lastX=e.clientX;lastY=e.clientY;});
addEventListener('pointerup',()=>drag=false);
addEventListener('pointermove',e=>{if(!drag)return;yaw-=(e.clientX-lastX)*.004;pitch=THREE.MathUtils.clamp(pitch+(e.clientY-lastY)*.003,-.15,.75);lastX=e.clientX;lastY=e.clientY;});
const status=document.querySelector('#status'),list=document.querySelector('#playerList'),count=document.querySelector('#count');

async function loadAccount(){
 try{
  const response=await fetch(`${API_BASE}/api/me`,{credentials:'include'});
  const data=await response.json();signedInUser=data.authenticated?data.user:null;
  const login=document.querySelector('#login');
  if(signedInUser){
   login.textContent=signedInUser.youtubeHandle||signedInUser.name||'SIGNED IN';
   if(signedInUser.youtubeHandle){profile.username=signedInUser.youtubeHandle;document.querySelector('#username').value=profile.username;}
   const savedResponse=await fetch(`${API_BASE}/api/profile`,{credentials:'include'});
   if(savedResponse.ok){const savedData=await savedResponse.json();if(savedData.profile){Object.assign(profile,savedData.profile);replaceMyAvatar();}}
  }else login.textContent='GOOGLE / YOUTUBE LOGIN';
 }catch(e){console.warn('Account API unavailable',e);}
}
document.querySelector('#login').addEventListener('click',()=>{location.href=`${API_BASE}/auth/google`;});
document.querySelector('#login').addEventListener('contextmenu',async e=>{e.preventDefault();await fetch(`${API_BASE}/auth/logout`,{method:'POST',credentials:'include'});signedInUser=null;document.querySelector('#login').textContent='GOOGLE / YOUTUBE LOGIN';});

const serverUrl=import.meta.env.VITE_GAME_SERVER||'ws://localhost:2567';
let room=null,sendTimer=0,lastSentProfile='';
function updatePlayerList(){
  const names=[profile.username,...[...remotes.values()].map(r=>r.username||'Player')];
  count.textContent=String(names.length);
  list.innerHTML=names.map((n,i)=>`<span>${i===0?'YOU': 'PLAYER'} · ${esc(n)}</span>`).join('');
}
let friendCount=0,friendMissionCount=0,lastNearbyRender=0,quizCountdown=null;
const toast=(message)=>{const el=document.querySelector('#toast');el.textContent=message;el.classList.remove('hidden');clearTimeout(el._timer);el._timer=setTimeout(()=>el.classList.add('hidden'),3200);};
function renderNearby(){
 const now=Date.now();if(now-lastNearbyRender<450)return;lastNearbyRender=now;
 const host=document.querySelector('#nearbyList');if(!host)return;
 const close=[...remotes.entries()].map(([id,r])=>({id,r,d:r.target?Math.hypot(me.position.x-r.target.x,me.position.z-r.target.z):999})).filter(x=>x.d<=12).sort((a,b)=>a.d-b.d);
 if(!close.length){host.innerHTML='<small>No one close by. Explore the city and say hello!</small>';}
 else host.innerHTML=close.map(({id,r,d})=>`<div class="nearby-row"><span><b>${esc(r.username||'Player')}</b><small>${Math.round(d)}m away</small></span><button data-friend="${esc(id)}">ADD FRIEND</button></div>`).join('');
 host.querySelectorAll('[data-friend]').forEach(btn=>btn.addEventListener('click',()=>{if(room)room.send('friendRequest',btn.dataset.friend);btn.disabled=true;btn.textContent='SENT';}));
 document.querySelector('#friendProgress').textContent=`Friends: ${friendCount} · Mission: ${Math.min(friendMissionCount,3)}/3`;
}
function addChat(name,message){const log=document.querySelector('#chatLog');if(!log)return;const row=document.createElement('div');row.className='chat-line';const b=document.createElement('b');b.textContent=name+': ';const t=document.createElement('span');t.textContent=message;row.append(b,t);log.append(row);while(log.children.length>30)log.firstChild.remove();log.scrollTop=log.scrollHeight;}
function showQuiz(data){
 const panel=document.querySelector('#quizPanel');panel.classList.toggle('hidden',!data.active);
 if(!data.active)return;
 document.querySelector('#quizStatus').textContent=`Question ${data.questionIndex+1} of ${data.total} · Everyone can play`;
 document.querySelector('#quizQuestion').textContent=data.question;
 const opts=document.querySelector('#quizOptions');opts.innerHTML='';
 data.options.forEach((label,index)=>{const b=document.createElement('button');b.textContent=`${String.fromCharCode(65+index)}. ${label}`;b.addEventListener('click',()=>{if(room){room.send('quizAnswer',index);[...opts.children].forEach(x=>x.disabled=true);}});opts.append(b);});
 document.querySelector('#quizStart').classList.add('hidden');
 clearInterval(quizCountdown);quizCountdown=setInterval(()=>{const remain=Math.max(0,Math.ceil((data.endsAt-Date.now())/1000));document.querySelector('#quizTimer').textContent=`${remain}s remaining`;if(!remain)clearInterval(quizCountdown);},250);
}
function renderQuizScores(scores={}){
 const rank=document.querySelector('#quizRanking');if(!rank)return;
 const rows=Object.entries(scores).map(([id,score])=>({name:id===room?.sessionId?profile.username:(remotes.get(id)?.username||'Player'),score})).sort((a,b)=>b.score-a.score).slice(0,5);
 rank.innerHTML='';rows.forEach((r,i)=>{const el=document.createElement('div');el.textContent=`${i+1}. ${r.name} — ${r.score} pts`;rank.append(el);});
}
async function connectToWorld(){
  try{
    const client=new Client(serverUrl);room=await client.joinOrCreate('city',{profile});
    room.onMessage('notice',data=>toast(data.text||'Update'));
    room.onMessage('socialCounts',data=>{friendCount=data.friends||0;friendMissionCount=Math.min(friendCount,3);renderNearby();});
    room.onMessage('friendAdded',data=>{friendCount=data.friends||friendCount+1;friendMissionCount=Math.min(friendCount,3);toast(`You and ${data.name} are now friends!`);renderNearby();});
    room.onMessage('friendRequest',data=>{
      const accept=confirm(`${data.fromName} sent you a friend request. Accept?`);
      room.send('friendRespond',{fromId:data.fromId,accept});
      if(accept)toast(`You are now friends with ${data.fromName}.`);
    });
    room.onMessage('chatMessage',data=>addChat(data.name,data.text));
    room.onMessage('quizState',data=>showQuiz(data));
    room.onMessage('quizScores',data=>renderQuizScores(data.scores));
    room.onMessage('quizFinished',data=>{
      clearInterval(quizCountdown);document.querySelector('#quizPanel').classList.remove('hidden');
      document.querySelector('#quizStatus').textContent='Quiz complete! Final leaderboard';
      document.querySelector('#quizQuestion').textContent='Well played, everyone!';
      document.querySelector('#quizOptions').innerHTML='';document.querySelector('#quizTimer').textContent='';
      const rank=document.querySelector('#quizRanking');rank.innerHTML='';
      (data.ranking||[]).slice(0,5).forEach((p,i)=>{const row=document.createElement('div');row.textContent=`${i+1}. ${p.name} — ${p.score} pts`;rank.append(row);});
      document.querySelector('#quizStart').classList.remove('hidden');
    });
    status.textContent='● CONNECTED · MULTIPLAYER LIVE';
    room.onMessage('snapshot',data=>{
      for(const [id,p] of Object.entries(data)){
        if(id===room.sessionId)continue;
        if(!remotes.has(id)){const mesh=makePlayer(p.profile||{});scene.add(mesh);remotes.set(id,{mesh,username:p.profile?.username||'Player'});}
        const r=remotes.get(id);
        if(p.profile && JSON.stringify(p.profile)!==r.profileKey){scene.remove(r.mesh);r.mesh=makePlayer(p.profile);scene.add(r.mesh);r.username=p.profile.username;r.profileKey=JSON.stringify(p.profile);}
        r.target=new THREE.Vector3(p.x,p.y,p.z);r.yaw=p.yaw||0;
      }
      for(const [id,r] of remotes)if(!data[id]){scene.remove(r.mesh);remotes.delete(id);}
      updatePlayerList();
      renderNearby();
    });
    room.onLeave(()=>{status.textContent='○ DISCONNECTED · RELOAD TO REJOIN';room=null;});
  }catch(e){status.textContent='● LOCAL PREVIEW · MULTIPLAYER SERVER UNAVAILABLE';console.warn('Multiplayer server not available:',e);}
}
connectToWorld();
loadAccount();
document.querySelector('#chatForm').addEventListener('submit',e=>{e.preventDefault();const input=document.querySelector('#chatInput');const value=input.value.trim();if(value&&room){room.send('chat',value);input.value='';}});
document.querySelector('#quizOpen').addEventListener('click',()=>document.querySelector('#quizPanel').classList.remove('hidden'));
document.querySelector('#quizClose').addEventListener('click',()=>document.querySelector('#quizPanel').classList.add('hidden'));
document.querySelector('#quizStart').addEventListener('click',()=>{if(room){room.send('quizStart');document.querySelector('#quizStatus').textContent='Starting quiz…';}});
function holdButton(el,key){el.addEventListener('pointerdown',e=>{e.preventDefault();keys[key]=true;});['pointerup','pointerleave','pointercancel'].forEach(ev=>el.addEventListener(ev,()=>keys[key]=false));}
document.querySelectorAll('[data-key]').forEach(el=>holdButton(el,el.dataset.key));
document.querySelector('#jump').addEventListener('pointerdown',()=>{if(onGround){vy=8;onGround=false;}});
const creator=document.querySelector('#creator');
const palettes={
 skins:['#f2c9a5','#d9a17b','#b87958','#87583f','#593a2b'],
 hairs:['#211914','#493024','#8a5a32','#d0b078','#20242b'],
 shirts:['#426fe8','#202a38','#b83e45','#2f765b','#d5d8df','#7d55b5'],
 pants:['#202b3b','#343434','#596b82','#6a4937','#252c27'],
 shoes:['#17191d','#f0f0ec','#7e3737','#343c4d']
};
function renderSwatches(id,key,values){
 const host=document.getElementById(id);host.innerHTML='';
 values.forEach(color=>{const b=document.createElement('button');b.className='swatch'+(profile[key]===color?' selected':'');b.style.background=color;b.title=color;b.addEventListener('click',()=>{profile[key]=color;renderCreator();replaceMyAvatar();});host.append(b);});
}
function renderCreator(){
 document.querySelectorAll('[data-gender]').forEach(b=>b.classList.toggle('active',b.dataset.gender===profile.gender));
 document.querySelectorAll('[data-hair]').forEach(b=>b.classList.toggle('active',b.dataset.hair===profile.hairStyle));
 renderSwatches('skins','skin',palettes.skins);renderSwatches('hairs','hair',palettes.hairs);
 renderSwatches('shirts','shirt',palettes.shirts);renderSwatches('pants','pants',palettes.pants);renderSwatches('shoes','shoes',palettes.shoes);
}
function replaceMyAvatar(){const pos=me.position.clone(),rot=me.rotation.y;scene.remove(me);me=makePlayer(profile);me.position.copy(pos);me.rotation.y=rot;scene.add(me);}
document.querySelectorAll('[data-gender]').forEach(b=>b.addEventListener('click',()=>{profile.gender=b.dataset.gender;renderCreator();replaceMyAvatar();}));
document.querySelectorAll('[data-hair]').forEach(b=>b.addEventListener('click',()=>{profile.hairStyle=b.dataset.hair;renderCreator();replaceMyAvatar();}));
document.querySelector('#editProfile').addEventListener('click',()=>{document.querySelector('#username').value=profile.username;renderCreator();creator.classList.remove('hidden');});
document.querySelector('#closeCreator').addEventListener('click',()=>creator.classList.add('hidden'));
document.querySelector('#saveProfile').addEventListener('click',()=>{
 profile.username=cleanName(document.querySelector('#username').value);
 try{localStorage.setItem('emlee-profile',JSON.stringify(profile));}catch{}
 if(signedInUser){fetch(`${API_BASE}/api/profile`,{method:'POST',credentials:'include',headers:{'content-type':'application/json'},body:JSON.stringify({profile})}).catch(console.warn);}
 replaceMyAvatar();updatePlayerList();creator.classList.add('hidden');
 if(room)room.send('profile',profile);
});
const clock=new THREE.Clock();
function animate(){
 requestAnimationFrame(animate);const dt=Math.min(clock.getDelta(),.04);
 const forward=(keys.w||keys.arrowup?1:0)-(keys.s||keys.arrowdown?1:0);
 const side=(keys.d||keys.arrowright?1:0)-(keys.a||keys.arrowleft?1:0);
 const speed=keys.shift?13:7,dir=new THREE.Vector3(Math.sin(yaw),0,Math.cos(yaw)),right=new THREE.Vector3(Math.cos(yaw),0,-Math.sin(yaw));
 me.position.addScaledVector(dir,-forward*speed*dt);me.position.addScaledVector(right,side*speed*dt);
 me.position.x=THREE.MathUtils.clamp(me.position.x,-215,215);me.position.z=THREE.MathUtils.clamp(me.position.z,-215,215);
 if(forward||side)me.rotation.y=yaw;
 if(keys[' ']&&onGround){vy=8;onGround=false;}vy-=22*dt;me.position.y+=vy*dt;
 if(me.position.y<0){me.position.y=0;vy=0;onGround=true;}
 const target=new THREE.Vector3(me.position.x,me.position.y+2.25,me.position.z);
 const offset=new THREE.Vector3(Math.sin(yaw)*8,4.2+pitch*4,Math.cos(yaw)*8);
 camera.position.lerp(target.clone().add(offset),1-Math.pow(.001,dt));camera.lookAt(target);
 for(const r of remotes.values())if(r.target){r.mesh.position.lerp(r.target,Math.min(1,dt*12));r.mesh.rotation.y=r.yaw||0;}
 sendTimer+=dt;if(room&&sendTimer>.07){sendTimer=0;room.send('move',{x:me.position.x,y:me.position.y,z:me.position.z,yaw});}
 renderer.render(scene,camera);
}
animate();
addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);});
renderCreator();updatePlayerList();
