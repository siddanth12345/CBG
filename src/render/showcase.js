// The start menu's cinematic: the real game runs two bots on Horizon / Frontier behind the menu while a director
// circles the camera around the stage, changes shots, and every so often CUTS to another map with a procedural
// transition (iris, slash, shutters, glitch, warp). Silent, no HUD, no input.
import * as THREE from 'three';
import { S, STAGE, WORLD, fighters, startDemo, MAP_IDS, audio } from 'cbg/core';
import { wx, wy } from './space.js';
import { CHARS } from '../characters.js';

const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const ease = (t) => t * t * (3 - 2 * t);
const reduced = () => { try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } };

const MAP_INFO = {
    frontier: { title: 'FRONTIER', sub: 'Neon night arena', theme: 'frontier' }, big: { title: 'FRONTIER', sub: 'The big arena', theme: 'frontier' },
    horizon: { title: 'HORIZON', sub: 'Morning valley', theme: 'horizon' }, bighorizon: { title: 'HORIZON', sub: 'The big valley', theme: 'horizon' },
};
const COLORS = { horizon: { fill: '#f8ecd2', edge: '#ffffff', glow: '#ffd98a' }, frontier: { fill: '#06101f', edge: '#22d3ee', glow: '#38bdf8' } };

// ---- shots: distances are in "small arena" units and scale with the stage width
const SHOTS = [
    { name: 'orbit', R: [1900, 2300], el: [8, 14], az: [-58, 58], spin: [5, 8] },
    { name: 'hero', R: [950, 1250], el: [2, 6], az: [-32, 32], spin: [3, 5] },
    { name: 'high', R: [2100, 2500], el: [28, 38], az: [-45, 45], spin: [4, 6] },
    { name: 'dolly', R: [1000, 2300], el: [5, 12], az: [-40, 40], spin: [3, 5], dolly: true },
    { name: 'low', R: [1500, 1800], el: [-1, 2], az: [-70, 70], spin: [5, 8] },
];

export class Showcase {
    constructor(view) {
        this.view = view;
        this.t = 0; this.cutT = rand(16, 22); this.shotT = 0; this.shotLen = 7;
        this.tgt = new THREE.Vector3(); this.ready = false;
        this.cur = { R: 2000, el: 10, az: 0 }; this.goal = { R: 2000, el: 10, az: 0 }; this.azDir = 1; this.spin = 6; this.shot = SHOTS[0];
        this.cut = null; this.kos = 0; this.lastDeaths = 0; this.theme = null; this.info = null;
        this.#dom();
    }

