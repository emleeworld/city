import { createServer } from 'node:http';
import { randomBytes, createHash } from 'node:crypto';
import { Server, Room } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';
import pg from 'pg';

const { Pool } = pg;
const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
const allowedColors = new Set([
 '#f2c9a5','#d9a17b','#b87958','#87583f','#593a2b','#211914','#493024','#8a5a32','#d0b078','#20242b',
 '#426fe8','#202a38','#b83e45','#2f765b','#d5d8df','#7d55b5','#202b3b','#343434','#596b82','#6a4937',
 '#252c27','#17191d','#f0f0ec','#7e3737','#343c4d'
]);
function sanitizeProfile(input={}) {
 const color=(v,f)=>allowedColors.has(v)?v:f;
 return {
  username:String(input.username||'Player').replace(/[<>]/g,'').trim().slice(0,20)||'Player',
  gender:input.gender==='female'?'female':'male',
  skin:color(input.skin,'#b87958'),hair:color(input.hair,'#211914'),shirt:color(input.shirt,'#426fe8'),
  pants:color(input.pants,'#202b3b'),shoes:color(input.shoes,'#17191d'),
  hairStyle:input.hairStyle==='long'?'long':'short'
 };
}
const pool = process.env.DATABASE_URL ? new Pool({
 connectionString:process.env.DATABASE_URL,
 ssl:process.env.DATABASE_SSL==='false'?false:{rejectUnauthorized:false}
}) : null;
const sessions = new Map();
const oauthStates = new Map();
const clientOrigin = process.env.CLIENT_ORIGIN || 'http://localhost:5173';
const redirectUri = process.env.GOOGLE_REDIRECT_URI || `http://localhost:${process.env.PORT||2567}/auth/google/callback`;
const cookieName='emlee_sid';
const cookie = (req,name) => (req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith(name+'='))?.slice(name.length+1);
const send = (res,status,obj,headers={}) => {res.writeHead(status,{'content-type':'application/json; charset=utf-8',...headers});res.end(JSON.stringify(obj));};
const readBody = req => new Promise((resolve,reject)=>{let s='';req.on('data',c=>{s+=c;if(s.length>20000)reject(new Error('body too large'));});req.on('end',()=>{try{resolve(JSON.parse(s||'{}'));}catch{reject(new Error('invalid json'));}});});
async function initDb(){
 if(!pool)return;
 await pool.query(`CREATE TABLE IF NOT EXISTS emlee_users(
  google_sub TEXT PRIMARY KEY, email TEXT, display_name TEXT, youtube_channel_id TEXT,
  youtube_handle TEXT, created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW()
 )`);
 await pool.query(`CREATE TABLE IF NOT EXISTS emlee_profiles(
  google_sub TEXT PRIMARY KEY REFERENCES emlee_users(google_sub) ON DELETE CASCADE,
  profile JSONB NOT NULL DEFAULT '{}'::jsonb, updated_at TIMESTAMPTZ DEFAULT NOW()
 )`);
}
async function getUser(req){
 const sid=cookie(req,cookieName); if(!sid)return null;
 const session=sessions.get(sid); if(!session)return null;
 return session;
}
async function route(req,res){
 const url=new URL(req.url,'http://localhost');
 if(req.method==='OPTIONS'){res.writeHead(204,{ 'access-control-allow-origin':clientOrigin,'access-control-allow-credentials':'true','access-control-allow-headers':'content-type','access-control-allow-methods':'GET,POST,OPTIONS'});return res.end();}
 res.setHeader('access-control-allow-origin',clientOrigin);res.setHeader('access-control-allow-credentials','true');res.setHeader('vary','Origin');
 if(url.pathname==='/health'&&req.method==='GET')return send(res,200,{ok:true,database:!!pool});
 if(url.pathname==='/auth/google'&&req.method==='GET'){
  if(!process.env.GOOGLE_CLIENT_ID||!process.env.GOOGLE_CLIENT_SECRET)return send(res,503,{error:'Google OAuth is not configured on the server.'});
  const state=randomBytes(24).toString('hex');oauthStates.set(state,Date.now());
  const params=new URLSearchParams({client_id:process.env.GOOGLE_CLIENT_ID,redirect_uri:redirectUri,response_type:'code',scope:'openid email profile https://www.googleapis.com/auth/youtube.readonly',state,access_type:'offline',prompt:'select_account'});
  res.writeHead(302,{location:`https://accounts.google.com/o/oauth2/v2/auth?${params}`});return res.end();
 }
 if(url.pathname==='/auth/google/callback'&&req.method==='GET'){
  const state=url.searchParams.get('state'),code=url.searchParams.get('code');
  const created=oauthStates.get(state);oauthStates.delete(state);
  if(!created||Date.now()-created>10*60*1000||!code){res.writeHead(302,{location:`${clientOrigin}/?login=failed`});return res.end();}
  try{
   const tokenRes=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({code,client_id:process.env.GOOGLE_CLIENT_ID,client_secret:process.env.GOOGLE_CLIENT_SECRET,redirect_uri:redirectUri,grant_type:'authorization_code'})});
   const tokens=await tokenRes.json();if(!tokenRes.ok)throw new Error('Google token exchange failed');
   const userRes=await fetch('https://www.googleapis.com/oauth2/v3/userinfo',{headers:{authorization:`Bearer ${tokens.access_token}`}});
   const user=await userRes.json();if(!user.sub)throw new Error('Google profile unavailable');
   const ytRes=await fetch('https://www.googleapis.com/youtube/v3/channels?part=id,snippet&mine=true',{headers:{authorization:`Bearer ${tokens.access_token}`}});
   const yt=await ytRes.json();const channel=yt.items?.[0];
   const handle=channel?.snippet?.customUrl?.startsWith('@')?channel.snippet.customUrl:null;
   if(pool)await pool.query(`INSERT INTO emlee_users(google_sub,email,display_name,youtube_channel_id,youtube_handle)
    VALUES($1,$2,$3,$4,$5) ON CONFLICT(google_sub) DO UPDATE SET email=EXCLUDED.email,display_name=EXCLUDED.display_name,
    youtube_channel_id=EXCLUDED.youtube_channel_id,youtube_handle=EXCLUDED.youtube_handle,updated_at=NOW()`,
    [user.sub,user.email||null,user.name||null,channel?.id||null,handle]);
   const sid=randomBytes(32).toString('hex');sessions.set(sid,{sub:user.sub,email:user.email||null,name:user.name||'Player',youtubeChannelId:channel?.id||null,youtubeHandle:handle,accessToken:tokens.access_token});
   res.writeHead(302,{location:`${clientOrigin}/?login=success`, 'set-cookie':`${cookieName}=${sid}; HttpOnly; Secure; SameSite=None; Path=/; Max-Age=604800`});return res.end();
  }catch(err){console.error('OAuth callback:',err.message);res.writeHead(302,{location:`${clientOrigin}/?login=failed`});return res.end();}
 }
 if(url.pathname==='/auth/logout'&&req.method==='POST'){
  const sid=cookie(req,cookieName);if(sid)sessions.delete(sid);
  res.writeHead(200,{'set-cookie':`${cookieName}=; HttpOnly; Secure; SameSite=None; Path=/; Max-Age=0`,'content-type':'application/json'});return res.end('{"ok":true}');
 }
 if(url.pathname==='/api/me'&&req.method==='GET'){
  const u=await getUser(req);return send(res,200,{authenticated:!!u,user:u?{name:u.name,email:u.email,youtubeChannelId:u.youtubeChannelId,youtubeHandle:u.youtubeHandle}:null});
 }
 if(url.pathname==='/api/profile'&&req.method==='GET'){
  const u=await getUser(req);if(!u)return send(res,401,{error:'Sign in first'});
  if(!pool)return send(res,503,{error:'DATABASE_URL is not configured'});
  const result=await pool.query('SELECT profile FROM emlee_profiles WHERE google_sub=$1',[u.sub]);return send(res,200,{profile:result.rows[0]?.profile||null});
 }
 if(url.pathname==='/api/profile'&&req.method==='POST'){
  const u=await getUser(req);if(!u)return send(res,401,{error:'Sign in first'});
  if(!pool)return send(res,503,{error:'DATABASE_URL is not configured'});
  const body=await readBody(req);const profile=sanitizeProfile(body.profile||{});
  if(u.youtubeHandle)profile.username=u.youtubeHandle;
  await pool.query(`INSERT INTO emlee_profiles(google_sub,profile) VALUES($1,$2::jsonb)
   ON CONFLICT(google_sub) DO UPDATE SET profile=EXCLUDED.profile,updated_at=NOW()`,[u.sub,JSON.stringify(profile)]);
  return send(res,200,{ok:true,profile});
 }
 return send(res,404,{error:'Not found'});
}
const QUIZ_QUESTIONS = [
  { q: 'Which planet is known as the Red Planet?', a: ['Venus', 'Mars', 'Jupiter', 'Mercury'], correct: 1 },
  { q: 'How many sides does a hexagon have?', a: ['Five', 'Six', 'Seven', 'Eight'], correct: 1 },
  { q: 'Which ocean is the largest?', a: ['Atlantic', 'Indian', 'Pacific', 'Arctic'], correct: 2 },
  { q: 'What is the capital of Japan?', a: ['Seoul', 'Tokyo', 'Beijing', 'Bangkok'], correct: 1 },
  { q: 'Which gas do plants absorb from the air?', a: ['Oxygen', 'Nitrogen', 'Carbon dioxide', 'Helium'], correct: 2 }
];

