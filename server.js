const express = require('express');
const http    = require('http');
const { Server } = require('socket.io');
const cors    = require('cors');

// ─── ELEMENT DATA (inlined) ──────────────────────────────────────────────────
// ─── ELEMENT & MOVE DEFINITIONS ──────────────────────────────────────────────

const UPGRADED_MOVES = {
    AIR:   { name: 'Gale Force',    dmg: 22, cd: 280,  speed: 90, shape: 'sphere',      size: 0.3,  knockback: 0.8 },
    EARTH: { name: 'Boulder Slam',  dmg: 45, cd: 1100, speed: 28, grav: 1.2, shape: 'rock', size: 0.55 },
    FIRE:  { name: 'Inferno Shot',  dmg: 30, cd: 320,  speed: 70, shape: 'icosahedron', size: 0.35, knockback: 0.3 },
    WATER: { name: 'Torrent',       dmg: 24, cd: 280,  speed: 60, grav: 0.05, shape: 'sphere', size: 0.35, knockback: 0.5 }
};

const BOSS_REWARD_MOVES = {
    AIR:       { name: 'Cyclone',     dmg: 12,  cd: 5000,  speed: 35,  shape: 'sphere',      count: 30, spread: 0.5, auto: true, size: 0.35, knockback: 1.5 },
    EARTH:     { name: 'Earthquake',  dmg: 40,  cd: 9000,  type: 'groundSpikes', count: 12 },
    FIRE:      { name: 'Firestorm',   dmg: 180, cd: 12000, type: 'meteor', shape: 'icosahedron', size: 1.4, grav: 0.9 },
    WATER:     { name: 'Tidal Wave',  dmg: 40,  cd: 6000,  speed: 50,  shape: 'flat',        size: 0.35, scale: 8, knockback: 4.0 },
    LIGHTNING: { name: 'Thunder God', dmg: 60,  cd: 4000,  speed: 150, shape: 'lightning',   size: 0.35 }
};

const ELEMENTS = {
    AIR: { name: 'AIR', color: 0xffffff, moves: [
        { dmg: 10, cd: 350,   speed: 65, shape: 'sphere', size: 0.2 },
        { dmg: 18, cd: 3000,  speed: 50, shape: 'flat',   size: 0.2, scale: 3, knockback: 1.5 },
        { dmg: 0,  cd: 2500,  type: 'dash', maxCharges: 3 },
        { dmg: 6,  cd: 7000,  speed: 28, shape: 'sphere', count: 20, spread: 0.7, auto: true, size: 0.3, knockback: 1.0 }
    ]},
    EARTH: { name: 'EARTH', color: 0x8b4513, moves: [
        { dmg: 28, cd: 900,   speed: 32, grav: 0.9, shape: 'rock', size: 0.3 },
        { dmg: 25, cd: 4500,  type: 'groundSpikes' },
        { dmg: 0,  cd: 5000,  type: 'wall' },
        { dmg: 100, cd: 11000, type: 'meteor', shape: 'rock', size: 1.5, grav: 1.5 }
    ]},
    FIRE: { name: 'FIRE', color: 0xff4500, moves: [
        { dmg: 15, cd: 450,   speed: 55, shape: 'icosahedron', size: 0.2 },
        { dmg: 50, cd: 4000,  speed: 28, shape: 'octahedron',  size: 0.5, knockback: 0.5 },
        { dmg: 8,  cd: 4500,  speed: 20, shape: 'tetrahedron', count: 15, spread: 1.2, auto: true, size: 0.2 },
        { dmg: 130, cd: 14000, type: 'meteor', shape: 'icosahedron', size: 1.0, grav: 1.0 }
    ]},
    WATER: { name: 'WATER', color: 0x0088ff, moves: [
        { dmg: 16, cd: 380,  speed: 45, grav: 0.1, shape: 'sphere',   size: 0.2 },
        { dmg: 28, cd: 4000, speed: 38, shape: 'flat',     size: 0.2, scale: 5, knockback: 2.5 },
        { dmg: 22, cd: 3000, speed: 58, shape: 'cylinder', size: 0.4 },
        { dmg: 18, cd: 8000, type: 'whirlpool' }
    ]},
    LIGHTNING: { name: 'LIGHTNING', color: 0x00ffff, moves: [
        { dmg: 35, cd: 1500,  speed: 120, shape: 'lightning', size: 0.2 },
        { dmg: 0,  cd: 15000, type: 'flash' },
        { dmg: 0,  cd: 1000,  type: 'dash', maxCharges: 2 },
        { dmg: 15, cd: 6000,  speed: 80, shape: 'sphere', count: 15, spread: 1.5, auto: true, size: 0.2 }
    ]}
};



