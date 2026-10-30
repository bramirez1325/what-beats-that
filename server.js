'use strict';
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const crypto = require('crypto');
const path = require('path');
const app = express();
app.use(express.static(path.join(__dirname, 'public')));
const server = http.createServer(app);
const io = new Server(server);
const rooms = new Map();
const ROUNDS = 7, SUBMIT_MS = 20000, VOTE_MS = 15000, REVEAL_MS = 8500;
const starters = ['Rock', 'A very angry goose', 'A toaster', 'A giant marshmallow', 'A dragon'];
const random = n => crypto.randomInt(n);
const clean = (s, max) => String(typeof s === 'string' ? s : '').trim().replace(/[\u0000-\u001f\u007f]/g, '').slice(0, max);
const codeFor = () => { let c; do { c = crypto.randomBytes(3).toString('hex').toUpperCase(); } while (rooms.has(c)); return c; };
const online = r => [...r.players.values()].filter(p=>p.socketId);
function state(r, p) {
 return {code:r.code, phase:r.phase, round:r.round, maxRounds:ROUNDS, prompt:r.prompt, previousPrompt:r.previousPrompt,
  deadline:r.deadline, serverNow:Date.now(), host:r.host===p.id, me:p.id,
  players:[...r.players.values()].map(x=>({id:x.id,name:x.name,score:x.score,online:!!x.socketId,submitted:r.submissions.has(x.id),voted:r.votes.has(x.id)})),
  answers:['vote','reveal','finished'].includes(r.phase)?r.options.map(o=>({id:o.id,text:o.text,own:o.player===p.id,votes:r.phase==='vote'?null:o.votes})):[],
  myAnswer:r.submissions.get(p.id)||'',myVote:r.votes.get(p.id)||null,
  winner:r.phase==='reveal'?r.winner:null,message:r.message||''};
}
function broadcast(r) {for(const p of r.players.values()){if(p.socketId)io.to(p.socketId).emit('state',state(r,p));}}
function timer(r,ms,callback){clearTimeout(r.timer);r.deadline=Date.now()+ms;r.timer=setTimeout(()=>{if(rooms.get(r.code)===r)callback(r);},ms);}
function beginRound(r){r.round++;r.phase='submit';r.previousPrompt=r.prompt;r.submissions=new Map();r.votes=new Map();r.options=[];r.winner=null;r.message='';timer(r,SUBMIT_MS,beginVote);broadcast(r);}
function beginVote(r){if(r.phase!=='submit')return;r.options=[...r.submissions].map(([player,text])=>({id:crypto.randomUUID(),player,text,votes:0}));r.phase='vote';
 if(!r.options.length){finishVote(r);return;}timer(r,VOTE_MS,finishVote);broadcast(r);}
function finishVote(r){if(r.phase!=='vote')return;
 for(const [voter,id] of r.votes){const o=r.options.find(x=>x.id===id);if(o&&o.player!==voter)o.votes++;}
 for(const o of r.options){const p=r.players.get(o.player);if(p)p.score+=o.votes;}
 const max=Math.max(0,...r.options.map(o=>o.votes));const leaders=r.options.filter(o=>o.votes===max);
 const chosen=leaders.length?leaders[random(leaders.length)]:null;
 if(chosen){const p=r.players.get(chosen.player);if(p)p.score+=2;r.prompt=chosen.text;r.winner={id:chosen.id,text:chosen.text,author:p?.name||'Player',votes:chosen.votes};r.message=leaders.length>1?'Tied vote — winner chosen randomly.':'';}
 else r.message='No answers this round — the challenge stays the same.';
 r.phase='reveal';timer(r,REVEAL_MS,()=>{if(r.round>=ROUNDS){r.phase='finished';r.deadline=0;broadcast(r);}else beginRound(r);});broadcast(r);
}
function maybeAdvance(r){if(r.phase==='submit'&&online(r).every(p=>r.submissions.has(p.id)))beginVote(r);
 else if(r.phase==='vote'&&online(r).every(p=>r.votes.has(p.id)||!r.options.some(o=>o.player!==p.id)))finishVote(r);
 else broadcast(r);}