class CityRoom extends Room {
  maxClients = 24;
  onCreate() {
    this.players = new Map();
    this.quiz = { active: false, questionIndex: -1, scores: {}, endsAt: 0 };
    this.quizTimer = null;
    this.setSimulationInterval(() => {
      this.broadcast('snapshot', Object.fromEntries(this.players));
    }, 100);

    this.onMessage('move', (client, data) => {
      if (!data || !Number.isFinite(data.x) || !Number.isFinite(data.z)) return;
      const p = this.players.get(client.sessionId);
      if (!p) return;
      p.x = Math.max(-215, Math.min(215, data.x));
      p.y = Math.max(0, Math.min(10, Number(data.y) || 0));
      p.z = Math.max(-215, Math.min(215, data.z));
      p.yaw = Number(data.yaw) || 0;
    });
    this.onMessage('profile', (client, data) => {
      const p = this.players.get(client.sessionId);
      if (p) p.profile = { ...p.profile, username: String(data?.username || p.profile.username).replace(/[<>]/g, '').slice(0, 20) };
    });
    this.onMessage('friendRequest', (client, targetId) => {
      const target = this.clients.find(c => c.sessionId === targetId);
      const from = this.players.get(client.sessionId);
      const to = this.players.get(targetId);
      if (!target || !from || !to || targetId === client.sessionId || from.friends.includes(targetId) || to.incoming.includes(client.sessionId)) return;
      const dx=from.x-to.x,dz=from.z-to.z;
      if (Math.hypot(dx,dz)>12) return client.send('notice',{text:'Move closer before sending a friend request.'});
      to.incoming.push(client.sessionId);
      target.send('friendRequest',{fromId:client.sessionId,fromName:from.profile.username});
      client.send('notice',{text:`Friend request sent to ${to.profile.username}.`});
    });
    this.onMessage('friendRespond', (client, data) => {
      const p=this.players.get(client.sessionId), other=this.players.get(data?.fromId);
      const otherClient=this.clients.find(c=>c.sessionId===data?.fromId);
      if(!p||!other||!p.incoming.includes(data.fromId))return;
      p.incoming=p.incoming.filter(id=>id!==data.fromId);
      if(data.accept){
        if(!p.friends.includes(data.fromId))p.friends.push(data.fromId);
        if(!other.friends.includes(client.sessionId))other.friends.push(client.sessionId);
        client.send('friendAdded',{id:data.fromId,name:other.profile.username,friends:p.friends.length});
        otherClient?.send('friendAdded',{id:client.sessionId,name:p.profile.username,friends:other.friends.length});
      }
      client.send('socialCounts',{friends:p.friends.length});
    });
    this.onMessage('chat', text => {
      const p=this.players.get(client.sessionId); if(!p)return;
      const message=String(text||'').trim().slice(0,180); if(!message)return;
      for(const peer of this.clients){
        const other=this.players.get(peer.sessionId); if(!other)continue;
        if(peer.sessionId===client.sessionId || Math.hypot(p.x-other.x,p.z-other.z)<=24)
          peer.send('chatMessage',{name:p.profile.username,text:message,from:client.sessionId});
      }
    });
    this.onMessage('quizStart', client => {
      if(this.quiz.active)return client.send('notice',{text:'A Live Quiz is already running.'});
      this.quiz={active:true,questionIndex:0,scores:{},endsAt:Date.now()+20000};
      for(const id of this.players.keys())this.quiz.scores[id]=0;
      this.broadcast('quizState',{active:true,questionIndex:0,total:QUIZ_QUESTIONS.length,question:QUIZ_QUESTIONS[0].q,options:QUIZ_QUESTIONS[0].a,endsAt:this.quiz.endsAt,scores:this.quiz.scores});
      this.scheduleQuizAdvance();
    });
    this.onMessage('quizAnswer', (client, answer) => {
      if(!this.quiz.active || Date.now()>this.quiz.endsAt)return;
      const q=QUIZ_QUESTIONS[this.quiz.questionIndex];
      if(!q || !Number.isInteger(answer) || answer<0 || answer>3)return;
      const p=this.players.get(client.sessionId); if(!p)return;
      if(p.lastQuizQuestion===this.quiz.questionIndex)return;
      p.lastQuizQuestion=this.quiz.questionIndex;
      if(answer===q.correct){
        const speedBonus=Math.max(0,Math.floor((this.quiz.endsAt-Date.now())/1000));
        this.quiz.scores[client.sessionId]=(this.quiz.scores[client.sessionId]||0)+10+speedBonus;
        client.send('notice',{text:`Correct answer! +${10+speedBonus} quiz points.`});
      } else client.send('notice',{text:'Not quite! Try the next question.'});
      this.broadcast('quizScores',{scores:this.quiz.scores});
    });
  }
  scheduleQuizAdvance() {
    clearTimeout(this.quizTimer);
    this.quizTimer=setTimeout(()=>{
      if(!this.quiz.active)return;
      this.quiz.questionIndex++;
      if(this.quiz.questionIndex>=QUIZ_QUESTIONS.length){
        this.quiz.active=false;
        const ranking=Object.entries(this.quiz.scores).map(([id,score])=>({id,score,name:this.players.get(id)?.profile.username||'Player'})).sort((a,b)=>b.score-a.score);
        this.broadcast('quizFinished',{ranking});
        this.broadcast('quizState',{active:false});
        return;
      }
      const q=QUIZ_QUESTIONS[this.quiz.questionIndex];
      this.quiz.endsAt=Date.now()+20000;
      for(const p of this.players.values())p.lastQuizQuestion=-1;
      this.broadcast('quizState',{active:true,questionIndex:this.quiz.questionIndex,total:QUIZ_QUESTIONS.length,question:q.q,options:q.a,endsAt:this.quiz.endsAt,scores:this.quiz.scores});
      this.scheduleQuizAdvance();
    },20000);
  }
  onJoin(client, options) {
    this.players.set(client.sessionId,{x:0,y:0,z:0,yaw:0,profile:options?.profile||{username:'Player'},friends:[],incoming:[],lastQuizQuestion:-1});
    client.send('socialCounts',{friends:0});
    if(this.quiz.active){const q=QUIZ_QUESTIONS[this.quiz.questionIndex];client.send('quizState',{active:true,questionIndex:this.quiz.questionIndex,total:QUIZ_QUESTIONS.length,question:q.q,options:q.a,endsAt:this.quiz.endsAt,scores:this.quiz.scores});}
  }
  onLeave(client) {
    this.players.delete(client.sessionId);
    for(const p of this.players.values()){
      p.friends=p.friends.filter(id=>id!==client.sessionId);
      p.incoming=p.incoming.filter(id=>id!==client.sessionId);
    }
  }
}

const port=Number(process.env.PORT||2567);
const httpServer=createServer((req,res)=>{route(req,res).catch(err=>{console.error(err);if(!res.headersSent)send(res,500,{error:'Server error'});});});
const gameServer=new Server({transport:new WebSocketTransport({server:httpServer,pingInterval:3000})});
gameServer.define('city',CityRoom);
await initDb();
await gameServer.listen(port);
console.log(`emLee WORLD server listening on ${port}; persistent DB: ${!!pool}`);
