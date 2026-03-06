// game.js — Main game loop, input, socket events, player & projectile rendering
import * as THREE from 'https://cdn.skypack.dev/three@0.136.0';
import { initScene, animateShrines, bossMeshGroup, bossRubble } from './world.js';
import { ELEMENTS_UI, elColor, createProjectileMesh } from './elements.js';
import {
    updateHotbar, updateSelfHP, ensureNametag, updateNametag,
    updateDirIndicator, updateBossHUD, addChatMessage, toggleChat,
    updateAdminPlayerLists, showShrinePopup, showBossRewardPopup, showGameUI
} from './ui.js';

const SERVER_URL   = 'https://ava-pwjs.onrender.com';
const PLAYER_HEIGHT = 1.85;
const EYE_HEIGHT    = 1.62;
const WALL_HALF_W   = 3.0, WALL_HALF_H = 2.0, WALL_HALF_D = 0.5;

// ── STATE ─────────────────────────────────────────────────────────────────────
let isGameStarted = false, myElement = '';
window.myId = null; window.sessionRole = 'player';
const inputs = { forward:false, backward:false, left:false, right:false, jump:false, sprint:false, yaw:0, pitch:0 };
function resetInputs() { inputs.forward=inputs.backward=inputs.left=inputs.right=inputs.jump=inputs.sprint=false; inputs.yaw=inputs.pitch=0; }

// Dynamic object maps
const playerMeshes      = {};
const projectileMeshes  = {};
const nametagElements   = {};
const whirlpoolAngles   = {};
const wallPoints        = {};

// ── SCENE INIT ────────────────────────────────────────────────────────────────
const { scene, camera, renderer } = initScene();

// ── WALL POINT HELPERS ────────────────────────────────────────────────────────
function getOrCreateWallPoints(id) {
    if (wallPoints[id]) return wallPoints[id];
    const dg = new THREE.MeshBasicMaterial({color:0xff0000}), dc = new THREE.MeshBasicMaterial({color:0x00ff00});
    const geo = new THREE.SphereGeometry(0.12,6,6);
    const pL=new THREE.Mesh(geo,dg), pC=new THREE.Mesh(geo,dc), pR=new THREE.Mesh(geo,dg);
    pL.position.set(-WALL_HALF_W,0,0); pC.position.set(0,0,0); pR.position.set(WALL_HALF_W,0,0);
    const pivot = new THREE.Group(); pivot.add(pL,pC,pR); scene.add(pivot);
    wallPoints[id] = { pivot }; return wallPoints[id];
}
function cleanupWallPoints(id) { if (!wallPoints[id]) return; scene.remove(wallPoints[id].pivot); delete wallPoints[id]; }

// ── PLAYER MESH FACTORY ───────────────────────────────────────────────────────
function makePlayerMesh() {
    const g  = new THREE.Group();
    const sk = new THREE.MeshStandardMaterial({color:0xf5cba7,roughness:0.75});
    const bd = new THREE.MeshStandardMaterial({color:0x3a3a5c,roughness:0.8});
    const pn = new THREE.MeshStandardMaterial({color:0x2a2a3a,roughness:0.85});
    const sh = new THREE.MeshStandardMaterial({color:0x1a1008,roughness:0.9});
    const hr = new THREE.MeshStandardMaterial({color:0x3a2a1a,roughness:1.0});
    const ey = new THREE.MeshStandardMaterial({color:0x1a1a3a,roughness:1.0});
    const add=(geo,mat,x,y,z)=>{const m=new THREE.Mesh(geo,mat);m.position.set(x,y,z);m.castShadow=true;g.add(m);return m;};
    add(new THREE.BoxGeometry(0.22,0.12,0.38),sh,-0.13,0.06,0);
    add(new THREE.BoxGeometry(0.22,0.12,0.38),sh, 0.13,0.06,0);
    add(new THREE.BoxGeometry(0.20,0.43,0.20),pn,-0.13,0.335,0);
    add(new THREE.BoxGeometry(0.20,0.43,0.20),pn, 0.13,0.335,0);
    add(new THREE.BoxGeometry(0.22,0.33,0.22),pn,-0.12,0.715,0);
    add(new THREE.BoxGeometry(0.22,0.33,0.22),pn, 0.12,0.715,0);
    add(new THREE.BoxGeometry(0.56,0.54,0.28),bd, 0,1.15,0);
    add(new THREE.BoxGeometry(0.18,0.48,0.18),bd,-0.37,1.18,0);
    add(new THREE.BoxGeometry(0.18,0.48,0.18),bd, 0.37,1.18,0);
    add(new THREE.BoxGeometry(0.16,0.16,0.16),sk,-0.37,0.94,0);
    add(new THREE.BoxGeometry(0.16,0.16,0.16),sk, 0.37,0.94,0);
    add(new THREE.BoxGeometry(0.16,0.13,0.16),sk, 0,1.485,0);
    add(new THREE.BoxGeometry(0.46,0.44,0.42),sk, 0,1.72,0);
    add(new THREE.BoxGeometry(0.10,0.07,0.04),ey,-0.11,1.68,-0.22);
    add(new THREE.BoxGeometry(0.10,0.07,0.04),ey, 0.11,1.68,-0.22);
    add(new THREE.BoxGeometry(0.48,0.10,0.44),hr, 0,1.90,0);
    return g;
}

