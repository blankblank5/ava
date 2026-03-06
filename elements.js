// elements.js — Client-side element definitions and projectile mesh factory
import * as THREE from 'https://cdn.skypack.dev/three@0.136.0';

export const ELEMENTS_UI = {
    AIR:       { color: 0xffffff, hexStr: '#ffffff', moves: [
        { name: 'Air Blast' }, { name: 'Wind Blade' },
        { name: 'Air Dash', maxCharges: 3, cd: 2500 }, { name: 'Hurricane', cd: 7000 }
    ]},
    EARTH:     { color: 0x8b4513, hexStr: '#a0522d', moves: [
        { name: 'Rock Throw' }, { name: 'Ground Spikes', cd: 4500 },
        { name: 'Earth Wall', cd: 5000 }, { name: 'Meteor', cd: 11000 }
    ]},
    FIRE:      { color: 0xff4500, hexStr: '#ff4500', moves: [
        { name: 'Fireball' }, { name: 'Fire Blast', cd: 4000 },
        { name: 'Flamethrower', cd: 4500 }, { name: 'Flaming Meteor', cd: 14000 }
    ]},
    WATER:     { color: 0x0088ff, hexStr: '#0088ff', moves: [
        { name: 'Water Bullet' }, { name: 'Tsunami', cd: 4000 },
        { name: 'Water Whip', cd: 3000 }, { name: 'Whirlpool', cd: 8000 }
    ]},
    LIGHTNING: { color: 0x00ffff, hexStr: '#00ffff', moves: [
        { name: 'Lightning Strike' }, { name: 'Flash' },
        { name: 'Spark Dash', maxCharges: 2, cd: 1000 }, { name: 'Thunderstorm' }
    ]}
};

export function elColor(el) {
    return (ELEMENTS_UI[el] && ELEMENTS_UI[el].hexStr) || '#ffffff';
}

const WALL_HALF_W = 3.0, WALL_HALF_H = 2.0, WALL_HALF_D = 0.5;

export function createProjectileMesh(scene, data) {
    const s = data.size;
    const mat = new THREE.MeshStandardMaterial({
        color: data.color, emissive: data.color, emissiveIntensity: 0.65,
        roughness: 0.3, metalness: 0.1
    });

    if (data.shape === 'lightning') {
        const g = new THREE.Group();
        const sg = new THREE.CylinderGeometry(0.07, 0.07, 2, 6);
        const p1 = new THREE.Mesh(sg, mat); p1.rotation.x = Math.PI / 2;
        const p2 = new THREE.Mesh(sg, mat); p2.rotation.x = Math.PI / 2;
        p2.position.set(0.25, 0.1, 1.4); p2.rotation.y = 0.3;
        g.add(p1, p2); scene.add(g); return g;
    }

    let geo;
    if      (data.shape === 'whirlpool')   geo = new THREE.TorusGeometry(s*4, s*0.5, 8, 24);
    else if (data.shape === 'icosahedron') geo = new THREE.IcosahedronGeometry(s*1.5, 0);
    else if (data.shape === 'octahedron')  geo = new THREE.OctahedronGeometry(s*2, 0);
    else if (data.shape === 'tetrahedron') geo = new THREE.TetrahedronGeometry(s*1.5, 0);
    else if (data.shape === 'torusknot')   geo = new THREE.TorusKnotGeometry(s*1.5, s*0.4, 64, 8);
    else if (data.shape === 'rock')        geo = new THREE.DodecahedronGeometry(s*2, 0);
    else if (data.shape === 'spike')       geo = new THREE.ConeGeometry(s*0.5, s*5, 5);
    else if (data.shape === 'flat')        geo = new THREE.BoxGeometry(s*5, s/2, s*2);
    else if (data.shape === 'cylinder')  { geo = new THREE.CylinderGeometry(s*0.8, s*0.8, s*4, 8); geo.rotateX(Math.PI/2); }
    else if (data.shape === 'wall')      { geo = new THREE.BoxGeometry(6, 4, 1); mat.transparent = true; mat.opacity = 0.88; }
    else if (data.shape === 'cone')      { geo = new THREE.ConeGeometry(s*3.5, s*10, 8); geo.rotateX(Math.PI); }
    else                                   geo = new THREE.SphereGeometry(s, 10, 10);

    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = true;
    scene.add(mesh);
    return mesh;
}
