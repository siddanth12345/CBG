// Per-character art pass: every fighter gets its own silhouette (wings, fins, great sword, crystals, daggers ...) and its own particle trail.
// Built once per model from the model's materials (so team colours still apply); animated every frame by tickDecor().
import * as THREE from 'three';

const ADD = THREE.AdditiveBlending;
const rnd = (a, b) => a + Math.random() * (b - a);

/** a smooth curved fin: extends down -y from its pivot, bulging toward +x */
function finGeo(len, bulge, thick = 0.9) {
    const s = new THREE.Shape();
    s.moveTo(0, 0); s.quadraticCurveTo(bulge * 1.1, len * 0.35, bulge * 0.15, len); s.quadraticCurveTo(bulge * 0.1, len * 0.45, 0, 0);
    const g = new THREE.ExtrudeGeometry(s, { depth: thick, bevelEnabled: true, bevelSize: 0.25, bevelThickness: 0.25, bevelSegments: 2, curveSegments: 14 });
    g.translate(0, 0, -thick / 2); g.rotateZ(Math.PI); g.scale(-1, 1, 1);        // hang down, bulge toward +x
    return g;
}
/** a jagged lightning bolt strip, hanging down */
function boltGeo(len, w, seed, thick = 1.2) {
    const pts = [[0, 0]]; let x = 0; const n = 6;
    for (let i = 1; i <= n; i++) { x = (i % 2 ? 1 : -1) * w * (0.5 + ((seed * (i + 3) * 7.13) % 1) * 0.7); pts.push([x, -len * i / n]); }
    const s = new THREE.Shape(); s.moveTo(-w * 0.18, 0);
    pts.forEach(([a, b], i) => i && s.lineTo(a - w * 0.18, b)); for (let i = pts.length - 1; i >= 0; i--) s.lineTo(pts[i][0] + w * 0.18, pts[i][1]);
    return new THREE.ExtrudeGeometry(s, { depth: thick, bevelEnabled: false });
}
const glowMat = (c, k = 2, o = 0.9) => new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(k), transparent: true, opacity: o, blending: ADD, depthWrite: false, toneMapped: false });

