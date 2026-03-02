const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

// --- GAME CONFIG & DATA ---
let projCounter = 0;

// Slow-Mo Global State
let slowMo = { active: false, owner: null, expires: 0 };

const ELEMENTS = {
    AIR: { name: 'AIR', color: 0xffffff, moves: [{ dmg: 12, cd: 300, speed: 60, grav: 0.0, life: 300, shape: 'sharp', size: 0.2 }, { dmg: 35, cd: 2000, speed: 45, grav: 0.0, life: 300, shape: 'flat', size: 0.2 }, { dmg: 0, cd: 500, type: 'dash' }, { dmg: 20, cd: 6000, speed: 20, grav: 0.0, life: 400, shape: 'cone', count: 1, spread: 0, size: 0.2 }] },
    EARTH: { name: 'EARTH', color: 0x8b4513, moves: [{ dmg: 25, cd: 800, speed: 35, grav: 0.8, life: 60, shape: 'pebble', size: 0.2 }, { dmg: 80, cd: 5000, speed: 25, grav: 1.2, life: 100, shape: 'rock', size: 0.2 }, { dmg: 0, cd: 4000, type: 'wall' }, { dmg: 12, cd: 7000, speed: 40, grav: 0.5, life: 50, shape: 'pebble', count: 10, spread: 0.8, size: 0.2 }] },
    FIRE: { name: 'FIRE', color: 0xff4500, moves: [{ dmg: 15, cd: 400, speed: 55, grav: 0.02, life: 250, shape: 'spike', size: 0.2 }, { dmg: 50, cd: 3500, speed: 30, grav: 0.1, life: 200, shape: 'sphere', size: 0.2 }, { dmg: 5, cd: 4000, speed: 18, grav: -0.08, life: 150, shape: 'spike', count: 20, spread: 1.2, auto: true, size: 0.2 }, { dmg: 120, cd: 12000, type: 'meteor', size: 0.2 }] },
    WATER: { name: 'WATER', color: 0x0088ff, moves: [{ dmg: 14, cd: 350, speed: 45, grav: 0.1, life: 150, shape: 'sphere', size: 0.2 }, { dmg: 45, cd: 2500, speed: 80, grav: 0.05, life: 200, shape: 'long', size: 0.2 }, { dmg: 20, cd: 4000, speed: 20, grav: 0.0, life: 100, shape: 'flat', scale: 3, size: 0.2 }, { dmg: 6, cd: 5000, speed: 15, grav: -0.05, life: 300, shape: 'sphere', count: 12, spread: 1.0, size: 0.2 }] },
    LIGHTNING: { name: 'LIGHTNING', color: 0x00ffff, moves: [
        { dmg: 35, cd: 1500, speed: 120, grav: 0.0, life: 150, shape: 'lightning', size: 0.2 }, 
        { dmg: 0, cd: 15000, type: 'flash' }, // Flash Slow-Mo
        { dmg: 0, cd: 1000, type: 'dash' }, 
        { dmg: 15, cd: 5000, speed: 80, grav: 0.0, life: 200, shape: 'spike', count: 15, spread: 1.5, auto: true, size: 0.2 }
    ] }
};

const players = {}; 
const projectiles = [];
const TICK_RATE = 30; 
const DELTA = 1 / TICK_RATE;

function getDir(yaw, pitch) {
    const x = -Math.sin(yaw) * Math.cos(pitch);
    const y = Math.sin(pitch);
    const z = -Math.cos(yaw) * Math.cos(pitch);
    return { x, y, z };
}

