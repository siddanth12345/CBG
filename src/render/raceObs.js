// Race obstacles: spinning plus signs, projectile lanes, trap platforms (exploding stars / falling slabs) and slow-fall clouds.
// All motion comes from the race clock (S.race.t), so the host, the guests and the replay draw the same thing.
import * as THREE from 'three';
import { S } from '../gameCore.js';
import { spinAngle, shotPos, galeOf, GALE } from '../raceTracks.js';
import { fighters } from '../gameCore.js';
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
        const p = d.p, grp = new THREE.Group(), star = d.kind === 'star', lift = d.kind === 'liftU' || d.kind === 'liftD';
        const slabMat = new THREE.MeshStandardMaterial({ color: lift ? 0x7a5230 : star ? 0x2a2540 : 0x2a1d1b, roughness: 0.6, metalness: 0.3 });
        const slab = new THREE.Mesh(new THREE.BoxGeometry(p.w, 26, 300), slabMat); slab.position.y = -13;
        const edgeMat = glow(lift ? '#7be36b' : star ? '#fde047' : '#ff7a1a', 2.0), edge = new THREE.Mesh(new THREE.BoxGeometry(p.w, 5, 304), edgeMat); edge.position.y = 1;
        grp.add(slab, edge);
        let ornament = null;
        if (star) {
            const sh = new THREE.Shape(), R0 = 52, R1 = 22; for (let i = 0; i < 10; i++) { const a = Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? R1 : R0; (i ? sh.lineTo : sh.moveTo).call(sh, Math.cos(a) * r, Math.sin(a) * r); } sh.closePath();
            ornament = new THREE.Mesh(new THREE.ExtrudeGeometry(sh, { depth: 24, bevelEnabled: false }), edgeMat); ornament.position.set(0, 70, -12); grp.add(ornament);
        } else if (lift) {                                               // white hill-style circle with an arrow: up or down
            const rr = Math.min(80, p.w * 0.36), disc = new THREE.Mesh(new THREE.CircleGeometry(rr, 40), new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }));
            disc.rotation.x = -Math.PI / 2; disc.position.set(0, 7, 0); grp.add(disc);
            const ringM = new THREE.Mesh(new THREE.RingGeometry(rr * 1.08, rr * 1.22, 40), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 1.6, 1.6), toneMapped: false, side: THREE.DoubleSide }));
            ringM.rotation.x = -Math.PI / 2; ringM.position.set(0, 7, 0); grp.add(ringM);
            const tri = new THREE.Shape(); const up = d.kind === 'liftU'; tri.moveTo(0, up ? rr * 0.6 : -rr * 0.6); tri.lineTo(-rr * 0.5, up ? -rr * 0.4 : rr * 0.4); tri.lineTo(rr * 0.5, up ? -rr * 0.4 : rr * 0.4); tri.closePath();
            const arrow = new THREE.Mesh(new THREE.ShapeGeometry(tri), new THREE.MeshBasicMaterial({ color: up ? 0x16a34a : 0xdc2626, toneMapped: false, side: THREE.DoubleSide }));
            arrow.rotation.x = -Math.PI / 2; arrow.rotation.z = Math.PI; arrow.position.set(0, 8, 0); grp.add(arrow);
        } else { const keel = new THREE.Mesh(new THREE.ConeGeometry(Math.min(60, p.w * 0.25), 80, 5), slabMat); keel.rotation.x = Math.PI; keel.position.y = -66; grp.add(keel); }
        g.add(grp); return { d, grp, edgeMat, ornament, lift };
    });
    ups.push((t) => {
        for (const o of dyn) {
            const d = o.d, p = d.p; o.grp.visible = p.y < 1e5;
            if (!o.grp.visible) continue;
            if (o.lift) { o.grp.position.set(wx(p.x + p.w / 2), wy(p.y), 0); continue; }
            const arm = d.st === 1, sh = arm ? Math.sin(t * 1.4) * 5 : 0;
            o.grp.position.set(wx(p.x + p.w / 2) + sh, wy(p.y), 0);
            if (o.ornament) o.ornament.rotation.y = t * 0.05;
            const k = arm ? 0.5 + 0.5 * Math.sin(t * 0.7 * (1 + (d.tm || 0) / 20)) : 1;
            o.edgeMat.color.setRGB(arm ? 2.6 : (d.kind === 'star' ? 2.4 : 2.4), arm ? 0.5 + 1.2 * k : (d.kind === 'star' ? 2.1 : 1.0), arm ? 0.2 : (d.kind === 'star' ? 0.3 : 0.1));
        }
    });
    if (R.map === 'sunny') {                                          // gales: a pale oval of wind with streaks flying in its direction
        const gal = fighters.map(() => {
            const gg = new THREE.Group(), body = new THREE.Mesh(new THREE.CircleGeometry(0.5, 40), new THREE.MeshBasicMaterial({ color: 0xcdeeff, transparent: true, opacity: 0.16, depthWrite: false, toneMapped: false }));
            body.scale.set(GALE.w, GALE.h, 1); gg.add(body);
            const st = []; for (let j = 0; j < 16; j++) { const m = new THREE.Mesh(new THREE.BoxGeometry(150, 5, 4), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7, depthWrite: false, toneMapped: false })); gg.add(m); st.push(m); }
            gg.visible = false; g.add(gg); return { gg, body, st };
        });
        ups.push((t) => {
            fighters.forEach((f, i) => {
                const G = gal[i]; if (!G) return; const gl = f.active && !f.out ? galeOf(f.slot, t) : null; G.gg.visible = !!gl; if (!gl) return;
                const k = Math.min(1, gl.age / 8, (60 - gl.age) / 8); G.gg.position.set(wx(f.x + gl.ox), wy(f.y + gl.oy), 20); G.gg.rotation.z = Math.atan2(gl.ay, gl.ax) * 0.0;
                G.body.material.opacity = 0.16 * k;
                G.st.forEach((m, j) => { const u = ((j * 0.137 + gl.age * 0.035) % 1), v = ((j * 0.61) % 1) - 0.5; const along = (u - 0.5) * GALE.w, across = v * GALE.h * 0.85; m.position.set(gl.ax * along - gl.ay * across, gl.ay * along + gl.ax * across, 0); m.rotation.z = Math.atan2(gl.ay, gl.ax); m.material.opacity = 0.7 * k; });
            });
        });
    }
    if ((O.spike || []).length) {                                    // big spiked hills: one extruded green dome each + two instanced spike sets in total (cheap)
        const hillMat = new THREE.MeshStandardMaterial({ color: 0x4fae5a, roughness: 0.8, metalness: 0 }), sp = [];
        for (const s of O.spike) {
            const r = (s.x1 - s.x0) / 2, cx = (s.x0 + s.x1) / 2, sg = s.dir, aW = wy(s.a), bW = wy(s.b), xl = wx(s.x0), xr = wx(s.x1), cW = wx(cx);
            const sh = new THREE.Shape();                              // outline in world units: tip end rounded
            if (sg === 1) { sh.moveTo(xl, bW); sh.lineTo(xl, aW - r); sh.absarc(cW, aW - r, r, Math.PI, 0, true); sh.lineTo(xr, bW); sh.closePath(); }
            else { sh.moveTo(xl, bW); sh.lineTo(xr, bW); sh.lineTo(xr, aW + r); sh.absarc(cW, aW + r, r, 0, Math.PI, true); sh.lineTo(xl, bW); }
            const geo = new THREE.ExtrudeGeometry(sh, { depth: 300, bevelEnabled: false, curveSegments: 14 }); geo.translate(0, 0, -150);
            g.add(new THREE.Mesh(geo, hillMat));
            // spikes standing on the hill's surface: around the round tip and down both flanks (outward = perpendicular to the surface)
            const tipY = aW - sg * r;                                   // centre of the round cap (world y)
            for (let k = 0; k <= 8; k++) { const an = Math.PI * k / 8; sp.push([cW + Math.cos(an) * r, tipY + sg * Math.sin(an) * r, Math.cos(an), sg * Math.sin(an)]); }
            for (let d = 70; d < 1100; d += 80) for (const side of [-1, 1]) sp.push([side < 0 ? xl : xr, tipY - sg * d, side, 0]);
        }
        const cone = new THREE.ConeGeometry(17, 52, 5), cap = new THREE.ConeGeometry(7, 15, 5);
        const im = new THREE.InstancedMesh(cone, new THREE.MeshStandardMaterial({ color: 0x6b7280, roughness: 0.4, metalness: 0.4 }), sp.length);
        const ic = new THREE.InstancedMesh(cap, new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 0.25, 0.2), toneMapped: false }), sp.length);
        const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1), zax = new THREE.Vector3(0, 0, 1);
        sp.forEach(([x, y, ox, oy], i) => {
            q.setFromAxisAngle(zax, Math.atan2(oy, ox) - Math.PI / 2);
            m4.compose(v.set(x + ox * 22, y + oy * 22, 0), q, one); im.setMatrixAt(i, m4);
            m4.compose(v.set(x + ox * 52, y + oy * 52, 0), q, one); ic.setMatrixAt(i, m4);
        });
        g.add(im, ic);
    }
    if ((O.box || []).length) {                                      // glass cubes: closed on top, front, back and one side; the open side is the doorway
        const glassMat = new THREE.MeshStandardMaterial({ color: 0x9fe8ff, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.17, depthWrite: false, side: THREE.DoubleSide });
        const frameMat = new THREE.LineBasicMaterial({ color: 0xd8f6ff, transparent: true, opacity: 0.85 });
        const geos = new Map(), geo = (w, h, d) => { const k = w + ':' + h + ':' + d; if (!geos.has(k)) geos.set(k, new THREE.BoxGeometry(w, h, d)); return geos.get(k); };
        const boxes = O.box.map((b) => {
            const W = b.w, T = 5, grp = new THREE.Group();
            const top = new THREE.Mesh(geo(W, T, W), glassMat); top.position.y = W / 2;
            const back = new THREE.Mesh(geo(W, W, T), glassMat); back.position.z = -W / 2;
            const front = new THREE.Mesh(geo(W, W, T), glassMat); front.position.z = W / 2;
            const wall = new THREE.Mesh(geo(T, W, W), glassMat); wall.position.x = -b.open * W / 2;       // the closed side is opposite the doorway
            const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geo(W, W, W)), frameMat);
            grp.add(top, back, front, wall, edges); grp.position.y = W / 2; const out = new THREE.Group(); out.add(grp); g.add(out);
            if (!b.p) out.position.set(wx(b.x + W / 2), wy(b.y), 0);
            return { b, out };
        });
        ups.push(() => { for (const o of boxes) if (o.b.p) o.out.position.set(wx(o.b.p.x + o.b.w / 2), wy(o.b.p.y), 0); });
    }
    return { update: () => { const t = S.race ? S.race.t : 0; for (const f of ups) f(t); }, root: g };
}
