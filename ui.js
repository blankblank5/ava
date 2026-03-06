// ui.js — HUD, hotbar, nametags, chat, admin panel, popups
import { ELEMENTS_UI, elColor } from './elements.js';

// ── HOTBAR ────────────────────────────────────────────────────────────────────
export function updateHotbar(p, myElement, now) {
    const el = ELEMENTS_UI[p.element] || ELEMENTS_UI['AIR'];
    if (myElement !== p.element) {
        document.getElementById('el-name').innerText = p.element;
        document.getElementById('el-name').style.color = '#' + el.color.toString(16).padStart(6, '0');
        for (let i = 0; i < 4; i++) document.getElementById(`move${i}-name`).innerText = el.moves[i].name;
    }
    for (let i = 0; i < 4; i++) {
        const max = el.moves[i].maxCharges || 1;
        document.getElementById(`ch${i}`).innerText = max > 1 ? `[${p.charges[i]}]` : '';
        if (p.charges[i] < max) {
            const rem = Math.max(0, p.rechargeTimers[i] - now);
            document.getElementById(`cd${i}`).style.height = (rem / (el.moves[i].cd || 1000)) * 100 + '%';
        } else {
            document.getElementById(`cd${i}`).style.height = '0%';
        }
    }
}

// ── HP BAR ────────────────────────────────────────────────────────────────────
export function updateSelfHP(p) {
    document.getElementById('hp-bar').style.width = Math.max(0, p.hp) + '%';
    document.getElementById('hp-numeric').innerText = p.godMode ? '∞/∞' : `${Math.max(0, Math.ceil(p.hp))}/100`;
}

// ── NAMETAGS ──────────────────────────────────────────────────────────────────
export function ensureNametag(nametagElements, id, name) {
    if (nametagElements[id]) return;
    const tag = document.createElement('div');
    tag.className = 'nametag';
    tag.innerHTML = `
        <div class="nametag-name">${name}</div>
        <div class="nametag-element" id="nt-el-${id}"></div>
        <div class="nametag-hp-text" id="nt-hp-txt-${id}"></div>
        <div class="nametag-hp-track"><div class="nametag-hp-fill" id="nt-hp-${id}"></div></div>`;
    document.getElementById('nametags-container').appendChild(tag);
    nametagElements[id] = tag;
}

export function updateNametag(id, p) {
    const el = ELEMENTS_UI[p.element] || ELEMENTS_UI['AIR'];
    const ntEl  = document.getElementById(`nt-el-${id}`);
    const ntTxt = document.getElementById(`nt-hp-txt-${id}`);
    const ntFil = document.getElementById(`nt-hp-${id}`);
    if (ntEl)  { ntEl.innerText = p.element; ntEl.style.color = el.hexStr; }
    if (ntTxt) ntTxt.innerText = p.godMode ? '∞/100' : `${Math.max(0, Math.ceil(p.hp))}/100`;
    if (ntFil) { ntFil.style.width = Math.max(0, p.hp) + '%'; ntFil.style.background = p.godMode ? '#ffd700' : '#ff2222'; }
}

// ── DIRECTION INDICATOR ───────────────────────────────────────────────────────
export function updateDirIndicator(state, myId) {
    const div = document.getElementById('dir-indicator');
    div.innerHTML = '';
    if (!myId || !state.players[myId]) return;
    const me = state.players[myId];
    const cosY = Math.cos(me.yaw), sinY = Math.sin(me.yaw), W = 440;
    for (const id in state.players) {
        if (id === myId) continue;
        const p = state.players[id];
        const dx = p.x - me.x, dz = p.z - me.z;
        const fwd = dx * (-sinY) + dz * (-cosY), right = dx * cosY + dz * (-sinY);
        if (fwd <= 0) continue;
        const ang = Math.atan2(right, fwd);
        const xPos = ((Math.max(-Math.PI/2, Math.min(Math.PI/2, ang)) / (Math.PI/2)) * 0.5 + 0.5) * W;
        const pip = document.createElement('div'); pip.className = 'dir-pip'; pip.style.left = xPos + 'px';
        const dot = document.createElement('div'); dot.className = 'dir-pip-dot';
        dot.style.background = elColor(p.element); dot.style.boxShadow = `0 0 5px ${elColor(p.element)}`;
        const lbl = document.createElement('div'); lbl.className = 'dir-pip-name'; lbl.innerText = p.name;
        pip.appendChild(dot); pip.appendChild(lbl); div.appendChild(pip);
    }
}