io.on('connection', (socket) => {
    socket.on('joinGame', (data) => {
        players[socket.id] = {
            id: socket.id, name: data.name, role: "player", 
            element: data.element, 
            unlockedElements: [data.element],
            hp: 100, x: 0, y: 5, z: 0, vx: 0, vy: 0, vz: 0,
            yaw: 0, pitch: 0, isFrozen: false, isJailed: false, godMode: false, noCooldowns: false,
            cooldowns: [0,0,0,0], inputs: { forward:false, backward:false, left:false, right:false, jump:false, sprint:false }
        };
        socket.emit('joinSuccess', { id: socket.id });
    });

    socket.on('setRole', (role) => { if(players[socket.id] && (role === "admin" || role === "owner")) players[socket.id].role = role; });

    socket.on('input', (data) => {
        const p = players[socket.id];
        if(!p || p.isFrozen) return;
        p.inputs = data;
        p.yaw = data.yaw;
        p.pitch = data.pitch;
    });

    socket.on('switchElement', (elName) => {
        const p = players[socket.id];
        if (!p || p.isFrozen) return;
        if (p.unlockedElements.includes(elName)) p.element = elName;
    });

    socket.on('useMove', (index) => {
        const p = players[socket.id];
        if(!p || p.isFrozen) return;
        
        const elemStats = ELEMENTS[p.element];
        if(!elemStats || !elemStats.moves[index]) return;
        const move = elemStats.moves[index];

        const now = Date.now();
        if(!p.noCooldowns && now < p.cooldowns[index]) return; 
        if(move.cd) p.cooldowns[index] = now + move.cd;

        const dir = getDir(p.yaw, p.pitch);
        
        if (move.type === 'flash') {
            slowMo.active = true;
            slowMo.owner = socket.id;
            slowMo.expires = now + 5000; // Lasts 5 seconds
            return;
        }

        if(move.type === 'dash') {
            if(dir.y > 0.4) { p.vy = 25; p.vx += dir.x * 10; p.vz += dir.z * 10; }
            else { p.vx += dir.x * 40; p.vz += dir.z * 40; p.vy = 5; }
            return;
        }

        const count = move.count || 1;
        for(let i = 0; i < count; i++) {
            setTimeout(() => {
                let dx = dir.x, dy = dir.y, dz = dir.z;
                if(move.spread > 0) {
                    dx += (Math.random() - 0.5) * move.spread;
                    dy += (Math.random() - 0.5) * move.spread;
                    dz += (Math.random() - 0.5) * move.spread;
                    const len = Math.sqrt(dx*dx + dy*dy + dz*dz);
                    dx /= len; dy /= len; dz /= len;
                }

                projectiles.push({
                    id: "proj_" + (projCounter++),
                    ownerId: socket.id,
                    x: p.x + (dx * 1.5), 
                    y: p.y + 1.2 + (dy * 1.5), 
                    z: p.z + (dz * 1.5),
                    vx: dx * move.speed, vy: dy * move.speed, vz: dz * move.speed,
                    gravity: move.grav || 0,
                    life: move.life || 200,
                    dmg: move.dmg,
                    shape: move.shape,
                    color: elemStats.color,
                    size: move.size * (move.scale || 1)
                });
            }, move.auto ? i * 50 : 0);
        }
    });

    socket.on('adminCommand', (data) => {
        const p = players[socket.id];
        if (!p || (p.role !== "admin" && p.role !== "owner")) return;
        const target = players[data.targetId];
        if (p.role === "admin" && target && target.role === "owner") return;

        if (data.action === 'nuke') {
            for(let id in players) { if(!players[id].godMode) { players[id].hp = 0; io.to(id).emit('death'); } }
        } else if (data.action === 'kick' || data.action === 'ban') {
            if (target) { io.to(data.targetId).emit('kicked'); }
        } else if (data.action === 'jail') {
            if (target) { 
                target.isJailed = !target.isJailed; 
                if (target.isJailed) {
                    target.x = 20; target.y = 1; target.z = 20; target.vx = 0; target.vy = 0; target.vz = 0;
                }
            }
        } else if (data.action === 'freeze') {
            if (target) { target.isFrozen = !target.isFrozen; target.vx = 0; target.vz = 0; }
        } else if (data.action === 'tp' && target) {
            p.x = target.x; p.y = target.y + 2; p.z = target.z;
        } else if (data.action === 'bring' && target) {
            target.x = p.x; target.y = p.y + 2; target.z = p.z;
        } else if (data.action === 'givePower' && target) {
            if (!target.unlockedElements.includes(data.value)) target.unlockedElements.push(data.value);
            target.element = data.value;
        } else if (data.action === 'giveAllPowers' && target) {
            target.unlockedElements = ['AIR', 'EARTH', 'FIRE', 'WATER'];
        } else if (data.action === 'equipLightning') {
            p.element = "LIGHTNING";
        } else if (data.action === 'godmode') {
            p.godMode = !p.godMode;
            if(p.godMode) p.hp = 100;
        } else if (data.action === 'nocooldown') {
            p.noCooldowns = !p.noCooldowns;
        }
    });

    socket.on('disconnect', () => { delete players[socket.id]; });
});