const app = express();
app.use(cors());
app.use(express.static('.'));  // serve index.html and client JS files
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

let projCounter = 0;
let slowMo = { active: false, owner: null, expires: 0 };

// ─── BOSS ─────────────────────────────────────────────────────────────────────
const BOSS_ARENA = { x: 120, z: 0, radius: 28 };
let boss = {
    alive: true, hp: 3000, maxHp: 3000,
    x: 120, y: 0, z: 0, vx: 0, vz: 0, yaw: 0,
    phase: 1, attackTimer: 0, moveTimer: 0, targetId: null, respawnTimer: 0
};

// ─── SKY SHRINES ──────────────────────────────────────────────────────────────
const SHRINES = {
    AIR:   { x:    0, y: 80, z: -140, collected: new Set() },
    EARTH: { x:  140, y: 55, z:    0, collected: new Set() },
    FIRE:  { x: -140, y: 65, z:    0, collected: new Set() },
    WATER: { x:    0, y: 60, z:  140, collected: new Set() }
};

const players    = {};
const projectiles = [];
const TICK_RATE  = 30;
const DELTA      = 1 / TICK_RATE;
const WALL_HALF_W = 3.0, WALL_HALF_H = 2.0, WALL_HALF_D = 0.5;

// ─── HELPERS ─────────────────────────────────────────────────────────────────
function getDir(yaw, pitch) {
    return { x: -Math.sin(yaw)*Math.cos(pitch), y: Math.sin(pitch), z: -Math.cos(yaw)*Math.cos(pitch) };
}
function getFlatDir(yaw) { return { x: -Math.sin(yaw), z: -Math.cos(yaw) }; }
function toWallLocal(dx, dz, yaw) {
    const cos=Math.cos(yaw), sin=Math.sin(yaw);
    return { localX: dx*cos+dz*sin, localZ: -dx*sin+dz*cos };
}
function fromWallLocal(lx, lz, yaw) {
    const cos=Math.cos(yaw), sin=Math.sin(yaw);
    return { wx: lx*cos-lz*sin, wz: lx*sin+lz*cos };
}
function dist2D(ax, az, bx, bz) {
    const dx=ax-bx, dz=az-bz; return Math.sqrt(dx*dx+dz*dz);
}

// ─── BOSS ATTACKS ─────────────────────────────────────────────────────────────
function bossFireAt(target) {
    const dx=target.x-boss.x, dy=(target.y+0.9)-(boss.y+3), dz=target.z-boss.z;
    const len=Math.sqrt(dx*dx+dy*dy+dz*dz)||1;
    const spd=boss.phase===2?28:20;
    projectiles.push({
        id:'bproj_'+(projCounter++), ownerId:'BOSS',
        x:boss.x, y:boss.y+3, z:boss.z,
        vx:(dx/len)*spd, vy:(dy/len)*spd+2, vz:(dz/len)*spd,
        gravity:0.4, life:200, dmg:boss.phase===2?18:12,
        shape:'rock', color:0x8b4513, size:0.4, knockback:0.5
    });
}
function bossStomp() {
    const count=boss.phase===2?10:6;
    for (let i=0;i<count;i++) {
        const angle=(i/count)*Math.PI*2;
        const r=4+Math.random()*5;
        setTimeout(()=>{
            projectiles.push({
                id:'bproj_'+(projCounter++), ownerId:'BOSS',
                x:boss.x+Math.cos(angle)*r, y:0, z:boss.z+Math.sin(angle)*r,
                vx:0, vy:0, vz:0, gravity:0,
                life:35, dmg:20, shape:'spike',
                color:0x5a2d0c, size:0.6, isGroundSpike:true, rootTime:1500
            });
        }, i*80);
    }
}

