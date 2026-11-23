// Race obstacles: spinning plus signs, projectile lanes, trap platforms (exploding stars / falling slabs) and slow-fall clouds.
// All motion comes from the race clock (S.race.t), so the host, the guests and the replay draw the same thing.
import * as THREE from 'three';
import { S } from '../gameCore.js';
import { spinAngle, shotPos } from '../raceTracks.js';
import { wx, wy } from './space.js';

const glow = (c, k = 2.4) => new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(k), toneMapped: false });

export function buildRaceObs(root) {
    const R = S.race, O = R.obs, g = new THREE.Group(); root.add(g);
    const theme = R.theme;
    const ups = [];
    // ---- plus-sign platforms: a big cross; the level arm is the platform
    const plus = (O.plus || []).map((o) => {
        const grp = new THREE.Group(), col = theme === 'lava' ? '#fb923c' : theme === 'horizon' ? '#f0abfc' : '#22d3ee', len = o.r * 2 + 40;
        const mat = new THREE.MeshStandardMaterial({ color: 0x2a2f45, roughness: 0.5, metalness: 0.3 }), edge = glow(col, 2.2);
        for (const rot of [0, Math.PI / 2]) {
            const arm = new THREE.Group(), body = new THREE.Mesh(new THREE.BoxGeometry(len, 64, 440), mat), top = new THREE.Mesh(new THREE.BoxGeometry(len, 9, 444), edge);
            top.position.y = 32; arm.add(body, top); arm.rotation.z = rot; grp.add(arm);
        }
        const hub = new THREE.Mesh(new THREE.CylinderGeometry(95, 95, 450, 24), glow('#fef3c7', 1.8)); hub.rotation.x = Math.PI / 2; grp.add(hub);
        g.add(grp); return { o, grp };
    });
    ups.push((t) => { for (const s of plus) { const p = s.o.p; s.grp.position.set(wx(p.x + p.w / 2), wy(s.o.by) - 20, 0); s.grp.rotation.z = -spinAngle(s.o, t); } });
    // ---- projectile lanes
    const shotGeo = new THREE.SphereGeometry(24, 12, 10), shotCol = theme === 'lava' ? '#ff5a1a' : theme === 'horizon' ? '#7dd3fc' : '#f472b6';
    const shots = [], tailGeo = new THREE.ConeGeometry(18, 80, 8);
    ups.push(() => {
        const L = (S.race && S.race.shots) || [];
        while (shots.length < L.length) { const m = new THREE.Mesh(shotGeo, glow(shotCol, 2.6)); const tl = new THREE.Mesh(tailGeo, glow(shotCol, 1.4)); tl.rotation.z = -Math.PI / 2; tl.position.x = 52; m.add(tl); g.add(m); shots.push(m); }
        shots.forEach((m, i) => { const q = L[i]; m.visible = !!q; if (q) { m.position.set(wx(q.x), wy(q.y), 0); const sc = q.k === 1 ? 1.25 : q.k === 2 ? 0.9 : 1; m.scale.set(sc, sc, sc); m.material.color.set(q.k === 2 ? '#7c3aed' : q.k === 1 ? '#fde047' : shotCol).multiplyScalar(2.6); } });
    });
    // ---- checkpoint flags (every 10th platform; they ride their platform when it slides)
    const flags = (S.race.nodes || []).filter(n => n.cp).map(n => {
        const fg = new THREE.Group(), col = new THREE.Color('#38bdf8').multiplyScalar(2.2);
        const pole = new THREE.Mesh(new THREE.BoxGeometry(14, 90, 14), new THREE.MeshBasicMaterial({ color: col, toneMapped: false })); pole.position.y = 45;
        const fl = new THREE.Mesh(new THREE.PlaneGeometry(46, 26), new THREE.MeshBasicMaterial({ color: col, side: THREE.DoubleSide, toneMapped: false })); fl.position.set(24, 76, 0);
        fg.add(pole, fl); g.add(fg); return { n, fg };
    });
    ups.push(() => { for (const f of flags) f.fg.position.set(wx((f.n.l + f.n.r) / 2), wy(f.n.y), 0); });
    // ---- clouds (zones where you sink slowly and cannot jump)
    const puffGeo = new THREE.SphereGeometry(1, 10, 8), puffMat = new THREE.MeshBasicMaterial({ color: 0xf1f5f9, transparent: true, opacity: 0.62, depthWrite: false });
    for (const z of O.cloud) {
        const n = Math.max(6, Math.round((z.x1 - z.x0) / 70)), grp = new THREE.Group();
        for (let i = 0; i < n * 2; i++) {
            const u = (i % n + 0.5) / n, row = Math.floor(i / n), m = new THREE.Mesh(puffGeo, puffMat), r = 70 + ((i * 37) % 50);
            m.scale.set(r * 1.3, r * 0.8, r * 0.9);
            m.position.set(wx(z.x0 + (z.x1 - z.x0) * u), wy(z.y0 + (z.y1 - z.y0) * (0.15 + 0.7 * ((i * 53 % 100) / 100))) + (row ? 40 : -20), (i % 3 - 1) * 60);
            grp.add(m);
        }
        g.add(grp);
    }
    // ---- trap platforms
    const dyn = O.dyn.map((d) => {
        const p = d.p, grp = new THREE.Group(), star = d.kind === 'star';
        const slabMat = new THREE.MeshStandardMaterial({ color: star ? 0x2a2540 : 0x2a1d1b, roughness: 0.6, metalness: 0.3 });
        const slab = new THREE.Mesh(new THREE.BoxGeometry(p.w, 26, 300), slabMat); slab.position.y = -13;
        const edgeMat = glow(star ? '#fde047' : '#ff7a1a', 2.4), edge = new THREE.Mesh(new THREE.BoxGeometry(p.w, 5, 304), edgeMat); edge.position.y = 1;
        grp.add(slab, edge);
        let ornament = null;
        if (star) {
            const sh = new THREE.Shape(), R0 = 52, R1 = 22; for (let i = 0; i < 10; i++) { const a = Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? R1 : R0; (i ? sh.lineTo : sh.moveTo).call(sh, Math.cos(a) * r, Math.sin(a) * r); } sh.closePath();
            ornament = new THREE.Mesh(new THREE.ExtrudeGeometry(sh, { depth: 24, bevelEnabled: false }), edgeMat); ornament.position.set(0, 70, -12); grp.add(ornament);
        } else { const keel = new THREE.Mesh(new THREE.ConeGeometry(Math.min(60, p.w * 0.25), 80, 5), slabMat); keel.rotation.x = Math.PI; keel.position.y = -66; grp.add(keel); }
        g.add(grp); return { d, grp, edgeMat, ornament };
    });
    ups.push((t) => {
        for (const o of dyn) {
            const d = o.d, p = d.p; o.grp.visible = p.y < 1e5;
            if (!o.grp.visible) continue;
            const arm = d.st === 1, sh = arm ? Math.sin(t * 1.4) * 5 : 0;
            o.grp.position.set(wx(p.x + p.w / 2) + sh, wy(p.y), 0);
            if (o.ornament) o.ornament.rotation.y = t * 0.05;
            const k = arm ? 0.5 + 0.5 * Math.sin(t * 0.7 * (1 + (d.tm || 0) / 20)) : 1;
            o.edgeMat.color.setRGB(arm ? 2.6 : (d.kind === 'star' ? 2.4 : 2.4), arm ? 0.5 + 1.2 * k : (d.kind === 'star' ? 2.1 : 1.0), arm ? 0.2 : (d.kind === 'star' ? 0.3 : 0.1));
        }
    });
    return { update: () => { const t = S.race ? S.race.t : 0; for (const f of ups) f(t); }, root: g };
}