setInterval(() => {
    if (slowMo.active && Date.now() > slowMo.expires) {
        slowMo.active = false;
        slowMo.owner = null;
    }

    for (const id in players) {
        const p = players[id];
        if (p.isFrozen) continue;

        // Apply Time Scale (0.2 if someone else used Flash!)
        let timeScale = (slowMo.active && id !== slowMo.owner) ? 0.2 : 1.0;

        let moveX = 0, moveZ = 0;
        const fwdX = -Math.sin(p.yaw), fwdZ = -Math.cos(p.yaw);
        const rightX = Math.cos(p.yaw), rightZ = -Math.sin(p.yaw);

        if(p.inputs.forward) { moveX += fwdX; moveZ += fwdZ; }
        if(p.inputs.backward) { moveX -= fwdX; moveZ -= fwdZ; }
        if(p.inputs.right) { moveX += rightX; moveZ += rightZ; }
        if(p.inputs.left) { moveX -= rightX; moveZ -= rightZ; }

        const len = Math.sqrt(moveX*moveX + moveZ*moveZ);
        if(len > 0) { moveX /= len; moveZ /= len; }

        const speed = p.inputs.sprint ? 18.0 : 10.0;
        p.vx += moveX * speed * DELTA * timeScale;
        p.vz += moveZ * speed * DELTA * timeScale;

        p.vx -= p.vx * 5.0 * DELTA * timeScale;
        p.vz -= p.vz * 5.0 * DELTA * timeScale;

        p.x += p.vx * DELTA * 3 * timeScale;
        p.z += p.vz * DELTA * 3 * timeScale;

        p.vy -= 15.0 * DELTA * timeScale;
        p.y += p.vy * DELTA * timeScale;

        // Jail Collision Logic (Jail is at X:20, Z:20, size 12x12)
        if (p.isJailed) {
            // Keep them inside
            p.x = Math.max(14.5, Math.min(25.5, p.x));
            p.z = Math.max(14.5, Math.min(25.5, p.z));
            if (p.y > 9.5) { p.y = 9.5; p.vy = 0; } // Roof
        } else {
            // Keep them outside
            if (p.x > 13.5 && p.x < 26.5 && p.z > 13.5 && p.z < 26.5 && p.y < 10) {
                const dx1 = Math.abs(p.x - 13.5), dx2 = Math.abs(26.5 - p.x);
                const dz1 = Math.abs(p.z - 13.5), dz2 = Math.abs(26.5 - p.z);
                const min = Math.min(dx1, dx2, dz1, dz2);
                if (min === dx1) p.x = 13.5;
                else if (min === dx2) p.x = 26.5;
                else if (min === dz1) p.z = 13.5;
                else p.z = 26.5;
            }
        }

        if (p.y <= 0) {
            p.y = 0;
            p.vy = 0;
            if (p.inputs.jump) { p.vy = 6.0; p.inputs.jump = false; }
        }
        
        if(p.hp <= 0) { p.hp = 100; p.x = 0; p.y = 5; p.z = 0; p.vx = 0; p.vy = 0; p.vz = 0; p.isJailed = false; }
    }

    for (let i = projectiles.length - 1; i >= 0; i--) {
        const pr = projectiles[i];
        let pTimeScale = (slowMo.active && pr.ownerId !== slowMo.owner) ? 0.2 : 1.0;

        pr.x += pr.vx * DELTA * pTimeScale;
        pr.y += pr.vy * DELTA * pTimeScale;
        pr.z += pr.vz * DELTA * pTimeScale;
        pr.vy -= pr.gravity * pTimeScale;
        pr.life -= 1 * pTimeScale;

        let hitSomeone = false;
        for (const pid in players) {
            if (pid === pr.ownerId) continue;
            const target = players[pid];
            const dx = pr.x - target.x;
            const dy = pr.y - (target.y + 0.8);
            const dz = pr.z - target.z;
            const dist = Math.sqrt(dx*dx + dy*dy + dz*dz);
            
            if (dist < 1.5) {
                if(!target.godMode) {
                    target.hp -= pr.dmg;
                    if(target.hp <= 0 && target.hp + pr.dmg > 0) io.to(pid).emit('death'); 
                }
                hitSomeone = true;
                break;
            }
        }

        if (hitSomeone || pr.y <= 0 || pr.life <= 0) { projectiles.splice(i, 1); }
    }

    // Send slowMo state to clients so they can trigger the blue screen
    io.emit('gameState', { players, projectiles, slowMo });
}, 1000 / TICK_RATE);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => { console.log(`Server Auth Engine listening on port ${PORT}`); });