// ── SOCKET ────────────────────────────────────────────────────────────────────
const socket = io(SERVER_URL, { autoConnect: true });

socket.on('joinSuccess', (data) => {
    // Clean up old state
    for (const id in playerMeshes)     { scene.remove(playerMeshes[id]); delete playerMeshes[id]; }
    for (const id in projectileMeshes) { scene.remove(projectileMeshes[id]); delete projectileMeshes[id]; }
    for (const id in nametagElements)  { nametagElements[id].remove(); delete nametagElements[id]; }
    for (const id in wallPoints)       cleanupWallPoints(id);
    for (const id in whirlpoolAngles)  delete whirlpoolAngles[id];
    document.getElementById('nametags-container').innerHTML = '';

    window.myId = data.id; myElement = ''; window.sessionRole = 'player';
    resetInputs();

    const playerName = document.getElementById('player-name-input').value.trim() || 'Player';
    showGameUI(playerName);
    isGameStarted = true;
    document.body.requestPointerLock();
});

socket.on('death', () => alert('You Died! Respawning...'));

socket.on('serverNuked', () => {
    if (window.sessionRole === 'owner') return;
    document.exitPointerLock();
    document.body.innerHTML = '<div style="background:black;color:red;height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;font-family:sans-serif;text-align:center;"><h1 style="font-size:76px;margin:0;text-shadow:0 0 20px red;">SERVER NUKED</h1><p style="font-size:22px;color:white;margin-top:20px;">Refresh to reconnect.</p></div>';
});

socket.on('chatMessage', addChatMessage);
socket.on('shrineCollected', showShrinePopup);
socket.on('bossReward', showBossRewardPopup);

socket.on('bossDefeated', () => {
    bossMeshGroup.visible = false;
    bossRubble.visible = true;
    document.getElementById('boss-hud').style.display = 'none';
});

const tempV = new THREE.Vector3();