    #dom() {
        const root = document.getElementById('luminary-root') || document.body;
        const cv = this.cv = document.createElement('canvas');
        cv.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;z-index:45;pointer-events:none;display:none';
        root.appendChild(cv);
        const cap = this.cap = document.createElement('div');
        cap.className = 'cbg-cap';
        root.appendChild(cap);
        this.vig = document.createElement('div'); this.vig.className = 'cbg-vig'; root.appendChild(this.vig);
    }

    /** the menu is on screen and the demo is running */
    get active() { return !!S.demo && S.gameState === 'start'; }

    show(on) {
        this.cap.style.display = on ? '' : 'none';
        this.vig.style.display = on ? '' : 'none';
        if (!on) { this.cv.style.display = 'none'; this.cut = null; }
    }

    #newShot(snap) {
        const pool = SHOTS.filter(s => s !== this.shot);
        const sh = this.shot = pool[Math.floor(Math.random() * pool.length)];
        const S0 = STAGE.width / 1520;
        const g = this.goal;
        g.R = rand(sh.R[0], sh.R[1]) * S0; g.el = rand(sh.el[0], sh.el[1]);
        this.spin = rand(sh.spin[0], sh.spin[1]); this.azDir = Math.random() < 0.5 ? -1 : 1;
        g.az = this.azDir > 0 ? sh.az[0] * rand(0.6, 1) : sh.az[1] * rand(0.6, 1);     // start on one side, drift to the other
        this.shotT = 0; this.shotLen = rand(6, 9.5);
        if (sh.dolly) { this.cur.R = g.R * 0.45; g.R = rand(sh.R[1] * 0.9, sh.R[1]) * S0; }
        if (snap) { this.cur.R = g.R; this.cur.el = g.el; this.cur.az = g.az; }
    }

    /** a fresh map + fighters (called under the cover of a transition, and once at the start) */
    #spawn(map) {
        const r = startDemo(map);
        if (!r) return;
        this.map = r.map; this.info = MAP_INFO[r.map]; this.theme = this.info.theme;
        this.kos = 0; this.cutT = rand(17, 26); this.t = 0; this.lastDeaths = fighters[2].deaths + fighters[3].deaths;
        this.#newShot(true);
        this.ready = false;                               // re-aim at the fighters before the first frame
        const nm = (id) => (CHARS[id] && CHARS[id].name) || id;
        const a = fighters[2], b = fighters[3];
        this.caption = { title: this.info.title, sub: this.info.sub, vs: `${nm(a.char)}  vs  ${nm(b.char)}`.toUpperCase() };
    }

    /** the menu cinematic only runs while the menu is actually showing; any button that takes the menu away (play, tutorial, a pop-up) stops it, so nothing is simulated or drawn for it. Local only: never networked. */
    guard() {
        if (S.gameState !== 'start') return;
        const ss = document.getElementById('startScreen');
        const covered = !ss || ss.classList.contains('hidden') || !!document.querySelector('.lm-modal:not(.lm-hidden)');
        if (S.demo && covered) this.stop();
        else if (!S.demo && !covered && !S.online) this.start();
    }
    stop() {
        if (!S.demo) return;
        S.demo = false; audio.muted = false; this.cut = null; this.info = null;
        for (const f of [fighters[2], fighters[3]]) if (f) f.active = false;
        this.cv.style.display = 'none'; this.cap.style.opacity = '0';
    }
    start() { this.#spawn('rand'); this.#caption(); }

    #caption() {
        if (!this.caption) return;
        const c = this.caption, cap = this.cap;
        cap.classList.remove('on'); void cap.offsetWidth;
        cap.innerHTML = `<small>NOW SHOWING</small><b>${c.title}</b><span>${c.sub}</span><em>${c.vs}</em>`;
        cap.dataset.theme = this.theme;
        cap.classList.add('on');
    }

    /** pick the next map: usually the other look, sometimes the other size */
    #nextMap() {
        const wantTheme = Math.random() < 0.85 ? (this.theme === 'horizon' ? 'frontier' : 'horizon') : this.theme;
        const big = Math.random() < 0.4;
        return wantTheme === 'horizon' ? (big ? 'bighorizon' : 'horizon') : (big ? 'big' : 'frontier');
    }

    #startCut() {
        const styles = reduced() ? ['iris'] : ['iris', 'slash', 'shutter', 'glitch', 'warp'];
        const next = this.#nextMap();
        this.cut = { p: 0, style: styles[Math.floor(Math.random() * styles.length)], next, swapped: false, dur: reduced() ? 0.9 : 1.15, to: MAP_INFO[next].theme, seed: Math.random() * 1000, slices: Array.from({ length: 14 }, () => [Math.random(), Math.random() * 0.14 + 0.02, Math.random() * 2 - 1]) };
        this.cv.style.display = '';
    }

    /** advance the director and place the view's camera */
    place(dt) {
        const v = this.view;
        dt = Math.min(dt, 0.05);
        if (!this.info) this.start();
        this.t += dt; this.shotT += dt;

        // ---- transitions
        if (this.cut) {
            const c = this.cut; c.p += dt / c.dur;
            if (!c.swapped && c.p >= 0.5) { c.swapped = true; this.#spawn(c.next); this.#caption(); }
            if (c.p >= 1) { this.cut = null; this.cv.style.display = 'none'; }
            else this.#drawCut(c);
        } else {
            const dead = fighters[2].deaths + fighters[3].deaths;
            if (dead !== this.lastDeaths) { this.kos += dead - this.lastDeaths; this.lastDeaths = dead; }
            if (this.t > this.cutT || (this.kos >= 3 && this.t > 8)) this.#startCut();
        }

        // ---- where the action is
        const live = [fighters[2], fighters[3]].filter(f => f.active && !f.out);
        const mx = live.length ? live.reduce((s, f) => s + wx(f.x), 0) / live.length : wx(STAGE.x + STAGE.width / 2);
        const my = live.length ? live.reduce((s, f) => s + wy(f.y), 0) / live.length : wy(STAGE.y);
        const spread = live.length > 1 ? Math.abs(wx(live[0].x) - wx(live[1].x)) : 0;
        const S0 = STAGE.width / 1520;
        const lim = (STAGE.width * 0.5);
        const gx = clamp(mx, wx(STAGE.x + STAGE.width / 2) - lim, wx(STAGE.x + STAGE.width / 2) + lim), gy = clamp(my, wy(STAGE.y) - 220 * S0, wy(STAGE.y) + 520 * S0);
        if (!this.ready) { this.tgt.set(gx, gy, 0); this.ready = true; }
        const kt = 1 - Math.exp(-dt * 2.4);
        this.tgt.x += (gx - this.tgt.x) * kt; this.tgt.y += (gy - this.tgt.y) * kt;

        // ---- the shot: azimuth drifts continuously (the "circling"), distance / elevation ease toward the shot's targets
        const sh = this.shot, g = this.goal, cu = this.cur;
        g.az += this.azDir * this.spin * dt;
        if (g.az > sh.az[1]) { g.az = sh.az[1]; this.azDir = -1; } else if (g.az < sh.az[0]) { g.az = sh.az[0]; this.azDir = 1; }
        if (this.shotT > this.shotLen && !this.cut) this.#newShot(false);
        const need = (700 * S0 + spread * 1.15);
        const kc = 1 - Math.exp(-dt * 1.3);
        cu.R += (Math.max(g.R, need) - cu.R) * kc; cu.el += (g.el - cu.el) * kc; cu.az += (g.az - cu.az) * (1 - Math.exp(-dt * 2));
        const az = cu.az * Math.PI / 180, el = cu.el * Math.PI / 180;
        const sway = reduced() ? 0 : 1;
        const R = cu.R, sx = Math.sin(this.t * 0.9) * 6 * sway, sy = Math.sin(this.t * 1.3 + 1) * 4 * sway;
        v.camera.position.set(this.tgt.x + Math.sin(az) * Math.cos(el) * R + sx, this.tgt.y + 40 * S0 + Math.sin(el) * R + sy, Math.cos(az) * Math.cos(el) * R);
        v.camera.lookAt(this.tgt.x, this.tgt.y + 40 * S0, 0);
        v.camera.updateMatrixWorld(true);
        v.zoomDist = R;

        // the fighters sit in the right-hand part of the screen: shift the picture (landscape) or lift it (portrait)
        const w = v.w, h = v.h;
        if (w > h * 1.05) v.camera.setViewOffset(w, h, -w * 0.17, 0, w, h);
        else v.camera.setViewOffset(w, h, 0, h * 0.2, w, h);
        v.camera.updateProjectionMatrix();
    }

    release() { try { this.view.camera.clearViewOffset(); this.view.camera.updateProjectionMatrix(); } catch (e) { /* ok */ } }

    // ------------------------------------------------------------------ transitions (procedural, drawn on a 2D canvas)
    #drawCut(c) {
        const cv = this.cv, w = cv.clientWidth || window.innerWidth, h = cv.clientHeight || window.innerHeight;
        const dpr = 1;
        if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
        const g = cv.getContext('2d'); g.clearRect(0, 0, cv.width, cv.height);
        const col = COLORS[c.to], p = clamp(c.p, 0, 1), e = p < 0.5 ? ease(p * 2) : ease((1 - p) * 2);     // e: 0 -> 1 (covered) -> 0
        const W = cv.width, H = cv.height, cx = W * 0.7, cy = H * 0.5;
        g.save();
        if (c.style === 'iris') {
            g.fillStyle = col.fill; g.fillRect(0, 0, W, H);
            const maxR = Math.hypot(Math.max(cx, W - cx), Math.max(cy, H - cy)) * 1.05, r = maxR * (1 - e);
            g.globalCompositeOperation = 'destination-out'; g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.fill();
            g.globalCompositeOperation = 'source-over';
            g.lineWidth = 6 + 14 * (1 - e); g.strokeStyle = col.edge; g.shadowColor = col.glow; g.shadowBlur = 40;
            g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.stroke();
        } else if (c.style === 'slash') {
            const skew = H * 0.45, span = W + skew * 2;
            const lead = p * 2 * span - skew, trail = (p * 2 - 1) * span - skew;
            const poly = (a, b) => { g.beginPath(); g.moveTo(a + skew, 0); g.lineTo(b + skew, 0); g.lineTo(b, H); g.lineTo(a, H); g.closePath(); };
            const gr = g.createLinearGradient(0, 0, W, 0); gr.addColorStop(0, col.fill); gr.addColorStop(1, col.fill);
            g.fillStyle = gr; poly(Math.max(trail, -skew * 2), Math.min(lead, W + skew * 2)); g.fill();
            g.strokeStyle = col.edge; g.lineWidth = 10; g.shadowColor = col.glow; g.shadowBlur = 36;
            for (const x of [lead, trail]) { if (x > -skew * 2 && x < W + skew * 2) { g.beginPath(); g.moveTo(x + skew, 0); g.lineTo(x, H); g.stroke(); } }
            g.globalAlpha = 0.5; g.lineWidth = 3;
            for (let i = 1; i <= 3; i++) { const x = lead - i * 46; g.beginPath(); g.moveTo(x + skew, 0); g.lineTo(x, H); g.stroke(); }
        } else if (c.style === 'shutter') {
            const n = 9, bw = W / n;
            for (let i = 0; i < n; i++) {
                const lag = (i / n) * 0.45, k = ease(clamp((e - lag * (e < 1 ? 1 : 0)) / (1 - 0.45), 0, 1)), fromTop = i % 2 === 0;
                const hh = H * clamp(e * 1.5 - (i / n) * 0.5, 0, 1);
                g.fillStyle = col.fill; g.fillRect(i * bw - 1, fromTop ? 0 : H - hh, bw + 2, hh);
                g.fillStyle = col.edge; g.fillRect(i * bw - 1, fromTop ? hh - 5 : H - hh, bw + 2, 5);
            }
        } else if (c.style === 'glitch') {
            g.fillStyle = col.fill; g.globalAlpha = clamp(e * 1.3, 0, 1); g.fillRect(0, 0, W, H); g.globalAlpha = 1;
            for (const [y, hgt, dx] of c.slices) {
                const jitter = Math.sin(c.seed + p * 40 + y * 9);
                g.fillStyle = jitter > 0 ? col.edge : col.glow; g.globalAlpha = 0.55 * e;
                g.fillRect(dx * 120 * e * jitter, y * H, W, hgt * H);
            }
            g.globalAlpha = 1; g.fillStyle = col.edge; for (let y = 0; y < H; y += 6) { g.globalAlpha = 0.07 * e; g.fillRect(0, y, W, 2); }
            g.globalAlpha = clamp((e - 0.8) * 5, 0, 1) * 0.9; g.fillStyle = '#fff'; g.fillRect(0, 0, W, H);
        } else {                                   // warp: radial speed lines and a bright core
            const gr = g.createRadialGradient(cx, cy, 0, cx, cy, Math.hypot(W, H) * 0.75);
            gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.35, col.glow); gr.addColorStop(1, col.fill);
            g.globalAlpha = clamp(e * 1.25, 0, 1); g.fillStyle = gr; g.fillRect(0, 0, W, H); g.globalAlpha = 1;
            g.strokeStyle = '#fff'; g.lineCap = 'round';
            for (let i = 0; i < 70; i++) {
                const a = (i / 70) * Math.PI * 2 + c.seed, r0 = 40 + ((i * 53) % 90) + (1 - e) * 700, r1 = r0 + (80 + (i * 29) % 260) * e;
                g.globalAlpha = 0.5 * e; g.lineWidth = 1 + (i % 4);
                g.beginPath(); g.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0); g.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1); g.stroke();
            }
        }
        g.restore();
    }
}
