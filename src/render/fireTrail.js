// Ember's Fireball Roll flames: one soft, additive particle cloud (a single draw call) that reads as a continuous fire.
//   * the flames rise like a real fire while the ball sits still,
//   * the moment the ball moves they are swept into a long trail behind it. The trail direction is a smoothed
//     "wind" (the ball's velocity, low-passed), and every flame already in the air keeps steering toward the
//     current wind, so a change of direction bends the whole trail round smoothly instead of snapping.
//   * colours blend continuously with the charge: orange magma wisps -> white fire -> smooth blue fire.
import * as THREE from 'three';

const MAX = 900;
const VERT = `
attribute float aSize; attribute float aAlpha; attribute vec3 aColor;
varying float vA; varying vec3 vC; uniform float uK;
void main(){ vA = aAlpha; vC = aColor; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_Position = projectionMatrix * mv; gl_PointSize = max(1.0, aSize * uK / max(1.0, -mv.z)); }`;
const FRAG = `
varying float vA; varying vec3 vC;
void main(){ vec2 d = gl_PointCoord - 0.5; float r = length(d) * 2.0; if (r > 1.0) discard;
  float a = pow(1.0 - r, 1.6); gl_FragColor = vec4(vC * a * vA, a * vA); }`;

const lerp = (a, b, t) => a + (b - a) * t;
const sm = (t) => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };
const C_RED = new THREE.Color('#ff5a14'), C_ORG = new THREE.Color('#ffb347'), C_WHT = new THREE.Color('#ffffff'), C_CREAM = new THREE.Color('#fff1c9'),
    C_BLU = new THREE.Color('#2f8cff'), C_ICE = new THREE.Color('#8fd0ff'), C_DEEP = new THREE.Color('#1d4ed8'), C_YEL = new THREE.Color('#ffd166');