socket.on('gameState', (state) => {
    if (!isGameStarted) return;
    const now = Date.now();

    // Slow-mo flash
    document.getElementById('flash-overlay').style.opacity = (state.slowMo && state.slowMo.active) ? '1' : '0';

    // Admin lists
    if (document.getElementById('admin-panel').style.display === 'block') {
        updateAdminPlayerLists(state, window.myId);
    }

    // Boss
    updateBossHUD(state.boss);
    if (state.boss) {
        if (state.boss.alive) {
            bossMeshGroup.visible = true; bossRubble.visible = false;
            bossMeshGroup.position.set(state.boss.x, state.boss.y, state.boss.z);
            bossMeshGroup.rotation.y = state.boss.yaw;
            // Walk animation
            const sw = Math.sin(window._t * 7) * 0.3;
            if (bossMeshGroup.children[1]) bossMeshGroup.children[1].rotation.x = sw;
            if (bossMeshGroup.children[2]) bossMeshGroup.children[2].rotation.x = -sw;
            if (bossMeshGroup.children[5]) bossMeshGroup.children[5].rotation.x = -sw;
            if (bossMeshGroup.children[6]) bossMeshGroup.children[6].rotation.x = sw;
        } else {
            bossMeshGroup.visible = false; bossRubble.visible = true;
            bossRubble.position.set(state.boss.x || 120, 0, state.boss.z || 0);
        }
    }

    updateDirIndicator(state, window.myId);

    // Players
    for (const id in state.players) {
        const p = state.players[id];
        if (id === window.myId) {
            camera.position.set(p.x, p.y + EYE_HEIGHT, p.z);
            camera.rotation.set(p.pitch, p.yaw, 0);
            updateSelfHP(p);
            const prevEl = myElement;
            updateHotbar(p, myElement, now);
            if (prevEl !== p.element) myElement = p.element;
        } else {
            if (!playerMeshes[id]) { playerMeshes[id] = makePlayerMesh(); scene.add(playerMeshes[id]); ensureNametag(nametagElements, id, p.name); }
            playerMeshes[id].position.set(p.x, p.y, p.z);
            playerMeshes[id].rotation.y = p.yaw + Math.PI;
            updateNametag(id, p);
            tempV.set(p.x, p.y + PLAYER_HEIGHT + 0.35, p.z);
            tempV.project(camera);
            if (tempV.z < 1) {
                nametagElements[id].style.display = 'flex';
                nametagElements[id].style.left = `${(tempV.x * 0.5 + 0.5) * window.innerWidth}px`;
                nametagElements[id].style.top  = `${(-(tempV.y * 0.5) + 0.5) * window.innerHeight}px`;
            } else { nametagElements[id].style.display = 'none'; }
        }
    }
    for (const id in playerMeshes) {
        if (!state.players[id]) {
            scene.remove(playerMeshes[id]); delete playerMeshes[id];
            if (nametagElements[id]) { nametagElements[id].remove(); delete nametagElements[id]; }
        }
    }

    // Projectiles
    const activeProjIds = new Set(state.projectiles.map(pr => pr.id));
    const activeWallIds = new Set();
    for (const pr of state.projectiles) {
        if (!projectileMeshes[pr.id]) projectileMeshes[pr.id] = createProjectileMesh(scene, pr);
        const mesh = projectileMeshes[pr.id];
        mesh.position.set(pr.x, pr.y, pr.z);
        if (pr.shape === 'wall') {
            mesh.rotation.y = pr.yaw; activeWallIds.add(pr.id);
            const wp = getOrCreateWallPoints(pr.id);
            wp.pivot.position.set(pr.x, pr.y, pr.z); wp.pivot.rotation.y = pr.yaw;
        } else if (pr.shape === 'whirlpool') {
            if (!whirlpoolAngles[pr.id]) whirlpoolAngles[pr.id] = 0;
            whirlpoolAngles[pr.id] += 0.18;
            mesh.rotation.x = Math.PI / 2; mesh.rotation.z = whirlpoolAngles[pr.id];
        } else if (['icosahedron','octahedron','tetrahedron','torusknot'].includes(pr.shape)) {
            mesh.rotation.x += 0.11; mesh.rotation.y += 0.09;
        } else if (pr.vx !== 0 || pr.vy !== 0 || pr.vz !== 0) {
            mesh.lookAt(pr.x + pr.vx, pr.y + pr.vy, pr.z + pr.vz);
        }
    }
    for (const id in wallPoints)      if (!activeWallIds.has(id))  cleanupWallPoints(id);
    for (const id in whirlpoolAngles) if (!activeProjIds.has(id))  delete whirlpoolAngles[id];
    for (const id in projectileMeshes) {
        if (!activeProjIds.has(id)) { scene.remove(projectileMeshes[id]); delete projectileMeshes[id]; }
    }
});

// ── INPUT ─────────────────────────────────────────────────────────────────────
const chatInput = document.getElementById('chat-input');

document.addEventListener('mousemove', (e) => {
    if (document.pointerLockElement === document.body) {
        inputs.yaw   -= e.movementX * 0.002;
        inputs.pitch -= e.movementY * 0.002;
        inputs.pitch  = Math.max(-Math.PI/2, Math.min(Math.PI/2, inputs.pitch));
    }
});

document.addEventListener('click', (e) => {
    if (!isGameStarted) return;
    if (e.target.id === 'chat-toggle-btn' || e.target.id === 'chat-input' || e.target.id === 'chat-send-btn' || e.target.closest('#chat-wrapper') || e.target.classList.contains('admin-btn')) return;
    if (document.pointerLockElement !== document.body && document.getElementById('admin-panel').style.display !== 'block' && document.getElementById('admin-login').style.display !== 'flex')
        document.body.requestPointerLock();
});

document.addEventListener('mousedown', (e) => {
    if (document.pointerLockElement === document.body && e.button === 0) socket.emit('useMove', 0);
});

document.addEventListener('keydown', (e) => {
    if (!isGameStarted) return;
    if (document.activeElement === chatInput) return;
    if (e.key === 'Enter' || e.key === '/') {
        e.preventDefault();
        document.exitPointerLock();
        document.getElementById('chat-wrapper').style.display = 'flex';
        document.getElementById('chat-toggle-btn').innerText = 'Chat [ON]';
        chatInput.focus(); return;
    }
    if (e.code === 'KeyM') {
        const ln = document.getElementById('admin-login'), pn = document.getElementById('admin-panel');
        if (window.sessionRole === 'admin' || window.sessionRole === 'owner') {
            if (pn.style.display !== 'block') { document.exitPointerLock(); pn.style.display = 'block'; }
            else { pn.style.display = 'none'; document.body.requestPointerLock(); }
        } else {
            if (ln.style.display !== 'flex') { document.exitPointerLock(); ln.style.display = 'flex'; }
            else { ln.style.display = 'none'; document.body.requestPointerLock(); }
        }
        return;
    }
    if (document.pointerLockElement === document.body) {
        if (e.code === 'Digit1') socket.emit('switchElement', 'AIR');
        if (e.code === 'Digit2') socket.emit('switchElement', 'EARTH');
        if (e.code === 'Digit3') socket.emit('switchElement', 'FIRE');
        if (e.code === 'Digit4') socket.emit('switchElement', 'WATER');
        if (e.code === 'KeyQ')   socket.emit('useMove', 1);
        if (e.code === 'KeyE')   socket.emit('useMove', 2);
        if (e.code === 'KeyR')   socket.emit('useMove', 3);
        if (e.code === 'KeyW'    || e.code === 'ArrowUp')    inputs.forward  = true;
        if (e.code === 'KeyS'    || e.code === 'ArrowDown')  inputs.backward = true;
        if (e.code === 'KeyA'    || e.code === 'ArrowLeft')  inputs.left     = true;
        if (e.code === 'KeyD'    || e.code === 'ArrowRight') inputs.right    = true;
        if (e.code === 'ShiftLeft') inputs.sprint = true;
        if (e.code === 'Space')     inputs.jump   = true;
    }
});

