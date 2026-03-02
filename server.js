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

// --- ELEMENT & MOVE DATA ---
const ELEMENTS = {
    AIR: { name: 'AIR', color: 0xffffff, moves: [
        { dmg: 12, cd: 400, speed: 60, shape: 'sharp', size: 0.2 }, // Wind Blade
        { dmg: 20, cd: 3000, speed: 30, shape: 'sphere', size: 0.8, knockback: 2.0 }, // Tornado (Pushes)
        { dmg: 0, cd: 4000, type: 'dash', maxCharges: 3 }, // Air Dash (3 Charges)
        { dmg: 25, cd: 8000, speed: 20, shape: 'cone', size: 0.4, knockback: 3.0, count: 5, spread: 0.5 } // Hurricane
    ]},
    EARTH: { name: 'EARTH', color: 0x8b4513, moves: [
        { dmg: 25, cd: 800, speed: 35, grav: 0.8, shape: 'pebble', size: 0.2 }, // Rock Throw
        { dmg: 15, cd: 4000, speed: 50, grav: 0, shape: 'spike', size: 0.3, rootTime: 2000 }, // Stone Grasp (Roots 2s)
        { dmg: 0, cd: 5000, type: 'wall' }, // Earth Wall
        { dmg: 90, cd: 10000, type: 'meteor', shape: 'rock', size: 1.5, grav: 1.5 } // Meteor
    ]},
    FIRE: { name: 'FIRE', color: 0xff4500, moves: [
        { dmg: 15, cd: 400, speed: 55, shape: 'spike', size: 0.2 }, // Fireball
        { dmg: 40, cd: 3000, speed: 30, shape: 'sphere', size: 0.5, knockback: 0.5 }, // Fire Blast
        { dmg: 5, cd: 4000, speed: 20, shape: 'spike', count: 15, spread: 1.2, auto: true, size: 0.2 }, // Flamethrower
        { dmg: 120, cd: 12000, type: 'meteor', shape: 'sphere', size: 1.0, grav: 1.0 } // Fire Storm
    ]},
    WATER: { name: 'WATER', color: 0x0088ff, moves: [
        { dmg: 14, cd: 350, speed: 45, grav: 0.1, shape: 'sphere', size: 0.2 }, // Water Bullet
        { dmg: 35, cd: 4000, speed: 40, shape: 'flat', size: 0.2, scale: 5, knockback: 2.5 }, // Tsunami (Wide Push)
        { dmg: 25, cd: 3000, speed: 80, shape: 'long', size: 0.2 }, // Water Whip
        { dmg: 5, cd: 5000, speed: 15, grav: -0.05, shape: 'sphere', count: 12, spread: 1.0, knockback: 0.5, size: 0.3 } // Whirlpool
    ]},
    LIGHTNING: { name: 'LIGHTNING', color: 0x00ffff, moves: [
        { dmg: 35, cd: 1500, speed: 120, shape: 'lightning', size: 0.2 }, // Lightning Strike
        { dmg: 0, cd: 15000, type: 'flash' }, // Flash Slow-Mo
        { dmg: 0, cd: 1000, type: 'dash', maxCharges: 2 }, // Spark Dash
        { dmg: 15, cd: 6000, speed: 80, shape: 'spike', count: 15, spread: 1.5, auto: true, size: 0.2 } // Thunderstorm
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
    socket.on('joinGame', (data) => {
        const defaultCharges = ELEMENTS[data.element].moves.map(m => m.maxCharges || 1);
        players[socket.id] = {
            id: socket.id, name: data.name, role: "player", element: data.element, unlockedElements: [data.element],
            hp: 100, x: 0, y: 5, z: 0, vx: 0, vy: 0, vz: 0, yaw: 0, pitch: 0,
            isFrozen: false, isJailed: false, godMode: false, noCooldowns: false, rootUntil: 0,
            charges: [...defaultCharges], rechargeTimers: [0,0,0,0],
            inputs: { forward:false, backward:false, left:false, right:false, jump:false, sprint:false }
        };
        socket.emit('joinSuccess', { id: socket.id });
    });

    socket.on('setRole', (role) => { if(players[socket.id] && (role === "admin" || role === "owner")) players[socket.id].role = role; });

    socket.on('input', (data) => {
        const p = players[socket.id];
        if(!p || p.isFrozen) return;
        p.inputs = data; p.yaw = data.yaw; p.pitch = data.pitch;
    });

    socket.on('switchElement', (elName) => {
        const p = players[socket.id];
        if (!p || p.isFrozen || !p.unlockedElements.includes(elName)) return;
        p.element = elName;
        // Reset charges for new element
        p.charges = ELEMENTS[elName].moves.map(m => m.maxCharges || 1);
        p.rechargeTimers = [0,0,0,0];
    });

    socket.on('useMove', (index) => {
        const p = players[socket.id];
        if(!p || p.isFrozen) return;
        const elemStats = ELEMENTS[p.element];
        if(!elemStats || !elemStats.moves[index]) return;
        const move = elemStats.moves[index];
        const now = Date.now();

        if(!p.noCooldowns && p.charges[index] <= 0) return; 

        if(!p.noCooldowns) {
            p.charges[index]--;
            if (p.charges[index] === (move.maxCharges || 1) - 1) {
                p.rechargeTimers[index] = now + move.cd; // Start recharge
            }
        }

        const dir = getDir(p.yaw, p.pitch);
        
        if (move.type === 'flash') {
            slowMo.active = true; slowMo.owner = socket.id; slowMo.expires = now + 5000; return;
        }

        if(move.type === 'dash') {
            if(dir.y > 0.4) { p.vy = 25; p.vx += dir.x * 10; p.vz += dir.z * 10; }
            else { p.vx += dir.x * 40; p.vz += dir.z * 40; p.vy = 5; }
            return;
        }

        if (move.type === 'meteor') {
            const dropX = p.x + (dir.x * 15);
            const dropZ = p.z + (dir.z * 15);
            projectiles.push({
                id: "proj_" + (projCounter++), ownerId: socket.id,
                x: dropX, y: p.y + 25, z: dropZ,
                vx: 0, vy: -30, vz: 0, gravity: move.grav || 1.0,
                life: 300, dmg: move.dmg, shape: move.shape, color: elemStats.color, size: move.size || 1, knockback: 1.5
            });
            return;
        }

        if (move.type === 'wall') {
            const dist = 3;
            for(let i = -1; i <= 1; i++) {
                projectiles.push({
                    id: "proj_" + (projCounter++), ownerId: socket.id,
                    x: p.x + (dir.x * dist) + (Math.cos(p.yaw) * i * 2), 
                    y: p.y + 1, 
                    z: p.z + (dir.z * dist) + (-Math.sin(p.yaw) * i * 2),
                    vx: 0, vy: 0, vz: 0, gravity: 0,
                    life: 600, dmg: 0, shape: 'flat', color: elemStats.color, size: 0.5, scale: 3
                });
            }
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
        const target = players[data.targetId];
        
        if (data.action === 'nuke') { for(let id in players) { if(!players[id].godMode) { players[id].hp = 0; io.to(id).emit('death'); } } }
        else if (data.action === 'jail' && target) { target.isJailed = !target.isJailed; if (target.isJailed) { target.x = 20; target.y = 1; target.z = 20; } }
        else if (data.action === 'freeze' && target) { target.isFrozen = !target.isFrozen; }
        else if (data.action === 'tp' && target) { p.x = target.x; p.y = target.y + 2; p.z = target.z; }
        else if (data.action === 'bring' && target) { target.x = p.x; target.y = p.y + 2; target.z = p.z; }
        else if (data.action === 'givePower' && target) { if (!target.unlockedElements.includes(data.value)) target.unlockedElements.push(data.value); target.element = data.value; p.charges = ELEMENTS[data.value].moves.map(m => m.maxCharges || 1); }
        else if (data.action === 'giveAllPowers' && target) { target.unlockedElements = ['AIR', 'EARTH', 'FIRE', 'WATER']; }
        else if (data.action === 'godmode') { p.godMode = !p.godMode; if(p.godMode) p.hp = 100; }
        else if (data.action === 'nocooldown') { p.noCooldowns = !p.noCooldowns; }
    });

    socket.on('disconnect', () => { delete players[socket.id]; });
});

setInterval(() => {
    const now = Date.now();
    if (slowMo.active && now > slowMo.expires) { slowMo.active = false; slowMo.owner = null; }

    for (const id in players) {
        const p = players[id];
        
        // Recharge Logic
        const elemMoves = ELEMENTS[p.element].moves;
        for(let i=0; i<4; i++) {
            const max = elemMoves[i].maxCharges || 1;
            if (p.charges[i] < max && now >= p.rechargeTimers[i]) {
                p.charges[i]++;
                if (p.charges[i] < max) p.rechargeTimers[i] = now + elemMoves[i].cd;
            }
        }

        if (p.isFrozen) continue;

        let timeScale = (slowMo.active && id !== slowMo.owner) ? 0.2 : 1.0;
        let moveX = 0, moveZ = 0;
        
        // Root Logic - Can't use WASD if rooted
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

        if (p.isJailed) {
            p.x = Math.max(14.5, Math.min(25.5, p.x)); p.z = Math.max(14.5, Math.min(25.5, p.z));
            if (p.y > 9.5) { p.y = 9.5; p.vy = 0; } 
        } else {
            if (p.x > 13.5 && p.x < 26.5 && p.z > 13.5 && p.z < 26.5 && p.y < 10) {
                const dx1 = Math.abs(p.x - 13.5), dx2 = Math.abs(26.5 - p.x), dz1 = Math.abs(p.z - 13.5), dz2 = Math.abs(26.5 - p.z);
                const min = Math.min(dx1, dx2, dz1, dz2);
                if (min === dx1) p.x = 13.5; else if (min === dx2) p.x = 26.5; else if (min === dz1) p.z = 13.5; else p.z = 26.5;
            }
        }

        if (p.y <= 0) { p.y = 0; p.vy = 0; if (p.inputs.jump && now > p.rootUntil) { p.vy = 6.0; p.inputs.jump = false; } }
        if(p.hp <= 0) { p.hp = 100; p.x = 0; p.y = 5; p.z = 0; p.vx = 0; p.vy = 0; p.vz = 0; p.isJailed = false; p.rootUntil = 0; }
    }

    for (let i = projectiles.length - 1; i >= 0; i--) {
        const pr = projectiles[i];
        let pTimeScale = (slowMo.active && pr.ownerId !== slowMo.owner) ? 0.2 : 1.0;

        pr.x += pr.vx * DELTA * pTimeScale; pr.y += pr.vy * DELTA * pTimeScale; pr.z += pr.vz * DELTA * pTimeScale;
        pr.vy -= pr.gravity * pTimeScale; pr.life -= 1 * pTimeScale;

        let hitSomeone = false;
        for (const pid in players) {
            if (pid === pr.ownerId) continue;
            const target = players[pid];
            const dx = pr.x - target.x; const dy = pr.y - (target.y + 0.8); const dz = pr.z - target.z;
            const dist = Math.sqrt(dx*dx + dy*dy + dz*dz);
            
            // Increased hitbox slightly for wide moves like Tsunami
            if (dist < (pr.size * 2 + 1.5)) {
                if(!target.godMode && pr.dmg > 0) {
                    target.hp -= pr.dmg;
                    // Apply Knockback and Roots
                    if (pr.knockback) { target.vx += (pr.vx * pr.knockback * 0.1); target.vy += 8; target.vz += (pr.vz * pr.knockback * 0.1); }
                    if (pr.rootTime) { target.rootUntil = Date.now() + pr.rootTime; }
                    
                    if(target.hp <= 0) io.to(pid).emit('death'); 
                }
                if (pr.shape !== 'flat' && pr.shape !== 'wall') hitSomeone = true; // Flat/Wall moves pass through to hit multiple people
            }
        }
        if (hitSomeone || pr.y <= -2 || pr.life <= 0) { projectiles.splice(i, 1); }
    }
    io.emit('gameState', { players, projectiles, slowMo });
}, 1000 / TICK_RATE);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => { console.log(`Server Auth Engine listening on port ${PORT}`); });
