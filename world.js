// world.js — Scene setup, environment, boss arena, boss mesh, sky shrines
import * as THREE from 'https://cdn.skypack.dev/three@0.136.0';

export const shrineOrbs  = {};
export const shrineRings = {};
export const shrineGroups = {};
export let bossMeshGroup;
export let bossRubble;

export function initScene() {
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87ceeb);
    scene.fog = new THREE.FogExp2(0x87ceeb, 0.006);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    document.body.appendChild(renderer.domElement);

    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 3000);
    camera.rotation.order = 'YXZ';

    // Lighting
    const sun = new THREE.DirectionalLight(0xfff8e8, 1.3);
    sun.position.set(80, 160, 60);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -200; sun.shadow.camera.right = 200;
    sun.shadow.camera.top  =  200; sun.shadow.camera.bottom = -200;
    sun.shadow.camera.far  =  600;
    scene.add(sun);
    scene.add(new THREE.AmbientLight(0x6688cc, 1.0));
    const fill = new THREE.DirectionalLight(0xaaccff, 0.3);
    fill.position.set(-40, 20, -40); scene.add(fill);

    // Ground
    const floor = new THREE.Mesh(
        new THREE.PlaneGeometry(3000, 3000),
        new THREE.MeshStandardMaterial({ color: 0x2d8a2d, roughness: 0.92 })
    );
    floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
    const grid = new THREE.GridHelper(3000, 600, 0x000000, 0x1c6e1c);
    grid.position.y = 0.02; grid.material.opacity = 0.3; grid.material.transparent = true; scene.add(grid);

    buildJail(scene);
    buildArena(scene);
    buildBossMesh(scene);
    buildShrines(scene);

    window.addEventListener('resize', () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    });

    return { scene, camera, renderer };
}

function buildJail(scene) {
    const jailGroup = new THREE.Group();
    jailGroup.position.set(20, 0.02, 20);
    const plateMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.8 });
    jailGroup.add(new THREE.Mesh(new THREE.BoxGeometry(12, 0.5, 12), plateMat));
    const roofM = new THREE.Mesh(new THREE.BoxGeometry(12, 0.5, 12), plateMat);
    roofM.position.y = 10; jailGroup.add(roofM);
    const barMat = new THREE.MeshStandardMaterial({ color: 0x888888, metalness: 0.75, roughness: 0.25 });
    const barGeo = new THREE.CylinderGeometry(0.12, 0.12, 10, 8);
    for (let x = -5.5; x <= 5.5; x += 1.5) {
        const b1 = new THREE.Mesh(barGeo, barMat); b1.position.set(x, 5, -5.5); jailGroup.add(b1);
        const b2 = new THREE.Mesh(barGeo, barMat); b2.position.set(x, 5,  5.5); jailGroup.add(b2);
    }
    for (let z = -4; z <= 4; z += 1.5) {
        jailGroup.add(Object.assign(new THREE.Mesh(barGeo, barMat), { position: new THREE.Vector3(-5.5, 5, z) }));
        jailGroup.add(Object.assign(new THREE.Mesh(barGeo, barMat), { position: new THREE.Vector3( 5.5, 5, z) }));
    }
    scene.add(jailGroup);
}