// ----------------------------------------------------------------------------------------------------------------- per character
const BUILD = {
    luminent(m, c) {
        // wings of light: three feathers each side that flutter, on top of the halo
        for (const s of [-1, 1]) for (let i = 0; i < 3; i++) {
            const g = c.G(m.torso, s * 4, 13 - i * 0.2, -8.5); g.rotation.set(0, s * 0.35, s * (0.55 + i * 0.32));
            const f = new THREE.Mesh(finGeo(26 - i * 5, 5 + i, 0.5), glowMat(m.baseColor, 2.2, 0.55)); f.rotation.z = s > 0 ? Math.PI / 2 : -Math.PI / 2; f.scale.x = 1; g.add(f);
            m.decor.flap.push({ g, base: g.rotation.z, s, i });
        }
        m.decor.emit = { rate: 7, move: 0.5, n: [1, 2], cols: ['#ffffff', m.baseColor], geo: 'sphere', size: [0.9, 1.7], life: [0.5, 0.9], up: 14, back: 4, spread: 12, y: [-12, 28], grav: 0 };
    },
    bulwark(m, c) {
        m.halo.visible = false;
        // a great sword, twice his height, held upright at his left side
        const sw = c.G(m.armL.wr, 0, 0, 0); sw.rotation.z = 0.06; m.bwSw = sw;
        // a broad cleaver: slanted, serrated tip, dark rune panel down the middle, round guard, wrapped grip
        const bs = new THREE.Shape(); bs.moveTo(-11, 6); bs.lineTo(-11, 100); bs.lineTo(-9, 112);                  // sharp point at the top left
        bs.lineTo(11, 92); bs.lineTo(11, 6); bs.lineTo(-11, 6);
        const bg = new THREE.ExtrudeGeometry(bs, { depth: 3.6, bevelEnabled: true, bevelSize: 0.7, bevelThickness: 0.9, bevelSegments: 1 }); bg.translate(0, 0, -1.8);
        const blade = c.M(bg, c.trim); sw.add(blade);
        for (const [y, w] of [[96, 5], [86, 4], [76, 3.2]]) {                                                     // serrated teeth bitten out of the cutting edge
            const t = new THREE.Mesh(new THREE.ConeGeometry(w, w * 1.7, 3), new THREE.MeshBasicMaterial({ color: 0x0b1020 })); t.rotation.z = Math.PI / 2; t.position.set(-11 - w * 0.15, y, 0); t.scale.z = 3; sw.add(t);
        }
        for (const zs of [1, -1]) {
            const pn = c.M(new THREE.BoxGeometry(11, 66, 1.2), c.suit); pn.position.set(2, 50, zs * 2.2); sw.add(pn);
            const rune = [[-3, 76, 6, 1.1], [0, 71, 1.1, 5], [3, 66, 6, 1.1], [0, 61, 1.1, 5], [-3, 56, 6, 1.1], [0, 40, 1.1, 22], [-3, 29, 6, 1.1]];
            for (const [x, y, w, h] of rune) { const r = c.M(new THREE.BoxGeometry(w, h, 0.5), c.glow); r.position.set(2 + x, y, zs * 2.9); sw.add(r); }
        }
        const guard = c.M(new THREE.CylinderGeometry(11.5, 11.5, 3.6, 18), c.armorDark); guard.scale.set(1, 1, 0.5); guard.position.y = 4.4; sw.add(guard);
        const grip = c.M(new THREE.CylinderGeometry(1.9, 1.9, 15, 8), c.suit); grip.position.y = -4.5; sw.add(grip);
        for (let i = 0; i < 5; i++) { const wr = c.M(new THREE.TorusGeometry(1.95, 0.45, 5, 10), c.glow); wr.rotation.x = Math.PI / 2; wr.position.y = -10 + i * 3; sw.add(wr); }
        const pom = c.M(new THREE.OctahedronGeometry(3.4, 0), c.trim); pom.position.y = -13.5; pom.scale.set(1, 0.8, 0.8); sw.add(pom);
        for (const s of [-1, 1]) {                                           // spiked pauldrons and a tabard
            const sp = c.M(new THREE.ConeGeometry(2.6, 9, 6), c.armorDark); sp.position.set(s * 14.4, 21, 0); sp.rotation.z = -s * 0.9; m.torso.add(sp);
        }
        c.trailer(m.pelvis, 8, 17, 0, 3, 6.2, c.armorDark, 'sash');
        m.decor.emit = { rate: 0, move: 0.12, n: [1, 1], cols: ['#e2e8f0', '#fbbf24'], geo: 'box', size: [0.7, 1.1], life: [0.25, 0.4], up: 3, back: 6, spread: 6, y: [-16, -4], grav: -30 };
    },
    zephyr(m, c) {
        m.halo.visible = false;
        for (const [r, tilt, sp] of [[15, 0.25, 2.2], [20, -0.35, -1.5]]) {         // gust rings around the waist
            const ring = new THREE.Mesh(new THREE.TorusGeometry(r, 0.45, 6, 40), glowMat('#a5f3fc', 1.6, 0.5)); const g = c.G(m.pelvis, 0, 4, 0); g.rotation.x = Math.PI / 2 + tilt; g.add(ring); m.decor.spin.push({ g, ax: 'z', sp });
        }
        for (const s of [-1, 1]) for (let i = 0; i < 3; i++) {                       // feathered wind-wings
            const g = c.G(m.torso, s * 5, 14 - i * 1.6, -8); g.rotation.set(0, s * 0.3, s * (0.9 + i * 0.35));
            const f = new THREE.Mesh(finGeo(22 - i * 4, 4.5, 0.6), c.suit === undefined ? glowMat('#fff') : glowMat('#e0f2fe', 1.4, 0.8)); f.rotation.z = s > 0 ? Math.PI / 2 : -Math.PI / 2; g.add(f);
            m.decor.flap.push({ g, base: g.rotation.z, s, i, amp: 0.2 });
        }
        for (const l of [m.legR, m.legL]) { const w = c.M(new THREE.ConeGeometry(2, 9, 4), c.trim); w.rotation.x = -Math.PI / 2 - 0.4; w.position.set(0, -2, -4); l.ank.add(w); }
        m.decor.emit = { rate: 14, move: 1.2, n: [1, 1], cols: ['#e0f2fe', '#a7f3d0'], geo: 'streak', size: [3, 6], life: [0.35, 0.6], up: 3, back: 40, spread: 10, y: [-16, 26], grav: 0 };
    },
    ember(m, c) {
        m.halo.visible = false;
        for (let i = 0; i < 5; i++) {                                                // a burning mane of flame behind the shoulders
            const g = c.G(m.torso, (i - 2) * 3.2, 17, -7); g.rotation.set(-0.5 - Math.abs(i - 2) * 0.1, 0, (i - 2) * -0.28);
            const f = new THREE.Mesh(new THREE.ConeGeometry(3.2 - Math.abs(i - 2) * 0.4, 20 - Math.abs(i - 2) * 3, 7), glowMat(i % 2 ? '#fb923c' : '#facc15', 1.6, 0.85)); f.position.y = 10; g.add(f);
            m.decor.flick.push({ g: f, ph: i * 1.3 });
        }
        for (let i = 0; i < 6; i++) {                                                // prayer beads
            const b = c.M(new THREE.SphereGeometry(1.5, 8, 6), c.glow); const a = (i / 5 - 0.5) * 2.2; b.position.set(Math.sin(a) * 6.5, 15 - Math.cos(a) * 3.5, 5.6); m.torso.add(b);
        }
        for (let i = 0; i < 4; i++) { const sp = new THREE.Mesh(new THREE.SphereGeometry(1.2, 8, 6), glowMat('#fde047', 2, 1)); const g = c.G(m.torso, 0, 12, 0); g.add(sp); sp.position.set(17, 0, 0); g.rotation.y = i * 1.57; m.decor.spin.push({ g, ax: 'y', sp: 1.6 }); }
        // spark clusters like the ones his bubbles throw: 3-5 bright embers born together, drifting up and away
        m.decor.emit = { rate: 9, move: 1.6, n: [3, 5], cols: ['#fb923c', '#fde047', '#ef4444', '#ffffff'], geo: 'sphere', size: [0.9, 2.2], life: [0.5, 1.0], up: 26, back: 14, spread: 9, y: [-14, 24], grav: 8 };
    },
    tide(m, c) {
        m.halo.visible = false;
        const finM = glowMat('#7dd3fc', 1.1, 0.78), fin2 = glowMat('#38bdf8', 1.3, 0.6);
        // a tall curved dorsal fin and a flowing tail fin, plus swept fins on the forearms and calves, and a crest of three smooth head fins
        const dorsal = c.G(m.torso, 0, 17, -7); dorsal.rotation.y = -Math.PI / 2; const d = new THREE.Mesh(finGeo(36, 13, 1.1), finM); dorsal.add(d); dorsal.userData.kind = 'cape'; m.sway.push(dorsal);
        const tail = c.G(m.pelvis, 0, 3, -6); tail.rotation.y = -Math.PI / 2; tail.add(new THREE.Mesh(finGeo(30, 12, 0.9), fin2)); tail.userData.kind = 'sash'; m.sway.push(tail);
        for (const arm of [m.armR, m.armL]) { const g = c.G(arm.el, 0, 0, -1.5); g.rotation.y = -Math.PI / 2; g.add(new THREE.Mesh(finGeo(15, 6, 0.6), finM)); }
        for (const leg of [m.legR, m.legL]) { const g = c.G(leg.kn, 0, -1, -2.4); g.rotation.y = -Math.PI / 2; g.add(new THREE.Mesh(finGeo(13, 5.5, 0.6), fin2)); }
        for (let i = 0; i < 3; i++) { const g = c.G(m.head, 0, 17.5 - i * 1.2, -2 - i * 3.2); g.rotation.set(-0.15 * i, -Math.PI / 2, 0); g.add(new THREE.Mesh(finGeo(14 - i * 2.5, 5, 0.9), finM)); g.rotation.z = 0.6 + i * 0.12; }
        for (const s of [-1, 1]) { const g = c.G(m.head, s * 9.6, 11, 0); g.rotation.set(0, s > 0 ? 0 : Math.PI, 0); g.rotation.z = -1.1; g.add(new THREE.Mesh(finGeo(10, 4, 0.6), finM)); }
        m.decor.emit = { rate: 8, move: 0.8, n: [1, 3], cols: ['#bae6fd', '#7dd3fc', '#ffffff'], geo: 'bubble', size: [1.2, 3], life: [0.7, 1.3], up: 24, back: 8, spread: 12, y: [-16, 26], grav: 0 };
    },
    volt(m, c) {
        m.halo.visible = false;
        for (const s of [-1, 1]) for (let i = 0; i < 2; i++) {                      // lightning-bolt wings
            const g = c.G(m.torso, s * 5, 16, -8); g.rotation.set(0.2, s * 0.4, s * (0.7 + i * 0.5));
            const b = new THREE.Mesh(boltGeo(30 - i * 6, 7, 0.37 + i * 0.23 + (s > 0 ? 0 : 0.11)), glowMat('#fde047', 1.7, 0.95)); b.rotation.z = Math.PI; g.add(b);
            m.decor.flap.push({ g, base: g.rotation.z, s, i, amp: 0.06, fast: 9 });
        }
        const tail = c.G(m.pelvis, 0, 3, -6); const tb = new THREE.Mesh(boltGeo(26, 5, 0.61), glowMat('#facc15', 1.7, 0.95)); tb.rotation.y = Math.PI / 2; tail.add(tb); tail.userData.kind = 'sash'; m.sway.push(tail);
        for (const arm of [m.armR, m.armL]) { const r = new THREE.Mesh(new THREE.TorusGeometry(3.6, 0.5, 5, 10), glowMat('#fde047', 1.8, 1)); r.rotation.x = Math.PI / 2; r.position.y = -6; arm.el.add(r); }
        m.decor.emit = { rate: 16, move: 1.8, n: [1, 3], cols: ['#fde047', '#ffffff', '#fef08a'], geo: 'streak', size: [1.5, 4], life: [0.12, 0.28], up: 0, back: 10, spread: 22, y: [-16, 26], grav: 0, jitter: 90 };
    },
    umbra(m, c) {
        m.halo.visible = false;
        for (const s of [-1, 1]) {                                                    // crossed daggers on the lower back
            const g = c.G(m.torso, 0, 6, -8.4); g.rotation.z = s * 0.75;
            const bl = c.M(new THREE.BoxGeometry(2.2, 22, 0.8), c.trim); bl.position.y = 14; g.add(bl);
            const tp = c.M(new THREE.ConeGeometry(1.1, 5, 4), c.trim); tp.position.y = 27.5; tp.scale.z = 0.4; g.add(tp);
            const hl = c.M(new THREE.BoxGeometry(7, 1.4, 2), c.armorDark); hl.position.y = 2.6; g.add(hl);
            const gr = c.M(new THREE.CylinderGeometry(1, 1, 5, 6), c.glow); gr.position.y = -0.5; g.add(gr);
        }
        for (const s of [-1, 1]) { const sp = c.M(new THREE.ConeGeometry(2, 10, 5), c.armorDark); sp.position.set(s * 14, 20, -2); sp.rotation.set(-0.5, 0, -s * 1.0); m.torso.add(sp); }
        for (let i = 0; i < 3; i++) c.trailer(m.torso, 3 + i, 22 + i * 4, (i - 1) * 4.5, 14, -9.2, c.suit, 'cape');       // tattered strips under the cape
        for (const s of [-1, 1]) { const e = c.M(new THREE.BoxGeometry(3.6, 0.9, 0.8), glowMat('#fde047', 2.2, 1)); e.rotation.z = -s * 0.25; e.position.set(s * 3.4, 10.4, 8.6); m.head.add(e); }
        m.decor.emit = { rate: 10, move: 1.2, n: [1, 2], cols: ['#4c1d95', '#7c3aed', '#1e1b4b'], geo: 'sphere', size: [2, 4.5], life: [0.5, 1.0], up: 10, back: 18, spread: 12, y: [-16, 24], grav: 0, normal: true, alt: { cols: ['#c4b5fd'], size: [0.7, 1.3], every: 3 } };
    },
    terra(m, c) {
        m.halo.visible = false;
        for (let i = 0; i < 5; i++) {                                                 // a cluster of glowing crystals growing from the back
            const g = c.G(m.torso, (i - 2) * 3.4, 14, -9); g.rotation.set(-0.5 - (i % 2) * 0.25, 0, (i - 2) * 0.32);
            const cr = c.M(new THREE.OctahedronGeometry(3, 0), c.glow); cr.scale.set(0.8, 3.6 - Math.abs(i - 2) * 0.5, 0.8); cr.position.y = 7; g.add(cr);
        }
        for (const arm of [m.armR, m.armL]) for (let i = 0; i < 3; i++) {             // rubble orbiting the fists
            const r = c.M(new THREE.DodecahedronGeometry(1.9 + i * 0.4, 0), c.armorDark); const g = c.G(arm.wr, 0, -2, 0); r.position.set(7.5, 0, 0); g.add(r); g.rotation.y = i * 2.1; m.decor.spin.push({ g, ax: 'y', sp: 2.2 + i * 0.3 });
        }
        for (const s of [-1, 1]) { const k = c.M(new THREE.DodecahedronGeometry(3.2, 0), c.armor); k.position.set(s * 4.8, -2, 5.8); m.legR.kn.parent && (s > 0 ? m.legR.kn : m.legL.kn).add(k); }
        m.decor.emit = { rate: 5, move: 1.0, n: [1, 2], cols: ['#a8a29e', '#78716c', '#d6d3d1'], geo: 'rock', size: [1.2, 2.6], life: [0.6, 1.0], up: -4, back: 4, spread: 14, y: [-4, 22], grav: -60, normal: true };
    },
};