export class FireTrail {
    constructor(scene) {
        this.p = [];                                   // live particles
        this.state = new Map();                        // per-fighter smoothed wind + emit accumulator
        this.K = 900;                                  // pixel scale (set by the view on resize)
        const geo = new THREE.BufferGeometry();
        this.pos = new Float32Array(MAX * 3); this.col = new Float32Array(MAX * 3); this.siz = new Float32Array(MAX); this.alp = new Float32Array(MAX);
        geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
        geo.setAttribute('aColor', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
        geo.setAttribute('aSize', new THREE.BufferAttribute(this.siz, 1).setUsage(THREE.DynamicDrawUsage));
        geo.setAttribute('aAlpha', new THREE.BufferAttribute(this.alp, 1).setUsage(THREE.DynamicDrawUsage));
        geo.setDrawRange(0, 0);
        this.mat = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, uniforms: { uK: { value: this.K } }, transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending, toneMapped: false });
        this.pts = new THREE.Points(geo, this.mat); this.pts.frustumCulled = false; this.pts.renderOrder = 7;
        scene.add(this.pts);
    }

    /** call every frame for a rolling / charging Ember.  pos = ball centre (render units), r = ball radius, c = charge 0..1, vel = ball velocity in render units per second */
    feed(id, pos, r, c, vx, vy, dt, charging) {
        let s = this.state.get(id); if (!s) { s = { wx: 0, wy: 0, acc: 0, last: 0 }; this.state.set(id, s); }
        s.last = performance.now();
        const k = 1 - Math.exp(-dt * 7);                 // low-pass the wind so direction changes bend the trail smoothly
        s.wx += (vx - s.wx) * k; s.wy += (vy - s.wy) * k;
        const white = sm((c - 0.3) / 0.4), blue = sm((c - 0.7) / 0.28);
        const fire = Math.max(0.18, white);              // magma gives off a few wisps, the white and blue phases burn properly
        const mv = sm(Math.hypot(s.wx, s.wy) / 260);
        const rate = (40 + 105 * white + 45 * blue) * (charging ? 0.9 : 1.25) * (1 + 1.6 * mv);       // a travelling ball sheds flame much faster, which reads as one long trail
        s.acc += rate * dt;
        while (s.acc >= 1 && this.p.length < MAX) {
            s.acc -= 1;
            const a = Math.random() * Math.PI * 2, rr = r * (0.2 + Math.random() * 0.75);
            const born = blue > 0.5 ? 2 : (white > 0.35 ? 1 : 0);
            this.p.push({
                x: pos.x + Math.cos(a) * rr, y: pos.y + Math.sin(a) * rr * 0.9, z: pos.z + (Math.random() - 0.5) * r * 0.6,
                vx: s.wx * 0.5 + (Math.random() - 0.5) * 40, vy: s.wy * 0.5 + 60 + Math.random() * 60,
                age: 0, life: (0.8 + Math.random() * 0.6) * (born === 2 ? 1.3 : 1), size: r * (0.9 + Math.random() * 0.9) * (0.7 + 0.7 * fire) * (1 - 0.3 * mv),
                born, seed: Math.random() * 100, id, a: 0.55 + 0.45 * fire,
            });
        }
    }

    update(dt) {
        const now = performance.now();
        for (const [id, s] of this.state) { if (now - s.last > 400) this.state.delete(id); }
        let n = 0;
        for (let i = this.p.length - 1; i >= 0; i--) {
            const q = this.p[i]; q.age += dt;
            if (q.age >= q.life) { this.p[i] = this.p[this.p.length - 1]; this.p.pop(); continue; }
        }
        for (const q of this.p) {
            const s = this.state.get(q.id) || { wx: 0, wy: 0 };
            const u = q.age / q.life, sp = Math.hypot(s.wx, s.wy);
            const move = sm(sp / 260);                    // 0 = sitting still (flames rise), 1 = travelling (flames trail behind)
            const rise = (230 + 120 * (q.born === 2 ? 0.5 : 1)) * (1 - 0.85 * move);
            // target velocity: carried backwards by the wind, plus buoyancy, plus a slow smooth flicker
            const tx = -s.wx * (0.35 + 0.3 * u) + Math.sin(q.seed + q.age * 5) * 26 * (q.born === 2 ? 0.4 : 1);
            const ty = -s.wy * (0.35 + 0.3 * u) + rise + Math.cos(q.seed * 1.3 + q.age * 4) * 20 * (q.born === 2 ? 0.4 : 1);
            const k = 1 - Math.exp(-dt * (4.5 + 3 * move));
            q.vx += (tx - q.vx) * k; q.vy += (ty - q.vy) * k;
            q.x += q.vx * dt; q.y += q.vy * dt;
            if (n >= MAX) break;
            // colour: hot core at birth cooling toward the tip; the phase it was born in picks the palette
            const c = this.tmp || (this.tmp = new THREE.Color());
            if (q.born === 0) c.copy(C_ORG).lerp(C_RED, sm(u * 1.2));
            else if (q.born === 1) { c.copy(C_WHT).lerp(C_YEL, sm(u * 1.6)).lerp(C_ORG, sm((u - 0.3) / 0.6)); }
            else { c.copy(C_ICE).lerp(C_BLU, sm(u * 1.5)).lerp(C_DEEP, sm((u - 0.5) / 0.5) * 0.7); }
            const fade = sm(u * 7) * (1 - sm((u - 0.35) / 0.65));         // soft in, long soft out: no popping
            const grow = q.born === 2 ? 1 + u * 0.3 : (1 - 0.55 * sm(u));  // blue billows slightly, other flames shrink toward the tip
            const o = n * 3;
            this.pos[o] = q.x; this.pos[o + 1] = q.y; this.pos[o + 2] = q.z;
            const g = q.born === 2 ? 0.95 : (q.born === 1 ? 1.15 : 1.3);
            this.col[o] = c.r * g; this.col[o + 1] = c.g * g; this.col[o + 2] = c.b * g;
            this.siz[n] = q.size * grow * 2.4; this.alp[n] = fade * q.a * (q.born === 2 ? 0.42 : 0.4);
            n++;
        }
        const g = this.pts.geometry;
        g.setDrawRange(0, n);
        for (const k of ['position', 'aColor', 'aSize', 'aAlpha']) g.attributes[k].needsUpdate = true;
        this.mat.uniforms.uK.value = this.K;
    }
}