function buildArena(scene) {
    const CX = 120, CZ = 0;
    const stone = new THREE.MeshStandardMaterial({ color: 0x7a6e5a, roughness: 0.95 });
    const dark  = new THREE.MeshStandardMaterial({ color: 0x3a3028, roughness: 1.0 });
    const moss  = new THREE.MeshStandardMaterial({ color: 0x3a5030, roughness: 1.0 });
    const sand  = new THREE.MeshStandardMaterial({ color: 0xc8b060, roughness: 0.9 });
    const blood = new THREE.MeshStandardMaterial({ color: 0x5a1a0a, roughness: 1.0 });

    const af = new THREE.Mesh(new THREE.CylinderGeometry(30, 30, 0.5, 40), sand);
    af.position.set(CX, 0.25, CZ); af.receiveShadow = true; scene.add(af);
    const cr = new THREE.Mesh(new THREE.CylinderGeometry(12, 12, 0.52, 32), blood);
    cr.position.set(CX, 0.26, CZ); scene.add(cr);

    const segs = 20;
    for (let i = 0; i < segs; i++) {
        const ang = (i / segs) * Math.PI * 2;
        const r = 30, wx = CX + Math.cos(ang) * r, wz = CZ + Math.sin(ang) * r;
        if (i === 0 || i === 1 || (Math.sin(i * 13.7) > 0.4)) continue;
        const h = 4 + Math.abs(Math.sin(i * 3.1 + 0.5)) * 6;
        const seg = new THREE.Mesh(new THREE.BoxGeometry(5, h, 2.5), i % 3 === 0 ? moss : stone);
        seg.position.set(wx, h / 2, wz); seg.rotation.y = ang;
        seg.castShadow = true; seg.receiveShadow = true; scene.add(seg);
        if (h > 7) {
            const c = new THREE.Mesh(new THREE.BoxGeometry(3, 2, 2), dark);
            c.position.set(wx + Math.cos(ang) * 0.4, h + 0.8, wz + Math.sin(ang) * 0.4);
            c.rotation.set(0.15, ang + 0.4, 0.2); c.castShadow = true; scene.add(c);
        }
    }

    const entX = CX - 30, entZ = CZ;
    const pilGeo = new THREE.CylinderGeometry(1.1, 1.4, 12, 10);
    const pL = new THREE.Mesh(pilGeo, stone); pL.position.set(entX + 2, 6, entZ - 4.5); pL.castShadow = true; scene.add(pL);
    const pR = new THREE.Mesh(pilGeo, stone); pR.position.set(entX + 2, 6, entZ + 4.5); pR.castShadow = true; scene.add(pR);
    const capGeo = new THREE.BoxGeometry(2.5, 0.7, 2.5);
    scene.add(Object.assign(new THREE.Mesh(capGeo, dark), { position: new THREE.Vector3(entX + 2, 12.35, entZ - 4.5) }));
    scene.add(Object.assign(new THREE.Mesh(capGeo, dark), { position: new THREE.Vector3(entX + 2, 12.35, entZ + 4.5) }));
    const arch = new THREE.Mesh(new THREE.BoxGeometry(10, 1.4, 1.8), stone);
    arch.position.set(entX + 2, 11.5, entZ); arch.rotation.z = 0.1; arch.castShadow = true; scene.add(arch);
    const fc = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.0, 6, 8), dark);
    fc.rotation.z = Math.PI / 2; fc.position.set(entX + 3, 0.9, entZ + 3); fc.castShadow = true; scene.add(fc);

    [[CX+10,CZ+5],[CX-8,CZ+11],[CX-9,CZ-10],[CX+5,CZ+14],[CX+6,CZ-13],[CX+14,CZ-4]].forEach(([px,pz],i)=>{
        const ph = 2 + i % 3 * 2.5;
        const ip = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 1.0, ph, 6), i % 2 === 0 ? stone : moss);
        ip.position.set(px, ph / 2, pz); ip.castShadow = true; ip.receiveShadow = true; scene.add(ip);
    });

    [[CX+6,CZ+7],[CX-7,CZ-5],[CX+13,CZ+3],[CX-4,CZ+15],[CX+9,CZ-12],[CX-12,CZ+4],[CX+2,CZ-8]].forEach(([rx,rz])=>{
        const rs = 0.5 + Math.random() * 1.0;
        const rb = new THREE.Mesh(new THREE.DodecahedronGeometry(rs, 0), dark);
        rb.position.set(rx, rs * 0.6, rz);
        rb.rotation.set(Math.random()*Math.PI, Math.random()*Math.PI, Math.random()*Math.PI);
        rb.castShadow = true; rb.receiveShadow = true; scene.add(rb);
    });

    const crackMat = new THREE.MeshStandardMaterial({ color: 0x2a1a00 });
    for (let c = 0; c < 10; c++) {
        const ca = Math.random() * Math.PI * 2, cr2 = Math.random() * 20;
        const crack = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.05, 2 + Math.random() * 6), crackMat);
        crack.position.set(CX + Math.cos(ca) * cr2, 0.52, CZ + Math.sin(ca) * cr2); crack.rotation.y = ca; scene.add(crack);
    }

    [-4.5, 4.5].forEach(tz => {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 3, 6), dark);
        post.position.set(entX + 2, 1.5, entZ + tz); scene.add(post);
        const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.2, 0.5, 8), dark);
        bowl.position.set(entX + 2, 3.25, entZ + tz); scene.add(bowl);
        const flame = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.6, 6),
            new THREE.MeshStandardMaterial({ color: 0xff6600, emissive: 0xff4400, emissiveIntensity: 1.5 }));
        flame.position.set(entX + 2, 3.7, entZ + tz); scene.add(flame);
    });

    const signPost = new THREE.Mesh(new THREE.BoxGeometry(0.18, 3, 0.18), dark);
    signPost.position.set(entX - 1, 1.5, entZ); scene.add(signPost);
    const sign = new THREE.Mesh(new THREE.BoxGeometry(4, 1.2, 0.15),
        new THREE.MeshStandardMaterial({ color: 0x4a1a00 }));
    sign.position.set(entX - 1, 3.1, entZ); scene.add(sign);
}

