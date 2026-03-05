const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

let projCounter = 0;
let slowMo = { active: false, owner: null, expires: 0 };
// Persistent ban list (resets on server restart unless using a DB)
const banList = new Set(); 

const ELEMENTS = {
    AIR: { name: 'AIR', color: 0xffffff, moves: [
        { dmg: 12, cd: 400, speed: 60, shape: 'sphere', size: 0.2 }, 
        { dmg: 25, cd: 3000, speed: 45, shape: 'flat', size: 0.2, scale: 3, knockback: 1.5 }, 
        { dmg: 0, cd: 4000, type: 'dash', maxCharges: 3 }, 
        { dmg: 6, cd: 8000, speed: 25, shape: 'sphere', count: 20, spread: 1.0, auto: true, size: 0.3, knockback: 1.0 } 
    ]},
    EARTH: { name: 'EARTH', color: 0x8b4513, moves: [
        { dmg: 25, cd: 800, speed: 35, grav: 0.8, shape: 'rock', size: 0.3 },
        { dmg: 15, cd: 4000, speed: 50, grav: 0, shape: 'spike', size: 0.3, rootTime: 2000 },
        { dmg: 0, cd: 5000, type: 'wall' }, 
        { dmg: 90, cd: 10000, type: 'meteor', shape: 'rock', size: 1.5, grav: 1.5 }
    ]},
    FIRE: { name: 'FIRE', color: 0xff4500, moves: [
        { dmg: 15, cd: 400, speed: 55, shape: 'icosahedron', size: 0.2 },
        { dmg: 40, cd: 3000, speed: 30, shape: 'octahedron', size: 0.5, knockback: 0.5 },
        { dmg: 5, cd: 4000, speed: 20, shape: 'tetrahedron', count: 15, spread: 1.2, auto: true, size: 0.2 },
        { dmg: 120, cd: 12000, type: 'meteor', shape: 'torusknot', size: 1.0, grav: 1.0 }
    ]},
    WATER: { name: 'WATER', color: 0x0088ff, moves: [
        { dmg: 14, cd: 350, speed: 45, grav: 0.1, shape: 'sphere', size: 0.2 },
        { dmg: 35, cd: 4000, speed: 40, shape: 'flat', size: 0.2, scale: 5, knockback: 2.5 },
        { dmg: 25, cd: 3000, speed: 60, shape: 'cylinder', size: 0.4 }, 
        { dmg: 15, cd: 8000, speed: 15, shape: 'cone', size: 0.8, knockback: 2.0, count: 8, spread: 0.8 } 
    ]},
    LIGHTNING: { name: 'LIGHTNING', color: 0x00ffff, moves: [
        { dmg: 35, cd: 1500, speed: 120, shape: 'lightning', size: 0.2 },
        { dmg: 0, cd: 15000, type: 'flash' },
        { dmg: 0, cd: 1000, type: 'dash', maxCharges: 2 },
        { dmg: 15, cd: 6000, speed: 80, shape: 'sphere', count: 15, spread: 1.5, auto: true, size: 0.2 }
    ]}
};

const players = {}; 
const projectiles = [];
const TICK_RATE = 30; 
const DELTA = 1 / TICK_RATE;

function getDir(yaw, pitch) {
    return { x: -Math.sin(yaw) * Math.cos(pitch), y: Math.sin(pitch), z: -Math.cos(yaw) * Math.cos(pitch) };
}

