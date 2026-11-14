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
            const mat = new THREE.MeshBasicMaterial({ color: COLS[0], transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthTest: false, depthWrite: false, side: THREE.DoubleSide });
            const m = new THREE.Mesh(geo, mat); m.visible = false; m.renderOrder = 10 + i; this.scene.add(m); this.rings.push(m);
        }
        this.ready = true;
    }
    /** Called after the main render each frame. `models` = the fighter models (render positions), `camera` = the game camera. */
    render(mainRenderer, camera, models) {
        let on = false, e = 0;
        if (S.replay) { on = S.kcImpT > 0; e = 1.2 - S.kcImpT; }
        else if (S.gameState === 'playing' && S.kcPause > 0 && S.kcFull) { on = true; e = (S.kcDur || 1.2) - S.kcT; }
        const att = on ? fighters[S.kcAtt] : null, def = on ? fighters[S.kcDef] : null;
        const ma = att && models.find(m => m.f === att), md = def && models.find(m => m.f === def);
        on = on && !!ma && !!md && e >= 0 && e < 1.25;
        if (!on) { if (this.on) { this.on = false; if (this.canvas) this.canvas.style.display = 'none'; } return; }
        if (!this.ready) this.#init(mainRenderer);
        if (!this.on) { this.on = true; this.canvas.style.display = 'block'; }
        const size = mainRenderer.getSize(new THREE.Vector2()), pr = mainRenderer.getPixelRatio();
        if (this._w !== size.x || this._h !== size.y || this._pr !== pr) { this._w = size.x; this._h = size.y; this._pr = pr; this.renderer.setPixelRatio(pr); this.renderer.setSize(size.x, size.y, false); }
        // axis: attacker -> contact point (the victim)
        this.a.copy(ma.root.position); this.d.copy(md.root.position);
        this.dir.subVectors(this.d, this.a); if (this.dir.lengthSq() < 4) this.dir.set(att.facing || 1, 0.2, 0); this.dir.normalize();
        this.q.setFromUnitVectors(AX, this.dir);
        const H = (def.height || 70), R = H * 1.25;                                // diameter = 2.5 x the player's height
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
        this.renderer.render(this.scene, camera);
    }
}