function buildBossMesh(scene) {
    bossMeshGroup = new THREE.Group();
    const st = new THREE.MeshStandardMaterial({ color: 0x706050, roughness: 0.95, metalness: 0.05 });
    const dk = new THREE.MeshStandardMaterial({ color: 0x2a2018, roughness: 1.0 });
    const gl = new THREE.MeshStandardMaterial({ color: 0xff4400, emissive: 0xff2200, emissiveIntensity: 1.0, roughness: 0.2 });
    const cr = new THREE.MeshStandardMaterial({ color: 0xff5500, emissive: 0xff3300, emissiveIntensity: 0.7 });

    const body = new THREE.Mesh(new THREE.BoxGeometry(4.2,3.8,2.8), st); body.position.y = 4.9; body.castShadow = true;
    const lL = new THREE.Mesh(new THREE.BoxGeometry(1.7,3.2,1.7), st); lL.position.set(-1.1,1.6,0); lL.castShadow = true;
    const lR = new THREE.Mesh(new THREE.BoxGeometry(1.7,3.2,1.7), st); lR.position.set( 1.1,1.6,0); lR.castShadow = true;
    const fL = new THREE.Mesh(new THREE.BoxGeometry(1.8,0.7,2.4), dk); fL.position.set(-1.1,0.35,0.4); fL.castShadow = true;
    const fR = new THREE.Mesh(new THREE.BoxGeometry(1.8,0.7,2.4), dk); fR.position.set( 1.1,0.35,0.4); fR.castShadow = true;
    const aL = new THREE.Mesh(new THREE.BoxGeometry(1.4,3.8,1.4), st); aL.position.set(-3.1,5.8,0); aL.castShadow = true;
    const aR = new THREE.Mesh(new THREE.BoxGeometry(1.4,3.8,1.4), st); aR.position.set( 3.1,5.8,0); aR.castShadow = true;
    const fiL = new THREE.Mesh(new THREE.DodecahedronGeometry(1.3,0), dk); fiL.position.set(-3.1,3.6,0); fiL.castShadow = true;
    const fiR = new THREE.Mesh(new THREE.DodecahedronGeometry(1.3,0), dk); fiR.position.set( 3.1,3.6,0); fiR.castShadow = true;
    const hd  = new THREE.Mesh(new THREE.BoxGeometry(2.8,2.5,2.5), st); hd.position.y = 8.2; hd.castShadow = true;
    const eL  = new THREE.Mesh(new THREE.SphereGeometry(0.35,8,8), gl); eL.position.set(-0.7,8.35,-1.26);
    const eR  = new THREE.Mesh(new THREE.SphereGeometry(0.35,8,8), gl); eR.position.set( 0.7,8.35,-1.26);
    const hnL = new THREE.Mesh(new THREE.ConeGeometry(0.3,2,5), dk); hnL.position.set(-0.9,9.7,0); hnL.rotation.z= 0.35; hnL.castShadow=true;
    const hnR = new THREE.Mesh(new THREE.ConeGeometry(0.3,2,5), dk); hnR.position.set( 0.9,9.7,0); hnR.rotation.z=-0.35; hnR.castShadow=true;
    const c1  = new THREE.Mesh(new THREE.BoxGeometry(0.1,2.2,0.12), cr); c1.position.set(-0.6,5.2,-1.41); c1.rotation.z= 0.18;
    const c2  = new THREE.Mesh(new THREE.BoxGeometry(0.1,1.6,0.12), cr); c2.position.set( 0.9,4.4,-1.41); c2.rotation.z=-0.2;
    const c3  = new THREE.Mesh(new THREE.BoxGeometry(0.1,1.0,0.12), cr); c3.position.set(-0.1,6.5,-1.41); c3.rotation.z= 0.05;
    const spL = new THREE.Mesh(new THREE.DodecahedronGeometry(0.9,0), dk); spL.position.set(-2.4,7.2,0); spL.castShadow=true;
    const spR = new THREE.Mesh(new THREE.DodecahedronGeometry(0.9,0), dk); spR.position.set( 2.4,7.2,0); spR.castShadow=true;
    [body,lL,lR,fL,fR,aL,aR,fiL,fiR,hd,eL,eR,hnL,hnR,c1,c2,c3,spL,spR].forEach(m => bossMeshGroup.add(m));
    scene.add(bossMeshGroup);

    bossRubble = new THREE.Group();
    const rm = new THREE.MeshStandardMaterial({ color: 0x4a4030, roughness: 1.0 });
    for (let i = 0; i < 12; i++) {
        const s = 0.4 + Math.random() * 1.4;
        const rb = new THREE.Mesh(new THREE.DodecahedronGeometry(s, 0), rm);
        rb.position.set((Math.random()-0.5)*10, s*0.5, (Math.random()-0.5)*10);
        rb.rotation.set(Math.random()*Math.PI, Math.random()*Math.PI, Math.random()*Math.PI);
        rb.castShadow = true; bossRubble.add(rb);
    }
    bossRubble.visible = false;
    scene.add(bossRubble);
}