document.addEventListener('keyup', (e) => {
    if (document.activeElement === chatInput) return;
    if (e.code === 'KeyW'    || e.code === 'ArrowUp')    inputs.forward  = false;
    if (e.code === 'KeyS'    || e.code === 'ArrowDown')  inputs.backward = false;
    if (e.code === 'KeyA'    || e.code === 'ArrowLeft')  inputs.left     = false;
    if (e.code === 'KeyD'    || e.code === 'ArrowRight') inputs.right    = false;
    if (e.code === 'ShiftLeft') inputs.sprint = false;
    if (e.code === 'Space')     inputs.jump   = false;
});

document.addEventListener('pointerlockchange', () => {
    if (document.pointerLockElement !== document.body)
        inputs.forward = inputs.backward = inputs.left = inputs.right = inputs.sprint = inputs.jump = false;
});

// Chat
document.getElementById('chat-send-btn').addEventListener('click', () => {
    if (chatInput.value.trim()) { socket.emit('chatMessage', chatInput.value); chatInput.value = ''; }
});
chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); if (chatInput.value.trim()) { socket.emit('chatMessage', chatInput.value); chatInput.value = ''; } chatInput.blur(); }
});

// Start screen element buttons
document.getElementById('btn-air').addEventListener('click',   () => socket.emit('joinGame', { name: document.getElementById('player-name-input').value.trim() || 'Player', element: 'AIR' }));
document.getElementById('btn-earth').addEventListener('click', () => socket.emit('joinGame', { name: document.getElementById('player-name-input').value.trim() || 'Player', element: 'EARTH' }));
document.getElementById('btn-fire').addEventListener('click',  () => socket.emit('joinGame', { name: document.getElementById('player-name-input').value.trim() || 'Player', element: 'FIRE' }));
document.getElementById('btn-water').addEventListener('click', () => socket.emit('joinGame', { name: document.getElementById('player-name-input').value.trim() || 'Player', element: 'WATER' }));

// ── GLOBAL HELPERS (called from inline HTML) ──────────────────────────────────
window.toggleChat = toggleChat;
window.switchTab  = (id) => { import('./ui.js').then(m => m.switchTab(id)); };

window.checkAdminLogin = () => {
    const pass = document.getElementById('admin-pass').value;
    if (pass === '1FOREST1' || pass === 'Caleb1') {
        document.getElementById('admin-login').style.display = 'none';
        document.getElementById('admin-panel').style.display = 'block';
        window.sessionRole = pass === 'Caleb1' ? 'owner' : 'admin';
        document.getElementById('panel-title').innerText = window.sessionRole === 'owner' ? 'Owner Panel' : 'Admin Panel';
        if (window.sessionRole === 'owner') {
            document.getElementById('owner-give-section').style.display = 'block';
            document.getElementById('owner-server-section').style.display = 'block';
        }
        socket.emit('setRole', window.sessionRole);
        document.getElementById('admin-pass').value = '';
    } else { alert('Incorrect Password!'); }
};
window.closeAdminLogin = () => { document.getElementById('admin-login').style.display = 'none'; document.body.requestPointerLock(); };
window.sendAdminAction = (a, t) => socket.emit('adminCommand', { action: a, targetId: t });
window.givePower = () => socket.emit('adminCommand', { action: 'givePower', targetId: document.getElementById('give-player-list').value, value: document.getElementById('power-list').value });

// ── INPUT SEND LOOP ───────────────────────────────────────────────────────────
setInterval(() => {
    if (isGameStarted && document.pointerLockElement === document.body) socket.emit('input', inputs);
}, 1000 / 30);

// ── RENDER LOOP ───────────────────────────────────────────────────────────────
window._t = 0;
function animate() {
    requestAnimationFrame(animate);
    window._t += 0.018;
    animateShrines(window._t);
    renderer.render(scene, camera);
}
animate();