// ----------------------------------------------------------------------------------------------------------------- particles
const GEO = {
    sphere: () => new THREE.SphereGeometry(1, 8, 6), box: () => new THREE.BoxGeometry(1, 1, 1), streak: () => new THREE.BoxGeometry(1, 0.22, 0.22),
    bubble: () => new THREE.SphereGeometry(1, 10, 8), rock: () => new THREE.DodecahedronGeometry(1, 0),
};
const geoCache = {};
const geoOf = (k) => geoCache[k] || (geoCache[k] = GEO[k]());
const POOL = 40;

export function buildDecor(m, ctx) {
    m.decor = { flap: [], spin: [], flick: [], emit: null, parts: [], acc: 0, clock: 0 };
    const b = BUILD[m.f.char];
    if (b) b(m, ctx);
    const e = m.decor.emit; if (!e) return;
    const mats = {};
    const mat = (col, key) => mats[key + col] || (mats[key + col] = e.normal || e.geo === 'bubble'
        ? new THREE.MeshBasicMaterial({ color: new THREE.Color(col).multiplyScalar(e.geo === 'bubble' ? 1.2 : 1), transparent: true, opacity: e.geo === 'bubble' ? 0.5 : 0.85, depthWrite: false, toneMapped: false })
        : glowMat(col, 2.2, 1));
    e.mat = mat;
    for (let i = 0; i < POOL; i++) {
        const mesh = new THREE.Mesh(geoOf(e.geo), glowMat('#fff')); mesh.visible = false; mesh.renderOrder = 6; m.scene.add(mesh);
        m.decor.parts.push({ mesh, life: 0, max: 1, vx: 0, vy: 0, vz: 0, s: 1 });
    }
}