function buildSkyShrine(scene, el, sx, sy, sz, col) {
    const g = new THREE.Group();
    const st    = new THREE.MeshStandardMaterial({ color: 0x9a8a70, roughness: 0.92 });
    const elMat = new THREE.MeshStandardMaterial({ color: col, roughness: 0.6, metalness: 0.15 });
    const glMat = new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 1.4, roughness: 0.15 });
    const dkMat = new THREE.MeshStandardMaterial({ color: 0x2a2018, roughness: 1.0 });
    const grMat = new THREE.MeshStandardMaterial({ color: 0x3a8a3a, roughness: 0.9 });

    const isl = new THREE.Mesh(new THREE.CylinderGeometry(14,7,6,12), new THREE.MeshStandardMaterial({color:0x6a5a48,roughness:1.0}));
    isl.position.y = -3; isl.receiveShadow = true; g.add(isl);
    const grs = new THREE.Mesh(new THREE.CylinderGeometry(14,14,0.7,12), grMat); grs.position.y = 0.35; g.add(grs);

    for (let v = 0; v < 10; v++) {
        const va = (v/10)*Math.PI*2, vr = 11 + Math.random()*2;
        const vn = new THREE.Mesh(new THREE.CylinderGeometry(0.09,0.04,1.8+Math.random()*2.5,4),
            new THREE.MeshStandardMaterial({color:0x2a6a20,roughness:1.0}));
        vn.position.set(Math.cos(va)*vr, -3.5+Math.random(), Math.sin(va)*vr); g.add(vn);
    }

    const base = new THREE.Mesh(new THREE.BoxGeometry(11,0.9,11), st); base.position.y = 0.45; base.receiveShadow = true; g.add(base);
    [[-3.8,3.8],[3.8,3.8],[-3.8,-3.8],[3.8,-3.8]].forEach(([px,pz]) => {
        const pil = new THREE.Mesh(new THREE.CylinderGeometry(0.55,0.7,6,8), st); pil.position.set(px,3.9,pz); pil.castShadow=true; g.add(pil);
        const cap = new THREE.Mesh(new THREE.BoxGeometry(1.4,0.55,1.4), elMat); cap.position.set(px,7.0,pz); g.add(cap);
    });

    const beam1 = new THREE.Mesh(new THREE.BoxGeometry(9.5,0.45,0.9), st); beam1.position.set(0,7.25, 3.8); g.add(beam1);
    const beam2 = new THREE.Mesh(new THREE.BoxGeometry(9.5,0.45,0.9), st); beam2.position.set(0,7.25,-3.8); g.add(beam2);
    const beam3 = new THREE.Mesh(new THREE.BoxGeometry(0.9,0.45,9.5), st); beam3.position.set( 3.8,7.25,0); g.add(beam3);
    const beam4 = new THREE.Mesh(new THREE.BoxGeometry(0.9,0.45,9.5), st); beam4.position.set(-3.8,7.25,0); g.add(beam4);

    const roof = new THREE.Mesh(new THREE.BoxGeometry(10,0.55,10), elMat); roof.position.y = 7.55; g.add(roof);
    const peak = new THREE.Mesh(new THREE.ConeGeometry(2.8,3.5,4), elMat); peak.position.y = 9.8; peak.rotation.y = Math.PI/4; peak.castShadow=true; g.add(peak);
    const gem  = new THREE.Mesh(new THREE.OctahedronGeometry(0.6,0), glMat); gem.position.y = 11.8; g.add(gem);

    const disc = new THREE.Mesh(new THREE.CylinderGeometry(2.5,2.5,0.12,32), glMat); disc.position.y = 0.92; g.add(disc);
    const ped  = new THREE.Mesh(new THREE.CylinderGeometry(0.8,1.0,1.6,8), st); ped.position.y = 1.7; g.add(ped);

    const orb  = new THREE.Mesh(new THREE.SphereGeometry(1.0,16,16), glMat); orb.position.y = 3.7; g.add(orb);
    shrineOrbs[el] = orb;

    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.7,0.14,8,32),
        new THREE.MeshStandardMaterial({color:col,emissive:col,emissiveIntensity:0.9}));
    ring.rotation.x = Math.PI/2; ring.position.y = 3.7; g.add(ring);
    shrineRings[el] = ring;

    const spost = new THREE.Mesh(new THREE.BoxGeometry(0.2,2.8,0.2), dkMat); spost.position.set(0,1.4,6.2); g.add(spost);
    const sbd   = new THREE.Mesh(new THREE.BoxGeometry(6,1.3,0.2), new THREE.MeshStandardMaterial({color:col,emissive:col,emissiveIntensity:0.4}));
    sbd.position.set(0,3.0,6.2); g.add(sbd);

    const orbitRocks = [];
    for (let r = 0; r < 5; r++) {
        const ra = (r/5)*Math.PI*2;
        const rk = new THREE.Mesh(new THREE.DodecahedronGeometry(0.35+Math.random()*0.3,0), st);
        rk.userData = { angle:ra, radius:16+Math.random()*2, speed:0.003+Math.random()*0.002, yOff:-1+Math.random()*2 };
        g.add(rk); orbitRocks.push(rk);
    }
    g.userData.orbitRocks = orbitRocks;

    g.position.set(sx, sy, sz);
    scene.add(g);
    return g;
}