io.on('connection', (socket) => {
    const clientIp = socket.handshake.address;

    if (banList.has(clientIp)) {
        socket.emit('serverNuked', { reason: "Banned" });
        socket.disconnect();
        return;
    }

    socket.on('joinGame', (data) => {
        const defaultCharges = ELEMENTS[data.element].moves.map(m => m.maxCharges || 1);
        players[socket.id] = {
            id: socket.id, 
            ip: clientIp,
            name: data.name, 
            role: "player", 
            ogElement: data.element, 
            element: data.element, 
            unlockedElements: [data.element],
            hp: 100, x: 0, y: 5, z: 0, vx: 0, vy: 0, vz: 0, yaw: 0, pitch: 0,
            isFrozen: false, isJailed: false, isMuted: false, godMode: false, noCooldowns: false, 
            rootUntil: 0, isDead: false,
            charges: [...defaultCharges], rechargeTimers: [0,0,0,0],
            inputs: { forward:false, backward:false, left:false, right:false, jump:false, sprint:false }
        };
        socket.emit('joinSuccess', { id: socket.id });
    });

    socket.on('setRole', (role) => { 
        if(players[socket.id] && (role === "admin" || role === "owner")) { 
            players[socket.id].role = role; 
        }
    });

    socket.on('chatMessage', (msg) => {
        const p = players[socket.id];
        if (!p || p.isMuted || p.isDead) return;
        io.emit('chatMessage', { name: p.name, text: msg.substring(0, 100) });
    });

    socket.on('input', (data) => {
        const p = players[socket.id];
        if(!p || p.isFrozen || p.isDead) return;
        p.inputs = data; p.yaw = data.yaw; p.pitch = data.pitch;
    });

    socket.on('switchElement', (elName) => {
        const p = players[socket.id];
        if (!p || p.isFrozen || p.isDead || !p.unlockedElements.includes(elName)) return;
        p.element = elName;
        p.charges = ELEMENTS[elName].moves.map(m => m.maxCharges || 1);
        p.rechargeTimers = [0,0,0,0];
    });

    socket.on('useMove', (index) => {
        const p = players[socket.id];
        if(!p || p.isFrozen || p.isDead) return;
        const elemStats = ELEMENTS[p.element];
        if(!elemStats || !elemStats.moves[index]) return;
        const move = elemStats.moves[index];
        const now = Date.now();

        if(!p.noCooldowns && p.charges[index] <= 0) return; 

        if(!p.noCooldowns) {
            p.charges[index]--;
            if (p.charges[index] === (move.maxCharges || 1) - 1) { p.rechargeTimers[index] = now + move.cd; }
        }

        const dir = getDir(p.yaw, p.pitch);
        
        if (move.type === 'flash') {
            slowMo.active = true; slowMo.owner = socket.id; slowMo.expires = now + 8000;
            io.emit('chatMessage', { name: "SYSTEM", text: `${p.name} used Flash! Time is slowing down...` });
            return;
        }

        if(move.type === 'dash') {
            if(dir.y > 0.4) { p.vy = 25; p.vx += dir.x * 10; p.vz += dir.z * 10; }
            else { p.vx += dir.x * 40; p.vz += dir.z * 40; p.vy = 5; }
            return;
        }

        if (move.type === 'meteor') {
            projectiles.push({
                id: "proj_" + (projCounter++), ownerId: socket.id,
                x: p.x + (dir.x * 15), y: p.y + 25, z: p.z + (dir.z * 15),
                vx: 0, vy: -30, vz: 0, gravity: move.grav || 1.0,
                life: 300, dmg: move.dmg, shape: move.shape, color: elemStats.color, size: move.size || 1, knockback: 1.5
            });
            return;
        }

        if (move.type === 'wall') {
            const dist = 6; 
            projectiles.push({
                id: "proj_" + (projCounter++), ownerId: socket.id,
                x: p.x + (dir.x * dist), 
                y: p.y + 2,
                z: p.z + (dir.z * dist),
                vx: 0, vy: 0, vz: 0, gravity: 0,
                yaw: p.yaw, 
                life: 400, dmg: 0, shape: 'wall', color: elemStats.color, size: 1.0, isSolid: true, hp: 10
            });
            return;
        }

        const count = move.count || 1;
        for(let i = 0; i < count; i++) {
            setTimeout(() => {
                let dx = dir.x, dy = dir.y, dz = dir.z;
                if(move.spread > 0) {
                    dx += (Math.random() - 0.5) * move.spread; dy += (Math.random() - 0.5) * move.spread; dz += (Math.random() - 0.5) * move.spread;
                    const len = Math.sqrt(dx*dx + dy*dy + dz*dz);
                    dx /= len; dy /= len; dz /= len;
                }
                projectiles.push({
                    id: "proj_" + (projCounter++), ownerId: socket.id,
                    x: p.x + (dx * 1.5), y: p.y + 1.2 + (dy * 1.5), z: p.z + (dz * 1.5),
                    vx: dx * move.speed, vy: dy * move.speed, vz: dz * move.speed, gravity: move.grav || 0,
                    life: move.life || 200, dmg: move.dmg, shape: move.shape, color: elemStats.color, size: move.size * (move.scale || 1),
                    knockback: move.knockback || 0, rootTime: move.rootTime || 0
                });
            }, move.auto ? i * 50 : 0);
        }
    });

    socket.on('adminCommand', (data) => {
        const p = players[socket.id];
        if (!p || (p.role !== "admin" && p.role !== "owner")) return;
        
        // --- NUKE (Owner Only) ---
        if (data.action === 'nuke' && p.role === "owner") { 
            io.emit('serverNuked', { by: p.name });
            return; 
        }

        const target = players[data.targetId];
        if (!target) return;

        // Protection: Admins cannot target the Owner
        if (p.role === "admin" && target.role === "owner") return;

        if (data.action === 'ban' && p.role === "owner") {
            banList.add(target.ip);
            const tSocket = io.sockets.sockets.get(data.targetId);
            if(tSocket) {
                tSocket.emit('serverNuked', { reason: "Banned" });
                tSocket.disconnect();
            }
            return;
        }

        if (data.action === 'jail') { target.isJailed = !target.isJailed; if (target.isJailed) { target.x = 20; target.y = 1; target.z = 20; } }
        else if (data.action === 'mute') { target.isMuted = !target.isMuted; }
        else if (data.action === 'kick') { const tSocket = io.sockets.sockets.get(data.targetId); if(tSocket) tSocket.disconnect(); }
        else if (data.action === 'freeze') { target.isFrozen = !target.isFrozen; }
        else if (data.action === 'tp') { p.x = target.x; p.y = target.y + 2; p.z = target.z; }
        else if (data.action === 'bring') { target.x = p.x; target.y = p.y + 2; target.z = p.z; }
        else if (data.action === 'heal') { target.hp = 100; }
        else if (data.action === 'godmode') { target.godMode = !target.godMode; if(target.godMode) target.hp = 100; }
        else if (data.action === 'nocooldown') { target.noCooldowns = !target.noCooldowns; }
        else if (data.action === 'givePower') { 
            if (!target.unlockedElements.includes(data.value)) target.unlockedElements.push(data.value); 
            target.element = data.value; target.charges = ELEMENTS[data.value].moves.map(m => m.maxCharges || 1); 
        }
        else if (data.action === 'giveAll') {
            target.unlockedElements = ['AIR', 'EARTH', 'FIRE', 'WATER', 'LIGHTNING'];
        }

        if (p.role === "owner") {
            if (data.action === 'giveAdmin') { target.role = "admin"; }
            else if (data.action === 'stripAdmin') {
                target.role = "player";
                target.godMode = false;
                target.noCooldowns = false;
                target.unlockedElements = [target.ogElement];
                target.element = target.ogElement;
            }
        }
    });

    socket.on('disconnect', () => { delete players[socket.id]; });
});

