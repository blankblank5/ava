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

module.exports = { ELEMENTS, UPGRADED_MOVES, BOSS_REWARD_MOVES };
