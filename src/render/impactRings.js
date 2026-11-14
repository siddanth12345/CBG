// The final-blow "air rings": three big 3D rings (diameter 2.5x the player's height) stacked one behind another IN FRONT of the victim, along the way they are about to be sent flying,
// hole facing them. They rush toward the victim while stretching, cycling orange -> yellow -> red -> blue, and at 0.6 s they merge into ONE smooth glowing nub (a gradient bullet of air,
// yellow core melting into pink) that punches in and fades out by 2 s. They live on their own transparent canvas above the dark game canvas, so only people watching the impact frame see them.
import * as THREE from 'three';
import { S, fighters } from '../gameCore.js';

const COLS = ['#fb923c', '#fde047', '#ef4444', '#3b82f6'].map(c => new THREE.Color(c));
const AX = new THREE.Vector3(0, 0, 1), UP = new THREE.Vector3(0, 1, 0);
const sm = (x) => { x = Math.min(1, Math.max(0, x)); return x * x * (3 - 2 * x); };

const NUB_VS = `varying vec3 vN; varying vec3 vV; varying float vY;
void main(){ vY = position.y; vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`;
const NUB_FS = `uniform float uOpacity; varying vec3 vN; varying vec3 vV; varying float vY;
void main(){
    float f = clamp(dot(normalize(vN), normalize(vV)), 0.0, 1.0);
    vec3 pink = vec3(0.98, 0.78, 0.96), yel = vec3(1.0, 0.93, 0.35), org = vec3(1.0, 0.55, 0.16);
    float t = clamp(vY, 0.0, 1.0);                              // 0 = tail, 1 = tip
    vec3 c = mix(pink, yel, smoothstep(0.0, 0.55, t));
    c = mix(c, org, smoothstep(0.55, 1.0, t) * (1.0 - f) * 1.4);  // the tip glows orange at its rim
    c = mix(c, vec3(1.0, 0.99, 0.85), pow(f, 3.0) * 0.8);        // hot core
    float a = (0.2 + 0.8 * pow(f, 1.1)) * uOpacity;
    gl_FragColor = vec4(c * 1.15, a);
}`;

function nubGeometry() {
    const pts = [];
    for (let i = 0; i <= 40; i++) { const t = i / 40; pts.push(new THREE.Vector2(Math.sqrt(Math.max(0, 1 - t * t)) * sm(t / 0.3) * (1 - 0.25 * t), t)); }   // a bullet: round tip, soft tail
    return new THREE.LatheGeometry(pts, 48);
}