export function tickDecor(m, dt) {
    const D = m.decor; if (!D) return;
    const t = m.t, f = m.f;
    for (const w of D.flap) { const k = Math.sin(t * (w.fast || 3.2) + w.i * 0.7 + (w.s > 0 ? 0 : 0.4)); w.g.rotation.z = w.base + w.s * k * (w.amp || 0.12); }
    for (const s of D.spin) s.g.rotation[s.ax] += s.sp * dt;
    for (const fl of D.flick) { const k = 1 + Math.sin(t * 12 + fl.ph) * 0.14 + Math.sin(t * 23 + fl.ph * 2) * 0.07; fl.g.scale.set(1, k, 1); }
    const e = D.emit; if (!e) return;
    const spd = Math.hypot(f.vx || 0, f.vy || 0), face = f.facing || 1, base = m.root.position;
    if (m.root.visible && dt < 0.2) {
        D.acc += (e.rate + e.move * spd) * dt;
        let guard = 4;
        while (D.acc >= 1 && guard--) {
            D.acc -= 1; D.clock++;
            const n = Math.round(rnd(e.n[0], e.n[1]));
            for (let k = 0; k < n; k++) {
                const p = D.parts.find(q => q.life <= 0); if (!p) break;
                const alt = e.alt && D.clock % e.alt.every === 0;
                const cols = alt ? e.alt.cols : e.cols, sz = alt ? e.alt.size : e.size;
                p.mesh.material = e.mat(cols[(Math.random() * cols.length) | 0], alt ? 'a' : 'm');
                p.mesh.position.set(base.x + rnd(-e.spread, e.spread) * 0.5 - face * 4, base.y + rnd(e.y[0], e.y[1]) * (m.charScale || 1), rnd(-6, 6));
                p.max = p.life = rnd(e.life[0], e.life[1]); p.s = rnd(sz[0], sz[1]);
                const j = e.jitter || 0;
                p.vx = -face * e.back * rnd(0.4, 1.2) + rnd(-1, 1) * (e.spread + j * 0.2); p.vy = e.up * rnd(0.5, 1.3) + rnd(-1, 1) * 4 + (j ? rnd(-j, j) * 0.3 : 0); p.vz = rnd(-6, 6);
                p.mesh.rotation.set(rnd(0, 6), rnd(0, 6), rnd(0, 6)); if (e.geo === 'streak') p.mesh.rotation.set(0, 0, Math.atan2(p.vy, p.vx));
                p.mesh.visible = true;
            }
        }
    }
    for (const p of D.parts) {
        if (p.life <= 0) continue;
        p.life -= dt;
        if (p.life <= 0) { p.mesh.visible = false; continue; }
        const u = p.life / p.max;                                              // 1 -> 0
        p.vy += (e.grav || 0) * dt;
        p.mesh.position.x += p.vx * dt; p.mesh.position.y += p.vy * dt; p.mesh.position.z += p.vz * dt;
        const sc = p.s * (e.geo === 'bubble' ? 1.3 - u * 0.5 : Math.min(1, u * 1.6));
        if (e.geo === 'streak') p.mesh.scale.set(sc * 2.2, sc * 0.5, sc * 0.5); else p.mesh.scale.setScalar(Math.max(0.01, sc));
    }
}

export function disposeDecor(m) {
    const D = m.decor; if (!D) return;
    for (const p of D.parts) m.scene.remove(p.mesh);
}