function leave(socket,permanent=false){const code=socket.data.room,id=socket.data.player;if(!code||!id)return;socket.data.room=null;socket.data.player=null;socket.leave(code);
 const r=rooms.get(code),p=r?.players.get(id);if(!p||p.socketId!==socket.id)return;
 p.socketId=null;if(permanent&&r.phase==='lobby')r.players.delete(id);
 if(r.host===id&&!r.players.get(id)?.socketId){const replacement=online(r)[0];if(replacement)r.host=replacement.id;}
 if(!online(r).length){clearTimeout(r.timer);rooms.delete(code);return;}maybeAdvance(r);
}
function enter(socket,r,p,reply){leave(socket,true);p.socketId=socket.id;socket.data.room=r.code;socket.data.player=p.id;socket.join(r.code);reply({ok:true,code:r.code,token:p.token});broadcast(r);}
io.on('connection',socket=>{
 socket.on('create',(data={},reply=()=>{})=>{const name=clean(data.name,20);if(!name)return reply({error:'Enter a nickname.'});const code=codeFor(),id=crypto.randomUUID(),token=crypto.randomBytes(24).toString('hex');
 const p={id,token,name,score:0,socketId:null};const r={code,players:new Map([[id,p]]),host:id,phase:'lobby',round:0,prompt:starters[random(starters.length)],previousPrompt:'',deadline:0,submissions:new Map(),votes:new Map(),options:[],winner:null,message:'',timer:null};rooms.set(code,r);enter(socket,r,p,reply);});
 socket.on('join',(data={},reply=()=>{})=>{const name=clean(data.name,20),code=clean(data.code,6).toUpperCase(),r=rooms.get(code);if(!name)return reply({error:'Enter a nickname.'});if(!r)return reply({error:'Room not found.'});if(r.phase!=='lobby')return reply({error:'Game already started.'});if(r.players.size>=10)return reply({error:'Room is full.'});
 const id=crypto.randomUUID(),token=crypto.randomBytes(24).toString('hex'),p={id,token,name,score:0,socketId:null};r.players.set(id,p);enter(socket,r,p,reply);});
 socket.on('resume',(data={},reply=()=>{})=>{const r=rooms.get(clean(data.code,6).toUpperCase());const p=r&&[...r.players.values()].find(x=>x.token===data.token);if(!p)return reply({error:'Previous room is no longer available.'});if(p.socketId&&p.socketId!==socket.id){const old=io.sockets.sockets.get(p.socketId);if(old){old.data.room=null;old.data.player=null;old.emit('notice','Your session was opened on another device.');old.leave(r.code);}}
 enter(socket,r,p,reply);});
 socket.on('start',()=>{const r=rooms.get(socket.data.room);if(!r||r.host!==socket.data.player||r.phase!=='lobby')return;if(online(r).length<2)return socket.emit('notice','Invite at least one other player.');beginRound(r);});
 socket.on('submit',raw=>{const r=rooms.get(socket.data.room),id=socket.data.player;if(!r||!r.players.get(id)?.socketId||r.phase!=='submit'||Date.now()>r.deadline||r.submissions.has(id))return;
 const answer=clean(raw,80);if(!answer)return socket.emit('notice','Enter an answer.');if([...r.submissions.values()].some(v=>v.toLowerCase()===answer.toLowerCase()))return socket.emit('notice','That answer was already submitted. Try another.');r.submissions.set(id,answer);maybeAdvance(r);});
 socket.on('vote',optionId=>{const r=rooms.get(socket.data.room),id=socket.data.player;if(!r||r.phase!=='vote'||Date.now()>r.deadline||r.votes.has(id))return;const o=r.options.find(x=>x.id===optionId);if(!o||o.player===id)return socket.emit('notice','You cannot vote for yourself.');r.votes.set(id,optionId);maybeAdvance(r);});
 socket.on('reaction',raw=>{const r=rooms.get(socket.data.room),id=socket.data.player;
  if(!r||!r.players.get(id)||r.players.get(id).socketId!==socket.id||!['vote','reveal'].includes(r.phase))return;
  const allowed=['😂','💀','🔥','🤯','👏','😭'];if(!allowed.includes(raw))return;
  const now=Date.now();if(now-(socket.data.lastReaction||0)<650)return;
  socket.data.lastReaction=now;io.to(r.code).emit('reaction',{emoji:raw,player:r.players.get(id).name,at:now});
 });
 socket.on('again',()=>{const r=rooms.get(socket.data.room);if(!r||r.host!==socket.data.player||r.phase!=='finished')return;r.phase='lobby';r.round=0;r.prompt=starters[random(starters.length)];r.players.forEach(p=>p.score=0);r.submissions.clear();r.votes.clear();r.options=[];r.winner=null;r.message='';broadcast(r);});
 socket.on('disconnect',()=>leave(socket));
});
const PORT=process.env.PORT||3000;
if(require.main===module)server.listen(PORT,()=>console.log(`What Beats That?! http://localhost:${PORT}`));
module.exports={server,io,rooms};
