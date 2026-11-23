// "Sunny Hill" (King of the Hill only): a bright grassy day, rolling green hills and a hazy horizon behind a grass-topped stage, with a
// golden hill-top zone ring. Looks only: collision is the plain stage + three stacked soft platforms that make the hill.
import * as THREE from 'three';
import { STAGE } from '../gameCore.js';
import { wx, wy } from './space.js';

function ctex(w, h, draw) { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; }
function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

/** adds the scenery to the stage root; returns { sky, group, ring, update } */
export function buildSunnyDecor(root, bodyMat, topY, cx) {
    const R = rng(77), g = new THREE.Group(); root.add(g);
    const sky = ctex(4, 512, (c, w, h) => {
        const gr = c.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#4aa3f0'); gr.addColorStop(0.55, '#9fd2ff'); gr.addColorStop(1, '#fff1cf'); c.fillStyle = gr; c.fillRect(0, 0, w, h);
    });
    // sun
    const sun = new THREE.Mesh(new THREE.CircleGeometry(190, 40), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 2.0, 1.0), fog: false, toneMapped: false }));
    sun.position.set(cx - 1300, topY + 1250, -3600); g.add(sun);
    const halo = new THREE.Mesh(new THREE.CircleGeometry(520, 40), new THREE.MeshBasicMaterial({ color: 0xfff3c4, transparent: true, opacity: 0.28, fog: false, depthWrite: false }));
    halo.position.copy(sun.position); halo.position.z -= 5; g.add(halo);
    // rolling hills (three layers, hazier with distance)
    const layers = [[-3400, 0x7fbf6a, 520, 0.0011, 0], [-2600, 0x5aa850, 380, 0.0016, 2], [-1700, 0x3f8f3c, 250, 0.0023, 5]];
    for (const [z, col, amp, fr, ph] of layers) {
        const sh = new THREE.Shape(); const W = 9000, x0 = -W / 2; sh.moveTo(x0, -900);
        for (let i = 0; i <= 60; i++) { const x = x0 + i * (W / 60); sh.lineTo(x, Math.sin(x * fr + ph) * amp * 0.5 + Math.sin(x * fr * 2.3 + ph * 2) * amp * 0.22 + amp * 0.5); }
        sh.lineTo(x0 + W, -900); sh.closePath();
        const m = new THREE.Mesh(new THREE.ShapeGeometry(sh), new THREE.MeshLambertMaterial({ color: col }));
        m.position.set(cx, topY - 330, z); g.add(m);
    }
    // clouds
    const clouds = [];
    for (let i = 0; i < 9; i++) {
        const c = new THREE.Group();
        for (let k = 0; k < 4; k++) { const b = new THREE.Mesh(new THREE.SphereGeometry(110 + R() * 90, 14, 10), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.92, fog: false })); b.position.set(k * 120 - 180, R() * 40, R() * 60); b.scale.y = 0.55; c.add(b); }
        c.position.set(cx + (R() - 0.5) * 7000, topY + 700 + R() * 900, -2400 - R() * 800); c.userData.sp = 8 + R() * 14; g.add(c); clouds.push(c);
    }
    // flowers + trees on the stage lip
    const treeMat = new THREE.MeshLambertMaterial({ color: 0x2f7a35 }), trunkMat = new THREE.MeshLambertMaterial({ color: 0x6b4423 });
    for (let i = 0; i < 12; i++) {
        const t = new THREE.Group(), s = 0.8 + R() * 0.9;
        const tr = new THREE.Mesh(new THREE.CylinderGeometry(9, 12, 90, 8), trunkMat); tr.position.y = 45; const cr = new THREE.Mesh(new THREE.ConeGeometry(52, 150, 10), treeMat); cr.position.y = 150;
        t.add(tr, cr); t.scale.setScalar(s); t.position.set(cx + (i % 2 ? 1 : -1) * (STAGE.width * 0.55 + R() * 1300), topY - 300 + R() * 50, -700 - R() * 900); g.add(t);
    }
    // hill-top zone ring (the game positions it)
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.93, 1, 64), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 1.7, 0.3), transparent: true, opacity: 0.9, side: THREE.DoubleSide, toneMapped: false, depthWrite: false }));
    ring.visible = false;
    const col = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 40, 1, true), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.0, 1.6, 0.4), transparent: true, opacity: 0.16, side: THREE.DoubleSide, toneMapped: false, depthWrite: false }));
    col.visible = false;
    return { sky, group: g, ring, col, update(t, dt) { for (const c of clouds) { c.position.x += c.userData.sp * dt; if (c.position.x > cx + 4200) c.position.x = cx - 4200; } } };
}
export const grassMat = () => new THREE.MeshStandardMaterial({ color: 0x4caf50, roughness: 0.9, metalness: 0 });
export { wx, wy };