function buildShrines(scene) {
    shrineGroups.AIR   = buildSkyShrine(scene, 'AIR',    0,  80, -140, 0xbbbbff);
    shrineGroups.EARTH = buildSkyShrine(scene, 'EARTH', 140, 52,    0, 0x8b5a2a);
    shrineGroups.FIRE  = buildSkyShrine(scene, 'FIRE', -140, 62,    0, 0xff4500);
    shrineGroups.WATER = buildSkyShrine(scene, 'WATER',   0, 58,  140, 0x0088ff);
}

export function animateShrines(t) {
    for (const el in shrineOrbs) {
        const orb = shrineOrbs[el];
        orb.position.y = 3.7 + Math.sin(t * 2.2 + el.charCodeAt(0) * 0.5) * 0.4;
        orb.rotation.y += 0.025;
        if (shrineRings[el]) { shrineRings[el].rotation.z += 0.02; shrineRings[el].position.y = orb.position.y; }
    }
    for (const el in shrineGroups) {
        const g = shrineGroups[el];
        if (g.userData.orbitRocks) {
            g.userData.orbitRocks.forEach(rk => {
                rk.userData.angle += rk.userData.speed;
                rk.position.x = Math.cos(rk.userData.angle) * rk.userData.radius;
                rk.position.z = Math.sin(rk.userData.angle) * rk.userData.radius;
                rk.position.y = rk.userData.yOff + Math.sin(rk.userData.angle * 3) * 1.2;
                rk.rotation.y += 0.01;
            });
        }
    }
}
