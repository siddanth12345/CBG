// The final-blow "air rings": three big 3D rings stacked one behind another between the attacker and the point of contact, hole facing the contact point
// (so side-on they read as a line, in perspective they are rings). They stretch slowly into long air bands and cycle orange -> yellow -> red -> blue during the impact frame.
// They live on their own transparent canvas above the black-and-white game canvas, so they keep their colours and only people watching the impact frame see them.
import * as THREE from 'three';
import { S, fighters } from '../gameCore.js';

const COLS = ['#fb923c', '#fde047', '#ef4444', '#3b82f6'].map(c => new THREE.Color(c));
const AX = new THREE.Vector3(0, 0, 1);

export class ImpactRings {
    constructor() {
        this.ready = false; this.on = false;
        this.tmp = new THREE.Color(); this.a = new THREE.Vector3(); this.d = new THREE.Vector3(); this.dir = new THREE.Vector3(); this.q = new THREE.Quaternion();
    }
    #init(mainRenderer) {
        const c = document.createElement('canvas');
        c.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;z-index:29;pointer-events:none;display:none;';
        document.body.appendChild(c);
        this.canvas = c;
        this.renderer = new THREE.WebGLRenderer({ canvas: c, alpha: true, antialias: true });
        this.renderer.setClearColor(0x000000, 0);
        this.scene = new THREE.Scene();
        this.rings = [];
        const geo = new THREE.TorusGeometry(1, 0.15, 16, 72);                       // unit ring: radius 1, fat tube (15 %), scaled per use
        for (let i = 0; i < 3; i++) {
            const mat = new THREE.MeshBasicMaterial({ color: COLS[0], transparent: true, opacity: 0, depthTest: false, depthWrite: false, side: THREE.DoubleSide });
            const m = new THREE.Mesh(geo, mat); m.visible = false; m.renderOrder = 10 + i; this.scene.add(m); this.rings.push(m);
        }
        const tri = new THREE.BufferGeometry(); tri.setAttribute('position', new THREE.BufferAttribute(new Float32Array([0.5, 0, 0, -0.5, 0.5, 0, -0.5, -0.5, 0]), 3));   // a sharp needle: point at +x, base at -x
        this.sparks = []; for (let i = 0; i < 44; i++) { const m = new THREE.Mesh(tri, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthTest: false, depthWrite: false, side: THREE.DoubleSide })); m.visible = false; m.renderOrder = 12; this.scene.add(m); this.sparks.push({ m, a: 0, v: 0, L: 0, w: 0, d: 0 }); }
        this._sparkOn = false;
        this.trail = []; this.tGeo = new THREE.TorusGeometry(1, 0.05, 10, 64); this.tPool = [];
        this.ready = true;
    }
    /** the wide white air rings a final-blow victim leaves behind while flying: each is born big and shrinks and fades as it ages (visible to everyone) */
    #trail(models, now, paused) {
        let any = false;
        for (const m of models) {
            const f = m.f; if (!f || !(f.ffT > 0) || paused) continue;
            if ((m._rt = (m._rt || 0) + 1) % 3) continue;
            const v = this.d.set(f.vx || 0, -(f.vy || 0), 0);
            if (v.lengthSq() < 1) continue;
            const mesh = this.tPool.pop() || new THREE.Mesh(this.tGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthTest: false, depthWrite: false, side: THREE.DoubleSide }));
            mesh.position.copy(m.root.position); mesh.position.y += (f.height || 70) * 0.5;
            mesh.quaternion.setFromUnitVectors(AX, v.normalize());
            mesh.userData = { t0: now, R: (f.height || 70) * 1.1 }; mesh.renderOrder = 5;
            this.scene.add(mesh); this.trail.push(mesh);
        }
        for (let i = this.trail.length - 1; i >= 0; i--) {
            const r = this.trail[i], a = (now - r.userData.t0) / 700;
            if (a >= 1) { this.scene.remove(r); this.tPool.push(r); this.trail.splice(i, 1); continue; }
            const k = r.userData.R * (1 - 0.85 * a);
            r.scale.set(k, k, k * 0.6);
            r.material.opacity = 0.55 * (1 - a) * (1 - a * 0.3);
            any = true;
        }
        return any;
    }
    /** Called after the main render each frame. `models` = the fighter models (render positions), `camera` = the game camera. */
    render(mainRenderer, camera, models) {
        let on = false, e = 0;
        if (S.replay) { on = S.kcImpT > 0; e = 1.2 - S.kcImpT; }
        else if (S.gameState === 'playing' && S.kcVis > 0 && S.kcFull) { on = true; e = (S.kcDur || 1.2) - S.kcT; }
        const att = on ? fighters[S.kcAtt] : null, def = on ? fighters[S.kcDef] : null;
        const ma = att && models.find(m => m.f === att), md = def && models.find(m => m.f === def);
        on = on && !!ma && !!md && e >= 0 && e < 1.25;
        const wantTrail = this.trail && this.trail.length > 0 || models.some(m => m.f && m.f.ffT > 0);
        if (!on && !wantTrail) { if (this.on) { this.on = false; if (this.canvas) this.canvas.style.display = 'none'; } return; }
        if (!this.ready) this.#init(mainRenderer);
        if (!this.on) { this.on = true; this.canvas.style.display = 'block'; }
        const size = mainRenderer.getSize(new THREE.Vector2()), pr = mainRenderer.getPixelRatio();
        if (this._w !== size.x || this._h !== size.y || this._pr !== pr) { this._w = size.x; this._h = size.y; this._pr = pr; this.renderer.setPixelRatio(pr); this.renderer.setSize(size.x, size.y, false); }
        for (const m of this.rings) m.visible = false;
        if (!on) { this._sparkOn = false; for (const q of this.sparks) q.m.visible = false; }
        const aliveT = this.#trail(models, performance.now(), S.kcVis > 0);
        if (!on) { if (!aliveT && !models.some(m => m.f && m.f.ffT > 0)) { this.on = false; this.canvas.style.display = 'none'; } else this.renderer.render(this.scene, camera); return; }
        // axis: attacker -> contact point (the victim)
        this.a.copy(ma.root.position); this.d.copy(md.root.position);
        { const kx = S.kcVx || 0, ky = -(S.kcVy || 0);                                  // the rings sit on the knockback line (the same line as the white streak), so they line up with it
          if (kx * kx + ky * ky > 1) this.dir.set(kx, ky, 0); else { this.dir.subVectors(this.d, this.a); if (this.dir.lengthSq() < 4) this.dir.set(att.facing || 1, 0.2, 0); }
          this.dir.normalize(); }
        this.q.setFromUnitVectors(AX, this.dir);
        const H = (def.height || 70), R = H * 1.25;
        const t = e / 1.2;
        for (let i = 0; i < 3; i++) {
            const m = this.rings[i];
            const ph = Math.min(1, Math.max(0, (e - 0.05 - i * 0.07) / 1.05));      // each ring starts a little after the one in front of it
            if (ph <= 0 || ph >= 1) { m.visible = false; continue; }
            m.visible = true;
            m.position.copy(this.d).addScaledVector(this.dir, -(26 + i * 52));       // one behind another, on the way from the attacker to the contact
            m.quaternion.copy(this.q);
            const sm = (x) => { x = Math.min(1, Math.max(0, x)); return x * x * (3 - 2 * x); };
            const rad = ph < 0.4 ? 1 + 0.1 * (ph / 0.4) : 1.1 - 0.72 * sm((ph - 0.4) / 0.6);     // a fat ring first, then it draws in ...
            const len = 0.55 + 1.9 * sm(ph);                                                       // ... while it stretches along its axis: it ends as a stubby thick nub of air
            m.scale.set(R * rad, R * rad, R * len * 0.6);
            const cp = Math.min(0.9999, ph) * (COLS.length - 1), ci = Math.floor(cp);
            this.tmp.copy(COLS[ci]).lerp(COLS[ci + 1], cp - ci);
            m.material.color.copy(this.tmp);
            m.material.opacity = 0.9 * Math.min(1, ph / 0.1) * (1 - Math.pow(ph, 3));
        }
        // sharp line sparks: thin needles burst out of the contact point, mostly the way the victim flies, some in every direction
        if (!this._sparkOn) {
            this._sparkOn = true; const base = Math.atan2(this.dir.y, this.dir.x);
            this.sparks.forEach((q, i) => { const fwd = i % 5 < 3; q.a = fwd ? base + (Math.random() - 0.5) * 1.1 : Math.random() * Math.PI * 2; q.v = (fwd ? 420 : 260) * (0.5 + Math.random()); q.L = H * (fwd ? 2.6 : 1.7) * (0.5 + Math.random() * 0.7); q.w = 2.2 + Math.random() * 3; q.d = Math.random() * 0.12; q.hot = Math.random() < 0.5; });
        }
        for (const q of this.sparks) {
            const ph = (e - q.d) / 0.5;
            if (ph <= 0 || ph >= 1) { q.m.visible = false; continue; }
            const out = q.v * (1 - Math.pow(1 - ph, 3)) * 0.9 + H * 0.3, L = q.L * (1 - ph * 0.7);
            q.m.visible = true; q.m.position.set(this.d.x + Math.cos(q.a) * out, this.d.y + Math.sin(q.a) * out, this.d.z + 5);
            q.m.rotation.set(0, 0, q.a); q.m.scale.set(L, q.w * (1 - ph * 0.6), 1);
            q.m.material.color.set(q.hot ? '#fde047' : '#ffffff'); q.m.material.opacity = 1 - ph * ph;
        }
        this.renderer.render(this.scene, camera);
    }
}