// ─── SOCKET EVENTS ────────────────────────────────────────────────────────────
io.on('connection', (socket) => {
    socket.on('joinGame', (data) => {
        if (!ELEMENTS[data.element]) return;
        const defaultCharges = ELEMENTS[data.element].moves.map(m => m.maxCharges||1);
        players[socket.id] = {
            id:socket.id, name:data.name, role:'player',
            ogElement:data.element, element:data.element, unlockedElements:[data.element],
            hp:100, x:0, y:0, z:0, vx:0, vy:0, vz:0, yaw:0, pitch:0,
            isFrozen:false, isJailed:false, isMuted:false, godMode:false, noCooldowns:false, rootUntil:0,
            charges:[...defaultCharges], rechargeTimers:[0,0,0,0],
            inputs:{forward:false,backward:false,left:false,right:false,jump:false,sprint:false},
            shrineCollected:false, bossRewardCollected:false,
            upgradedMove:null, bossRewardMove:null
        };
        socket.emit('joinSuccess', { id: socket.id });
    });

    socket.on('setRole', (role) => {
        if (players[socket.id] && (role==='admin'||role==='owner')) players[socket.id].role = role;
    });

    socket.on('chatMessage', (msg) => {
        const p=players[socket.id];
        if (!p||p.isMuted) return;
        io.emit('chatMessage', { name:p.name, text:String(msg).substring(0,100) });
    });

    socket.on('input', (data) => {
        const p=players[socket.id];
        if (!p||p.isFrozen) return;
        p.inputs=data; p.yaw=data.yaw; p.pitch=data.pitch;
    });

    socket.on('switchElement', (elName) => {
        const p=players[socket.id];
        if (!p||p.isFrozen||!p.unlockedElements.includes(elName)||!ELEMENTS[elName]) return;
        p.element=elName;
        p.charges=ELEMENTS[elName].moves.map(m=>m.maxCharges||1);
        p.rechargeTimers=[0,0,0,0];
        p.upgradedMove = p.shrineCollected ? (UPGRADED_MOVES[elName]||null) : null;
    });

    socket.on('useMove', (index) => {
        const p=players[socket.id];
        if (!p||p.isFrozen) return;
        const elemStats=ELEMENTS[p.element];
        if (!elemStats||!elemStats.moves[index]) return;

        let move;
        if (index===0 && p.upgradedMove)   move = p.upgradedMove;
        else if (index===3 && p.bossRewardMove) move = p.bossRewardMove;
        else move = elemStats.moves[index];

        const now=Date.now();
        if (!p.noCooldowns && p.charges[index]<=0) return;
        if (!p.noCooldowns) {
            p.charges[index]--;
            if (p.charges[index]===(move.maxCharges||1)-1) p.rechargeTimers[index]=now+move.cd;
        }

        const dir=getDir(p.yaw, p.pitch);
        const flat=getFlatDir(p.yaw);

        if (move.type==='flash') {
            slowMo.active=true; slowMo.owner=socket.id; slowMo.expires=now+8000;
            io.emit('chatMessage',{name:'SYSTEM',text:`${p.name} used Flash! Time is slowing down...`});
            return;
        }
        if (move.type==='dash') {
            if (dir.y>0.4) { p.vy=25; p.vx+=dir.x*10; p.vz+=dir.z*10; }
            else { p.vx+=dir.x*40; p.vz+=dir.z*40; p.vy=5; }
            return;
        }
        if (move.type==='meteor') {
            const aimDist=25;
            projectiles.push({
                id:'proj_'+(projCounter++), ownerId:socket.id,
                x:p.x+dir.x*aimDist+(Math.random()-0.5)*1.5, y:p.y+30,
                z:p.z+dir.z*aimDist+(Math.random()-0.5)*1.5,
                vx:0, vy:-35, vz:0, gravity:move.grav||1.0,
                life:300, dmg:move.dmg, shape:move.shape,
                color:elemStats.color, size:move.size||1, knockback:1.5
            });
            return;
        }
        if (move.type==='wall') {
            const wallGroundY=Math.max(p.y,0);
            projectiles.push({
                id:'proj_'+(projCounter++), ownerId:socket.id,
                x:p.x+flat.x*6, y:wallGroundY+WALL_HALF_H, z:p.z+flat.z*6,
                vx:0, vy:0, vz:0, gravity:0, yaw:p.yaw,
                life:400, dmg:0, shape:'wall', color:elemStats.color, size:1.0, isSolid:true, hp:10
            });
            return;
        }
        if (move.type==='groundSpikes') {
            const spikeCount=move.count||5;
            for (let i=0;i<spikeCount;i++) {
                const delay=i*100, dist=3+i*2.2;
                const ax=p.x+dir.x*dist, az=p.z+dir.z*dist;
                setTimeout(()=>{
                    projectiles.push({
                        id:'proj_'+(projCounter++), ownerId:socket.id,
                        x:ax+(Math.random()-0.5)*0.4, y:0, z:az+(Math.random()-0.5)*0.4,
                        vx:0, vy:0, vz:0, gravity:0,
                        life:30, dmg:move.dmg, shape:'spike',
                        color:0x8b4513, size:0.5, rootTime:2000, isGroundSpike:true
                    });
                }, delay);
            }
            return;
        }
        if (move.type==='whirlpool') {
            for (let i=0;i<10;i++) {
                const angle=(i/10)*Math.PI*2, sd=3+Math.random()*1.5;
                setTimeout(()=>{
                    projectiles.push({
                        id:'proj_'+(projCounter++), ownerId:socket.id,
                        x:p.x+Math.cos(angle)*sd, y:0.3, z:p.z+Math.sin(angle)*sd,
                        vx:Math.cos(angle)*3, vy:0, vz:Math.sin(angle)*3,
                        gravity:0, life:120, dmg:move.dmg,
                        shape:'whirlpool', color:0x0088ff, size:0.6, knockback:2.0
                    });
                }, i*40);
            }
            return;
        }
        const count=move.count||1;
        for (let i=0;i<count;i++) {
            setTimeout(()=>{
                let dx=dir.x, dy=dir.y, dz=dir.z;
                if (move.spread>0) {
                    dx+=(Math.random()-0.5)*move.spread; dy+=(Math.random()-0.5)*move.spread; dz+=(Math.random()-0.5)*move.spread;
                    const len=Math.sqrt(dx*dx+dy*dy+dz*dz); dx/=len; dy/=len; dz/=len;
                }
                projectiles.push({
                    id:'proj_'+(projCounter++), ownerId:socket.id,
                    x:p.x+dx*1.5, y:p.y+1.2+dy*1.5, z:p.z+dz*1.5,
                    vx:dx*move.speed, vy:dy*move.speed, vz:dz*move.speed,
                    gravity:move.grav||0, life:move.life||200, dmg:move.dmg, shape:move.shape,
                    color:elemStats.color, size:move.size*(move.scale||1),
                    knockback:move.knockback||0, rootTime:move.rootTime||0
                });
            }, move.auto ? i*50 : 0);
        }
    });

    socket.on('adminCommand', (data) => {
        const p=players[socket.id];
        if (!p||(p.role!=='admin'&&p.role!=='owner')) return;
        const target=players[data.targetId];
        if (data.action==='nuke') {
            if (p.role==='owner') { io.emit('serverNuked',{by:p.name}); io.emit('chatMessage',{name:'SYSTEM',text:`${p.name} has nuked the server!`}); }
            return;
        }
        if (!target) return;
        if      (data.action==='jail')      { target.isJailed=!target.isJailed; if(target.isJailed){target.x=20;target.y=1;target.z=20;} }
        else if (data.action==='mute')       target.isMuted=!target.isMuted;
        else if (data.action==='kick')      { const ts=io.sockets.sockets.get(data.targetId); if(ts)ts.disconnect(); }
        else if (data.action==='freeze')     target.isFrozen=!target.isFrozen;
        else if (data.action==='tp')        { p.x=target.x; p.y=target.y+2; p.z=target.z; }
        else if (data.action==='bring')     { target.x=p.x; target.y=p.y+2; target.z=p.z; }
        else if (data.action==='heal')       target.hp=100;
        else if (data.action==='godmode')   { target.godMode=!target.godMode; if(target.godMode)target.hp=100; }
        else if (data.action==='nocooldown') target.noCooldowns=!target.noCooldowns;
        else if (data.action==='givePower') {
            if (!target.unlockedElements.includes(data.value)) target.unlockedElements.push(data.value);
            target.element=data.value; target.charges=ELEMENTS[data.value].moves.map(m=>m.maxCharges||1);
        }
        else if (data.action==='giveAll')   target.unlockedElements=['AIR','EARTH','FIRE','WATER','LIGHTNING'];
        else if (data.action==='equipLightning') {
            if (!target.unlockedElements.includes('LIGHTNING')) target.unlockedElements.push('LIGHTNING');
            target.element='LIGHTNING'; target.charges=ELEMENTS['LIGHTNING'].moves.map(m=>m.maxCharges||1);
        }
        if (p.role==='owner') {
            if      (data.action==='giveAdmin')      target.role='admin';
            else if (data.action==='removeAllPowers') {
                target.unlockedElements=[target.ogElement]; target.element=target.ogElement;
                target.charges=ELEMENTS[target.ogElement].moves.map(m=>m.maxCharges||1);
            }
            else if (data.action==='stripAdmin') {
                target.role='player'; target.godMode=false; target.noCooldowns=false;
                target.unlockedElements=[target.ogElement]; target.element=target.ogElement;
                target.charges=ELEMENTS[target.ogElement].moves.map(m=>m.maxCharges||1);
            }
        }
    });

    socket.on('disconnect', () => { delete players[socket.id]; });
});