setInterval(() => {
    const now = Date.now();
    if (slowMo.active && now > slowMo.expires) { slowMo.active = false; slowMo.owner = null; }

    for (const id in players) {
        const p = players[id];
        if (p.isDead) continue;

        const elemMoves = ELEMENTS[p.element].moves;
        for(let i=0; i<4; i++) {
            const max = elemMoves[i].maxCharges || 1;
            if (p.charges[i] < max && now >= p.rechargeTimers[i]) {
                p.charges[i]++;
                if (p.charges[i] < max) p.rechargeTimers[i] = now + elemMoves[i].cd;
            }
        }

        if (p.isFrozen) continue;

        let timeScale = 1.0;
        if (slowMo.active && id !== slowMo.owner && p.role !== 'owner') {
            timeScale = 0.2; 
        }

        let moveX = 0, moveZ = 0;
        if (now > p.rootUntil) {
            const fwdX = -Math.sin(p.yaw), fwdZ = -Math.cos(p.yaw);
            const rightX = Math.cos(p.yaw), rightZ = -Math.sin(p.yaw);
            if(p.inputs.forward) { moveX += fwdX; moveZ += fwdZ; }
            if(p.inputs.backward) { moveX -= fwdX; moveZ -= fwdZ; }
            if(p.inputs.right) { moveX += rightX; moveZ += rightZ; }
            if(p.inputs.left) { moveX -= rightX; moveZ -= rightZ; }
            const len = Math.sqrt(moveX*moveX + moveZ*moveZ);
            if(len > 0) { moveX /= len; moveZ /= len; }
        }

        const speed = p.inputs.sprint ? 18.0 : 10.0;
        p.vx += moveX * speed * DELTA * timeScale;
        p.vz += moveZ * speed * DELTA * timeScale;
        p.vx -= p.vx * 5.0 * DELTA * timeScale;
        p.vz -= p.vz * 5.0 * DELTA * timeScale;
        p.x += p.vx * DELTA * 3 * timeScale;
        p.z += p.vz * DELTA * 3 * timeScale;

        p.vy -= 15.0 * DELTA * timeScale;
        p.y += p.vy * DELTA * timeScale;

        if (p.y <= 0) { p.y = 0; p.vy = 0; if (p.inputs.jump && now > p.rootUntil) { p.vy = 6.0; p.inputs.jump = false; } }
        
        // Improved Respawn Logic
        if(p.hp <= 0 && !p.isDead) { 
            p.isDead = true;
            io.to(p.id).emit('death'); 
            setTimeout(() => {
                p.hp = 100; p.vx = 0; p.vy = 0; p.vz = 0; p.rootUntil = 0; p.isDead = false;
                if (p.isJailed) { p.x = 20; p.y = 1; p.z = 20; } 
                else { p.x = 0; p.y = 5; p.z = 0; }
            }, 5000); // 5 second respawn
        }
    }

    // Projectile logic (same as your original)
    for (let i = projectiles.length - 1; i >= 0; i--) {
        const pr = projectiles[i];
        let pTimeScale = 1.0;
        if (slowMo.active) {
            const prOwner = players[pr.ownerId];
            if (pr.ownerId !== slowMo.owner && (!prOwner || prOwner.role !== 'owner')) {
                pTimeScale = 0.05;
            }
        }
        pr.x += pr.vx * DELTA * pTimeScale; pr.y += pr.vy * DELTA * pTimeScale; pr.z += pr.vz * DELTA * pTimeScale;
        pr.vy -= pr.gravity * pTimeScale; pr.life -= 1 * pTimeScale;
        
        let destroyed = false;
        for (const pid in players) {
            if (pid === pr.ownerId) continue;
            const target = players[pid];
            if (target.isDead) continue;
            const dx = pr.x - target.x; const dy = pr.y - (target.y + 0.8); const dz = pr.z - target.z;
            if (Math.sqrt(dx*dx + dy*dy + dz*dz) < (pr.size * 2 + 1.5)) {
                if(!target.godMode && pr.dmg > 0) {
                    target.hp -= pr.dmg;
                    if (pr.knockback) { target.vx += (pr.vx * pr.knockback * 0.1); target.vy += 8; target.vz += (pr.vz * pr.knockback * 0.1); }
                    if (pr.rootTime) { target.rootUntil = Date.now() + pr.rootTime; }
                }
                destroyed = true;
            }
        }
        if (destroyed || pr.y <= -2 || pr.life <= 0) { projectiles.splice(i, 1); }
    }
    io.emit('gameState', { players, projectiles, slowMo });
}, 1000 / TICK_RATE);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => { console.log(`Server Auth Engine listening on port ${PORT}`); });