export class ImpactRings {
    constructor() {
        this.ready = false; this.on = false;
        this.tmp = new THREE.Color(); this.a = new THREE.Vector3(); this.d = new THREE.Vector3(); this.dir = new THREE.Vector3(); this.q = new THREE.Quaternion(); this.q2 = new THREE.Quaternion(); this.nd = new THREE.Vector3();
    }
    #init() {
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
        this.nubMat = new THREE.ShaderMaterial({ vertexShader: NUB_VS, fragmentShader: NUB_FS, uniforms: { uOpacity: { value: 0 } }, transparent: true, blending: THREE.AdditiveBlending, depthTest: false, depthWrite: false, side: THREE.DoubleSide });
        this.nub = new THREE.Mesh(nubGeometry(), this.nubMat); this.nub.visible = false; this.nub.renderOrder = 20; this.scene.add(this.nub);
        this.ready = true;
    }
    /** Called after the main render each frame. `models` = the fighter models (render positions), `camera` = the game camera. */
    render(mainRenderer, camera, models) {
        const D = S.kcDur || 2;
        let on = false, e = 0;
        if (S.replay) { on = S.kcImpT > 0; e = D - S.kcImpT; }
        else if (S.gameState === 'playing' && S.kcPause > 0 && S.kcFull) { on = true; e = D - S.kcT; }
        const att = on ? fighters[S.kcAtt] : null, def = on ? fighters[S.kcDef] : null;
        const ma = att && models.find(m => m.f === att), md = def && models.find(m => m.f === def);
        on = on && !!def && !!md && e >= 0 && e < D + 0.05;
        if (!on) { if (this.on) { this.on = false; if (this.canvas) this.canvas.style.display = 'none'; } return; }
        if (!this.ready) this.#init();
        if (!this.on) { this.on = true; this.canvas.style.display = 'block'; }
        const size = mainRenderer.getSize(new THREE.Vector2()), pr = mainRenderer.getPixelRatio();
        if (this._w !== size.x || this._h !== size.y || this._pr !== pr) { this._w = size.x; this._h = size.y; this._pr = pr; this.renderer.setPixelRatio(pr); this.renderer.setSize(size.x, size.y, false); }
        // axis: the way the victim is about to fly (their velocity after the knockback); the rings sit in front of them along it
        const vx = S.kcVx || 0, vy = S.kcVy || 0;
        this.d.copy(md.root.position);
        if (Math.hypot(vx, vy) > 1) this.dir.set(vx, -vy, 0);
        else if (ma) this.dir.subVectors(this.d, ma.root.position); else this.dir.set(1, 0.3, 0);
        if (this.dir.lengthSq() < 1e-4) this.dir.set(1, 0.3, 0);
        this.dir.z = 0; this.dir.normalize();
        this.q.setFromUnitVectors(AX, this.dir);
        const H = (def.height || 70), R = H * 1.25;                                // ring diameter = 2.5 x the player's height
        const T = 0.6;                                                             // they have become one nub by 0.6 s
        const rp = Math.min(1, e / T);
        for (let i = 0; i < 3; i++) {
            const m = this.rings[i];
            const ph = Math.min(1, Math.max(0, (e - 0.03 - i * 0.04) / (T - 0.03 - i * 0.04)));
            if (e < 0.03 || e > T + 0.02) { m.visible = false; continue; }
            m.visible = true;
            const start = (3.6 + i * 0.75) * R, end = 0.8 * R;                      // one behind another in front of the victim, rushing in
            m.position.copy(this.d).addScaledVector(this.dir, end + (start - end) * (1 - sm(ph)) );
            m.quaternion.copy(this.q);
            const rad = 1 - 0.55 * sm(ph), len = 0.5 + 1.9 * sm(ph);                // thinner and longer as they stretch
            m.scale.set(R * rad, R * rad, R * len * 0.6);
            const cp = Math.min(0.9999, rp) * (COLS.length - 1), ci = Math.floor(cp);
            this.tmp.copy(COLS[ci]).lerp(COLS[ci + 1], cp - ci);
            m.material.color.copy(this.tmp);
            m.material.opacity = 0.9 * Math.min(1, (e - 0.03) / 0.08) * (1 - sm((e - (T - 0.12)) / 0.14));
        }
        // the nub: one full smooth part from 0.6 s, driving into the victim, gone by 2 s
        const nu = (e - (T - 0.08)) / (D - (T - 0.08));
        if (nu <= 0 || nu >= 1) this.nub.visible = false;
        else {
            this.nub.visible = true;
            this.q2.setFromUnitVectors(UP, this.nd.copy(this.dir).negate());      // tip toward the victim
            this.nub.quaternion.copy(this.q2);
            const L = R * 1.9, W = R * 0.5;
            const grow = sm((e - (T - 0.08)) / 0.16);
            this.nub.scale.set(W * (0.4 + 0.6 * grow), L * (0.5 + 0.5 * grow), W * (0.4 + 0.6 * grow));
            const approach = 1 - sm((e - T) / 0.55);                                // keeps pushing in toward them, then rides along
            this.nub.position.copy(this.d).addScaledVector(this.dir, (0.25 * R + 1.1 * R * approach) + L * 0.5);
            this.nubMat.uniforms.uOpacity.value = Math.min(1, grow * 1.2) * (1 - sm((nu - 0.7) / 0.3));
        }
        this.renderer.render(this.scene, camera);
    }
}