// ── BOSS HUD ──────────────────────────────────────────────────────────────────
export function updateBossHUD(boss) {
    const bHUD = document.getElementById('boss-hud');
    if (!boss) return;
    if (boss.alive) {
        bHUD.style.display = 'flex';
        const pct = Math.max(0, boss.hp) / boss.maxHp * 100;
        document.getElementById('boss-hp-fill').style.width = pct + '%';
        document.getElementById('boss-hp-text').innerText = `${Math.max(0, Math.ceil(boss.hp))} / ${boss.maxHp}`;
        document.getElementById('boss-phase-label').innerText = boss.phase === 2 ? '⚠ ENRAGED — PHASE 2' : '';
        if (boss.phase === 2) document.getElementById('boss-hp-fill').style.background = 'linear-gradient(90deg,#550000,#ff0000,#ff4400)';
    } else {
        bHUD.style.display = 'none';
    }
}

// ── CHAT ──────────────────────────────────────────────────────────────────────
export function addChatMessage(data) {
    const box = document.getElementById('chat-messages');
    const d = document.createElement('div');
    d.innerHTML = data.name === 'SYSTEM'
        ? `<span style="font-weight:bold;color:#ff4444;">[SYSTEM]:</span> <span style="color:#ffaaaa;">${data.text}</span>`
        : `<span style="font-weight:bold;color:#ffcc00;">[${data.name}]:</span> ${data.text}`;
    box.appendChild(d); box.scrollTop = box.scrollHeight;
}

export function toggleChat() {
    const c = document.getElementById('chat-wrapper');
    const b = document.getElementById('chat-toggle-btn');
    if (c.style.display === 'none') { c.style.display = 'flex'; b.innerText = 'Chat [ON]'; }
    else { c.style.display = 'none'; b.innerText = 'Chat [OFF]'; }
}

// ── ADMIN PANEL ───────────────────────────────────────────────────────────────
export function updateAdminPlayerLists(state, myId) {
    const gs = document.getElementById('give-player-list');
    const ss = document.getElementById('server-player-list');
    const cg = gs.value, cs = ss.value;
    gs.innerHTML = ss.innerHTML = '';
    for (const id in state.players) {
        const lb = state.players[id].name + (id === myId ? ' (You)' : '');
        gs.appendChild(Object.assign(document.createElement('option'), { value: id, innerText: lb }));
        ss.appendChild(Object.assign(document.createElement('option'), { value: id, innerText: lb }));
    }
    if (state.players[cg]) gs.value = cg;
    if (state.players[cs]) ss.value = cs;
}

export function switchTab(id) {
    document.querySelectorAll('.tab-content').forEach(e => e.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(e => e.classList.remove('active'));
    document.getElementById('tab-' + id).classList.add('active');
    document.getElementById('btn-tab-' + id).classList.add('active');
}

// ── REWARD POPUPS ─────────────────────────────────────────────────────────────
export function showShrinePopup(data) {
    const elColors = { AIR: '#aaaaff', EARTH: '#a0522d', FIRE: '#ff4500', WATER: '#0088ff' };
    const col = elColors[data.element] || 'gold';
    const n = document.getElementById('reward-popup');
    n.style.border = `2px solid ${col}`;
    n.innerHTML = `
        <div style="font-size:22px;font-weight:bold;color:${col}">✨ ${data.element} SKY SHRINE</div>
        <div style="font-size:15px;color:#fff;margin-top:8px;">Basic attack upgraded to:</div>
        <div style="font-size:20px;font-weight:bold;color:${col};margin-top:4px;">${data.moveName}</div>
        <div style="font-size:12px;color:#aaa;margin-top:8px;">Stronger, faster, better!</div>`;
    n.style.display = 'block';
    setTimeout(() => n.style.display = 'none', 5000);
    document.getElementById('slot0').classList.add('upgraded');
    document.getElementById('move0-name').innerText = data.moveName;
}

export function showBossRewardPopup(data) {
    const n = document.getElementById('boss-reward-popup');
    n.innerHTML = `
        <div style="font-size:26px;font-weight:bold;color:#ff6600">🏆 TITAN DEFEATED!</div>
        <div style="font-size:15px;color:#ffccaa;margin-top:8px;">Your Ultimate has been upgraded to:</div>
        <div style="font-size:22px;font-weight:bold;color:#ff6600;margin-top:5px;">${data.moveName}</div>
        <div style="font-size:12px;color:#aaa;margin-top:10px;">A legendary power, hard earned.</div>`;
    n.style.display = 'block';
    setTimeout(() => n.style.display = 'none', 7000);
    document.getElementById('slot3').classList.add('boss-reward');
    document.getElementById('move3-name').innerText = data.moveName;
}

// ── SHOW GAME UI ──────────────────────────────────────────────────────────────
export function showGameUI(playerName) {
    document.getElementById('start-screen').style.display = 'none';
    document.getElementById('game-ui').style.display = 'block';
    document.getElementById('moves-container').style.display = 'flex';
    document.getElementById('dir-indicator').style.display = 'block';
    document.getElementById('chat-wrapper').style.display = 'flex';
    document.getElementById('chat-toggle-btn').style.display = 'block';
    document.getElementById('display-name').innerText = playerName;
}