// ─── MAIN TICK ────────────────────────────────────────────────────────────────
setInterval(() => {
    const now=Date.now();
    if (slowMo.active && now>slowMo.expires) { slowMo.active=false; slowMo.owner=null; }

    // Boss AI
    if (boss.alive) {
        boss.phase = boss.hp < boss.maxHp*0.5 ? 2 : 1;
        let closest=null, closestDist=999;
        for (const id in players) {
            const p=players[id];
            const d=dist2D(p.x,p.z,BOSS_ARENA.x,BOSS_ARENA.z);
            if (d < BOSS_ARENA.radius+40) {
                const bd=dist2D(p.x,p.z,boss.x,boss.z);
                if (bd<closestDist) { closestDist=bd; closest=p; }
            }
        }
        boss.targetId = closest ? closest.id : null;
        if (closest) {
            const dx=closest.x-boss.x, dz=closest.z-boss.z;
            const len=Math.sqrt(dx*dx+dz*dz)||1;
            const spd=boss.phase===2?4.5:3.0;
            boss.vx+=(dx/len)*spd*DELTA; boss.vz+=(dz/len)*spd*DELTA;
            boss.yaw=Math.atan2(-dx,-dz);
        }
        boss.vx*=0.85; boss.vz*=0.85;
        boss.x+=boss.vx*DELTA*3; boss.z+=boss.vz*DELTA*3;
        const bd=dist2D(boss.x,boss.z,BOSS_ARENA.x,BOSS_ARENA.z);
        if (bd > BOSS_ARENA.radius-3) {
            const ang=Math.atan2(boss.z-BOSS_ARENA.z, boss.x-BOSS_ARENA.x);
            boss.x=BOSS_ARENA.x+Math.cos(ang)*(BOSS_ARENA.radius-3);
            boss.z=BOSS_ARENA.z+Math.sin(ang)*(BOSS_ARENA.radius-3);
            boss.vx*=-0.5; boss.vz*=-0.5;
        }
        boss.y=0;
        if (now > boss.attackTimer) {
            const interval=boss.phase===2?1200:2000;
            boss.attackTimer=now+interval;
            if (closest) {
                const r=Math.random();
                if (r<0.6) { for(let b=0;b<3;b++) setTimeout(()=>{ if(closest&&players[closest.id])bossFireAt(players[closest.id]); },b*250); }
                else bossStomp();
            }
        }
    } else {
        if (!boss.respawnTimer) boss.respawnTimer=now+90000;
        if (now > boss.respawnTimer) {
            boss={ alive:true, hp:3000, maxHp:3000, x:120, y:0, z:0, vx:0, vz:0, yaw:0, phase:1, attackTimer:0, moveTimer:0, targetId:null, respawnTimer:0 };
            Object.values(SHRINES).forEach(s => s.collected=new Set());
            io.emit('chatMessage',{name:'SYSTEM',text:'⚠️ The Stone Titan has returned to the arena!'});
        }
    }

    // Players
    for (const id in players) {
        const p=players[id];
        const elemMoves=ELEMENTS[p.element].moves;
        for (let i=0;i<4;i++) {
            const max=elemMoves[i].maxCharges||1;
            if (p.charges[i]<max && now>=p.rechargeTimers[i]) {
                p.charges[i]++;
                if (p.charges[i]<max) p.rechargeTimers[i]=now+elemMoves[i].cd;
            }
        }
        if (p.isFrozen) continue;
        let timeScale=1.0;
        if (slowMo.active && id!==slowMo.owner && p.role!=='owner') timeScale=0.2;
        let moveX=0, moveZ=0;
        if (now > p.rootUntil) {
            const fx=-Math.sin(p.yaw), fz=-Math.cos(p.yaw), rx=Math.cos(p.yaw), rz=-Math.sin(p.yaw);
            if(p.inputs.forward) {moveX+=fx;moveZ+=fz;} if(p.inputs.backward){moveX-=fx;moveZ-=fz;}
            if(p.inputs.right)   {moveX+=rx;moveZ+=rz;} if(p.inputs.left)    {moveX-=rx;moveZ-=rz;}
            const len=Math.sqrt(moveX*moveX+moveZ*moveZ); if(len>0){moveX/=len;moveZ/=len;}
        }
        const spd=p.inputs.sprint?18:10;
        p.vx+=moveX*spd*DELTA*timeScale; p.vz+=moveZ*spd*DELTA*timeScale;
        p.vx-=p.vx*5*DELTA*timeScale;   p.vz-=p.vz*5*DELTA*timeScale;
        p.x +=p.vx*DELTA*3*timeScale;   p.z +=p.vz*DELTA*3*timeScale;

        // Wall collision
        for (const pr of projectiles) {
            if (!pr.isSolid||pr.shape!=='wall') continue;
            const dx=p.x-pr.x, dz=p.z-pr.z, pcy=p.y+0.9, dy=pcy-pr.y;
            if (Math.abs(dy)>WALL_HALF_H) continue;
            const {localX,localZ}=toWallLocal(dx,dz,pr.yaw);
            if (Math.abs(localX)<WALL_HALF_W && Math.abs(localZ)<WALL_HALF_D) {
                const penX=WALL_HALF_W-Math.abs(localX), penZ=WALL_HALF_D-Math.abs(localZ);
                let rX=localX, rZ=localZ;
                if(penZ<=penX){rZ=localZ>=0?WALL_HALF_D:-WALL_HALF_D;}
                else{rX=localX>=0?WALL_HALF_W:-WALL_HALF_W;}
                const {wx,wz}=fromWallLocal(rX,rZ,pr.yaw);
                p.x=pr.x+wx; p.z=pr.z+wz; p.vx=0; p.vz=0;
            }
        }

        p.vy-=15*DELTA*timeScale; p.y+=p.vy*DELTA*timeScale;
        if (p.isJailed) {
            p.x=Math.max(14.5,Math.min(25.5,p.x)); p.z=Math.max(14.5,Math.min(25.5,p.z));
            if(p.y>9.5){p.y=9.5;p.vy=0;}
        } else {
            if(p.x>13.5&&p.x<26.5&&p.z>13.5&&p.z<26.5&&p.y<10){
                const dx1=Math.abs(p.x-13.5),dx2=Math.abs(26.5-p.x),dz1=Math.abs(p.z-13.5),dz2=Math.abs(26.5-p.z);
                const mn=Math.min(dx1,dx2,dz1,dz2);
                if(mn===dx1)p.x=13.5;else if(mn===dx2)p.x=26.5;else if(mn===dz1)p.z=13.5;else p.z=26.5;
            }
        }
        if (p.y<=0){p.y=0;p.vy=0;if(p.inputs.jump&&now>p.rootUntil){p.vy=6;p.inputs.jump=false;}}
        if (p.hp<=0){p.hp=100;p.vx=0;p.vy=0;p.vz=0;p.rootUntil=0;if(p.isJailed){p.x=20;p.y=1;p.z=20;}else{p.x=0;p.y=0;p.z=0;}}
        if (p.godMode && p.hp<100) p.hp=Math.min(100,p.hp+2);

        // Shrine collection
        if (!p.shrineCollected) {
            const shrine=SHRINES[p.element];
            if (shrine && !shrine.collected.has(id)) {
                const sdx=p.x-shrine.x, sdy=p.y-shrine.y, sdz=p.z-shrine.z;
                if (Math.sqrt(sdx*sdx+sdy*sdy+sdz*sdz)<4) {
                    shrine.collected.add(id); p.shrineCollected=true;
                    p.upgradedMove=UPGRADED_MOVES[p.element]||null;
                    io.to(id).emit('shrineCollected',{element:p.element, moveName:p.upgradedMove?p.upgradedMove.name:'?'});
                    io.emit('chatMessage',{name:'SYSTEM',text:`✨ ${p.name} claimed the ${p.element} Sky Shrine upgrade!`});
                }
            }
        }
    }

    // Projectiles
    for (let i=projectiles.length-1;i>=0;i--) {
        const pr=projectiles[i];
        let pts=1.0;
        if (slowMo.active) {
            const prOwner=players[pr.ownerId];
            if (pr.ownerId!==slowMo.owner&&(!prOwner||prOwner.role!=='owner')) pts=0.05;
        }
        pr.x+=pr.vx*DELTA*pts; pr.y+=pr.vy*DELTA*pts; pr.z+=pr.vz*DELTA*pts;
        pr.vy-=pr.gravity*pts; pr.life-=pts;
        let destroyed=false;

        if (!pr.isSolid && pr.dmg>0) {
            for (let j=projectiles.length-1;j>=0;j--) {
                const wall=projectiles[j];
                if (!wall.isSolid||wall.shape!=='wall') continue;
                if (pr.ownerId===wall.ownerId) continue;
                const dx=pr.x-wall.x, dy=pr.y-wall.y, dz=pr.z-wall.z;
                if (Math.abs(dy)>WALL_HALF_H) continue;
                const {localX,localZ}=toWallLocal(dx,dz,wall.yaw);
                if (Math.abs(localX)<=WALL_HALF_W && Math.abs(localZ)<=WALL_HALF_D) {
                    wall.hp--; if(wall.hp<=0)wall.life=0; destroyed=true; break;
                }
            }
        }
        if (!destroyed && pr.isGroundSpike) {
            for (const pid in players) {
                if (pid===pr.ownerId) continue;
                const t=players[pid]; const dx=pr.x-t.x, dz=pr.z-t.z;
                if (Math.sqrt(dx*dx+dz*dz)<1.5&&t.y<2) {
                    if(!t.godMode&&pr.dmg>0){t.hp-=pr.dmg;t.rootUntil=Date.now()+pr.rootTime;if(t.hp<=0)io.to(pid).emit('death');}
                    destroyed=true; break;
                }
            }
        }
        if (!destroyed && pr.ownerId==='BOSS') {
            for (const pid in players) {
                const t=players[pid]; const dx=pr.x-t.x, dy=pr.y-(t.y+0.9), dz=pr.z-t.z;
                if (Math.sqrt(dx*dx+dy*dy+dz*dz)<(pr.size*2+1.2)) {
                    if(!t.godMode&&pr.dmg>0){
                        t.hp-=pr.dmg;
                        if(pr.knockback){t.vx+=pr.vx*pr.knockback*0.1;t.vy+=6;t.vz+=pr.vz*pr.knockback*0.1;}
                        if(pr.rootTime)t.rootUntil=Date.now()+pr.rootTime;
                        if(t.hp<=0)io.to(pid).emit('death');
                    }
                    if(pr.shape!=='spike')destroyed=true; break;
                }
            }
        }
        if (!destroyed && !pr.isSolid && !pr.isGroundSpike && pr.ownerId!=='BOSS' && boss.alive) {
            const dx=pr.x-boss.x, dy=pr.y-(boss.y+2.5), dz=pr.z-boss.z;
            if (Math.sqrt(dx*dx+dy*dy+dz*dz)<(pr.size*2+2.5)) {
                boss.hp-=pr.dmg; destroyed=true;
                if (boss.hp<=0) {
                    boss.alive=false; boss.hp=0; io.emit('bossDefeated');
                    for (const pid in players) {
                        const t=players[pid];
                        if (dist2D(t.x,t.z,BOSS_ARENA.x,BOSS_ARENA.z)<BOSS_ARENA.radius+20) {
                            if (!t.bossRewardCollected) {
                                t.bossRewardCollected=true;
                                t.bossRewardMove=BOSS_REWARD_MOVES[t.element]||BOSS_REWARD_MOVES['AIR'];
                                io.to(pid).emit('bossReward',{moveName:t.bossRewardMove.name});
                            }
                        }
                    }
                    io.emit('chatMessage',{name:'SYSTEM',text:'🏆 The Stone Titan has been slain! All arena warriors have been rewarded!'});
                }
            }
        }
        if (!destroyed && !pr.isSolid && !pr.isGroundSpike && pr.ownerId!=='BOSS') {
            for (const pid in players) {
                if (pid===pr.ownerId) continue;
                const t=players[pid]; const dx=pr.x-t.x, dy=pr.y-(t.y+0.9), dz=pr.z-t.z;
                if (Math.sqrt(dx*dx+dy*dy+dz*dz)<(pr.size*2+1.5)) {
                    if(!t.godMode&&pr.dmg>0){
                        t.hp-=pr.dmg;
                        if(pr.knockback){t.vx+=pr.vx*pr.knockback*0.1;t.vy+=8;t.vz+=pr.vz*pr.knockback*0.1;}
                        if(pr.rootTime)t.rootUntil=Date.now()+pr.rootTime;
                        if(t.hp<=0)io.to(pid).emit('death');
                    }
                    if(pr.shape!=='flat'&&pr.shape!=='cylinder'&&pr.shape!=='whirlpool')destroyed=true;
                    break;
                }
            }
        }
        if (destroyed||pr.y<=-2||pr.life<=0) projectiles.splice(i,1);
    }

    io.emit('gameState', {
        players, projectiles, slowMo,
        boss:{ alive:boss.alive, hp:boss.hp, maxHp:boss.maxHp, x:boss.x, y:boss.y, z:boss.z, yaw:boss.yaw, phase:boss.phase }
    });
}, 1000/TICK_RATE);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server listening on port ${PORT}`));
