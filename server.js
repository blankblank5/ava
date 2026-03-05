const http = require('http');
const { Server } = require('socket.io');

const server = http.createServer();
const io = new Server(server, { cors: { origin: "*" } });

const players = {};
let bannedPlayers = {}; // Format: { "deviceId": { realName: "...", lastNick: "..." } }

const ELEMENTS = {
    AIR: { hp: 100, speed: 0.25, moves: [{cd:400},{cd:1200},{cd:3000},{cd:8000}] },
    EARTH: { hp: 160, speed: 0.15, moves: [{cd:800},{cd:4000},{cd:5000},{cd:12000}] },
    FIRE: { hp: 110, speed: 0.2, moves: [{cd:500},{cd:3000},{cd:4000},{cd:12000}] },
    WATER: { hp: 130, speed: 0.18, moves: [{cd:350},{cd:4000},{cd:3000},{cd:8000}] },
    LIGHTNING: { hp: 100, speed: 0.35, moves: [{cd:400},{cd:2000},{cd:1000},{cd:15000}] }
};

io.on('connection', (socket) => {
    
    socket.on('joinGame', (data) => {
        // PERMANENT DEVICE BAN CHECK
        if(data.deviceId && bannedPlayers[data.deviceId]) {
            socket.emit('serverNuked');
            return;
        }

        const el = ELEMENTS[data.element] || ELEMENTS.AIR;
        players[socket.id] = {
            id: socket.id,
            deviceId: data.deviceId,
            name: data.name || "Player",
            element: data.element || "AIR",
            role: "player",
            x: Math.random() * 20 - 10, y: 0, z: Math.random() * 20 - 10,
            yaw: 0, pitch: 0,
            hp: el.hp, maxHp: el.hp,
            isJailed: false, isMuted: false, godMode: false
        };
        socket.emit('joinSuccess', { id: socket.id });
    });

    socket.on('setRole', (role) => {
        if(players[socket.id]) players[socket.id].role = role;
    });

    socket.on('input', (data) => {
        const p = players[socket.id];
        if(!p) return;
        p.yaw = data.yaw; p.pitch = data.pitch;
        
        let speed = ELEMENTS[p.element].speed;
        if(data.forward) { p.x -= Math.sin(p.yaw) * speed; p.z -= Math.cos(p.yaw) * speed; }
        if(data.backward) { p.x += Math.sin(p.yaw) * speed; p.z += Math.cos(p.yaw) * speed; }
        if(data.left) { p.x -= Math.sin(p.yaw + Math.PI/2) * speed; p.z -= Math.cos(p.yaw + Math.PI/2) * speed; }
        if(data.right) { p.x += Math.sin(p.yaw + Math.PI/2) * speed; p.z += Math.cos(p.yaw + Math.PI/2) * speed; }

        if(p.isJailed) {
            p.x = Math.max(45, Math.min(55, p.x));
            p.z = Math.max(45, Math.min(55, p.z));
        }
    });

    socket.on('adminCommand', (data) => {
        const admin = players[socket.id];
        if(!admin || (admin.role !== 'admin' && admin.role !== 'owner')) return;
        
        const target = players[data.targetId];

        // --- SECURITY: ONLY OWNER CAN DO THESE ---
        const ownerOnly = ['ban', 'unban', 'nuke'];
        if(ownerOnly.includes(data.action) && admin.role !== 'owner') {
            console.log(`Access Denied: Admin ${admin.name} tried to ${data.action}`);
            return;
        }

        switch(data.action) {
            case 'jail': if(target) target.isJailed = !target.isJailed; break;
            case 'mute': if(target) target.isMuted = !target.isMuted; break;
            case 'kick': if(target) io.to(data.targetId).emit('serverNuked'); break;
            case 'godmode': if(target) target.godMode = !target.godMode; break;
            case 'heal': if(target) target.hp = target.maxHp; break;
            case 'givePower': if(target) { target.element = data.value; target.hp = ELEMENTS[data.value].hp; target.maxHp = target.hp; } break;
            
            case 'ban':
                if(target && target.deviceId) {
                    bannedPlayers[target.deviceId] = { realName: data.value, lastNick: target.name };
                    io.to(data.targetId).emit('serverNuked');
                    delete players[data.targetId];
                }
                break;
            case 'unban':
                delete bannedPlayers[data.deviceId];
                break;
            case 'nuke':
                io.emit('serverNuked');
                break;
        }
    });

    socket.on('disconnect', () => { delete players[socket.id]; });
});

setInterval(() => {
    // Basic HP regen or logic could go here
    io.emit('gameState', { players, bannedPlayers });
}, 1000/60);

server.listen(process.env.PORT || 3000);
