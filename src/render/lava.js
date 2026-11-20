// "Magma Forge" (lava stage): a black basalt stage hanging over an endless lava sea, with a smoking volcano range behind it,
// glowing cracks, falling embers and lava rivers. Collision is the same plain rectangles as Frontier / Horizon; everything here is looks only.
import * as THREE from 'three';
import { STAGE, BLAST_ZONES, WORLD } from '../gameCore.js';
import { wx, wy } from './space.js';
import { getGfx, lowGfx } from '../gfx.js';

function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
function ctex(w, h, draw, srgb = true) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(c);
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return t;
}
const emis = (color, k = 2) => new THREE.MeshStandardMaterial({ color: new THREE.Color(color).multiplyScalar(0.25), emissive: new THREE.Color(color), emissiveIntensity: k, roughness: 0.5 });

export function buildLava(scene, { D }) {
    const root = new THREE.Group(); scene.add(root);
    const anim = [];
    const W = STAGE.width, topY = wy(STAGE.y), cx = wx(STAGE.x + W / 2);
    const sc = Math.max(WORLD.height / 2100, WORLD.width / 3800);
    const decor = new THREE.Group(); decor.scale.setScalar(sc); decor.position.x = cx; root.add(decor);
    const R = rng(23);
    const rocks = [], details = [];

    // ------------------------------------------------------------ sky: black-red at the top, a glowing orange horizon
    const sky = ctex(4, 512, (g, w, h) => {
        const gr = g.createLinearGradient(0, 0, 0, h);
        gr.addColorStop(0, '#0b0306'); gr.addColorStop(0.45, '#2a0a0c'); gr.addColorStop(0.78, '#7a1d0a'); gr.addColorStop(1, '#ff7a1a');
        g.fillStyle = gr; g.fillRect(0, 0, w, h);
    });

    // ------------------------------------------------------------ lava sea (scrolling veins) far below the stage
    const lavaTex = ctex(512, 512, (g, w, h) => {
        g.fillStyle = '#c2310a'; g.fillRect(0, 0, w, h);
        const r = rng(5);
        for (let i = 0; i < 70; i++) {
            const x = r() * w, y = r() * h, rad = 20 + r() * 60;
            const gr = g.createRadialGradient(x, y, 0, x, y, rad);
            gr.addColorStop(0, 'rgba(255,200,60,0.9)'); gr.addColorStop(0.5, 'rgba(255,110,20,0.45)'); gr.addColorStop(1, 'rgba(194,49,10,0)');
            g.fillStyle = gr; g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
        }
        g.strokeStyle = 'rgba(40,6,2,0.85)'; g.lineWidth = 5;                                  // dark cooled crust cracks
        for (let i = 0; i < 26; i++) { g.beginPath(); let x = r() * w, y = r() * h; g.moveTo(x, y); for (let k = 0; k < 5; k++) { x += (r() - 0.5) * 120; y += (r() - 0.5) * 120; g.lineTo(x, y); } g.stroke(); }
    });
    lavaTex.wrapS = lavaTex.wrapT = THREE.RepeatWrapping; lavaTex.repeat.set(14, 3);
    const lavaMat = new THREE.MeshBasicMaterial({ map: lavaTex, color: new THREE.Color(1.5, 1.15, 1.0), toneMapped: false });
    const lava = new THREE.Mesh(new THREE.PlaneGeometry(90000, 14000), lavaMat);
    lava.rotation.x = -Math.PI / 2; lava.position.set(cx, wy(STAGE.y + 1100 * sc), -3000); root.add(lava);
    const glowTex = ctex(256, 256, (g, w, h) => { const gr = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2); gr.addColorStop(0, 'rgba(255,170,60,1)'); gr.addColorStop(0.3, 'rgba(255,90,20,0.45)'); gr.addColorStop(1, 'rgba(255,60,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); });
    const haze = new THREE.Mesh(new THREE.PlaneGeometry(60000, 6000), new THREE.MeshBasicMaterial({ map: glowTex, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    haze.position.set(cx, wy(STAGE.y + 1100 * sc) + 1200, -6200); root.add(haze);
    anim.push((t) => { lavaTex.offset.x = t * 0.004; lavaTex.offset.y = Math.sin(t * 0.3) * 0.01; haze.material.opacity = 0.5 + Math.sin(t * 0.8) * 0.08; });

    // ------------------------------------------------------------ volcano range (decor, scaled with the arena)
    const basalt = new THREE.MeshStandardMaterial({ color: 0x1b1416, roughness: 0.95, metalness: 0.05, flatShading: true });
    const basaltLight = new THREE.MeshStandardMaterial({ color: 0x2c2023, roughness: 0.9, flatShading: true });
    const riverMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(3.2, 1.1, 0.25), toneMapped: false });
    const BASEY = wy(STAGE.y + 1100 * sc) / sc;                                         // decor-space y of the lava sea
    const volcano = (x, z, h, r, erupt) => {
        const g = new THREE.Group();
        const body = new THREE.Mesh(new THREE.ConeGeometry(r, h, 9, 3, true), basalt); body.position.y = h / 2; g.add(body);
        const v = body.geometry.attributes.position;                                    // jag the cone so it reads as rock, not a party hat
        for (let i = 0; i < v.count; i++) { const k = 1 + (R() - 0.5) * 0.16; v.setX(i, v.getX(i) * k); v.setZ(i, v.getZ(i) * k); if (v.getY(i) < h / 2 - 1) v.setY(i, v.getY(i) + (R() - 0.5) * 60); }
        body.geometry.computeVertexNormals();
        const crater = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.16, r * 0.2, h * 0.04, 12), new THREE.MeshBasicMaterial({ color: new THREE.Color(3.6, 1.5, 0.4), toneMapped: false }));
        crater.position.y = h * 0.985; g.add(crater);
        for (let i = 0; i < 3; i++) {                                                   // lava rivers running down the slope
            const a = R() * 6.28, riv = new THREE.Mesh(new THREE.BoxGeometry(r * 0.05, h * 0.78, r * 0.05), riverMat);
            riv.position.set(Math.cos(a) * r * 0.3, h * 0.5, Math.sin(a) * r * 0.3); riv.rotation.set(Math.sin(a) * 0.4, 0, -Math.cos(a) * 0.4); g.add(riv);
        }
        g.position.set(x, BASEY, z); decor.add(g);
        if (erupt) {                                                                    // smoke + sparks climbing out of the crater
            const N = lowGfx() ? 18 : (getGfx() === 'medium' ? 36 : 48);
            const geo = new THREE.BufferGeometry(), pos = new Float32Array(N * 3), seed = [];
            for (let i = 0; i < N; i++) seed.push({ a: R() * 6.28, sp: 0.4 + R() * 0.8, ph: R() });
            geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
            const pts = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xff8a2a, size: 70, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
            pts.frustumCulled = false; decor.add(pts);
            anim.push((t) => {
                for (let i = 0; i < N; i++) {
                    const s = seed[i], u = (t * 0.22 * s.sp + s.ph) % 1;
                    pos[i * 3] = x + Math.cos(s.a) * u * r * 0.7; pos[i * 3 + 1] = BASEY + h + u * h * 0.9 - u * u * h * 0.5; pos[i * 3 + 2] = z + Math.sin(s.a) * u * r * 0.7;
                }
                geo.attributes.position.needsUpdate = true;
            });
            const smoke = new THREE.Mesh(new THREE.SphereGeometry(r * 0.55, 10, 8), new THREE.MeshBasicMaterial({ color: 0x1a1416, transparent: true, opacity: 0.8, depthWrite: false }));
            smoke.scale.set(1.5, 0.8, 1); smoke.position.set(x, BASEY + h * 1.35, z); decor.add(smoke);
            anim.push((t) => { smoke.position.x = x + Math.sin(t * 0.12) * 120; smoke.scale.y = 0.8 + Math.sin(t * 0.4) * 0.06; });
        }
    };
    const span = 3600;
    volcano(-2300, -4200, 3600, 2000, true);
    volcano(1900, -4800, 4300, 2400, false);
    volcano(-5200, -5200, 2700, 1700, false);
    volcano(4900, -3800, 3000, 1800, true);
    volcano(-800, -6500, 5200, 3000, false);

    // ------------------------------------------------------------ falling embers (also the "stars" the menu / quality code toggles)
    // Was 420 points rewritten every frame — a major lava-map lag source. Scale with graphics setting.
    const EN = lowGfx() ? 48 : (getGfx() === 'medium' ? 110 : 160);
    const egeo = new THREE.BufferGeometry(), epos = new Float32Array(EN * 3), eseed = [];
    for (let i = 0; i < EN; i++) eseed.push({ x: (R() - 0.5) * 9000, z: -2500 + R() * 2600, sp: 0.5 + R() * 1.2, ph: R() });
    egeo.setAttribute('position', new THREE.BufferAttribute(epos, 3));
    const stars = new THREE.Points(egeo, new THREE.PointsMaterial({ color: 0xffa040, size: 16, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    stars.frustumCulled = false; stars.userData.fullCount = EN; root.add(stars);
    let _emberTick = 0;
    anim.push((t) => {
        // low/medium: update every other frame (half the CPU, still looks continuous)
        if ((lowGfx() || getGfx() === 'medium') && (++_emberTick & 1)) return;
        const y0 = wy(STAGE.y + 1000 * sc), top = topY + 2600 * sc;
        for (let i = 0; i < EN; i++) {
            const s = eseed[i], u = (t * 0.06 * s.sp + s.ph) % 1;
            epos[i * 3] = cx + s.x * sc * 0.8 + Math.sin(t * 0.6 + i) * 40; epos[i * 3 + 1] = y0 + u * (top - y0); epos[i * 3 + 2] = s.z;
        }
        egeo.attributes.position.needsUpdate = true;
    });

    // ------------------------------------------------------------ the stage: a black basalt slab with glowing cracks, jagged rock underneath
    const stage = new THREE.Group(); stage.position.set(cx, 0, 0); root.add(stage);
    const slab = new THREE.Mesh(new THREE.BoxGeometry(W, STAGE.height - 6, D), basalt);
    slab.position.y = topY - 6 - (STAGE.height - 6) / 2; slab.castShadow = true; slab.receiveShadow = true; stage.add(slab);
    for (const zs of [1, -1]) { const rim = new THREE.Mesh(new THREE.BoxGeometry(W + 4, 6, 8), emis('#ff6a1a', 2.6)); rim.position.set(0, topY - 3, zs * (D / 2 - 2)); stage.add(rim); }
    const cracks = ctex(512, 64, (g, w, h) => {
        g.clearRect(0, 0, w, h); g.strokeStyle = '#ffb347'; g.lineWidth = 3; g.lineJoin = 'round';
        const r = rng(9);
        for (let k = 0; k < 7; k++) { g.beginPath(); let x = r() * w, y = 0; g.moveTo(x, y); while (y < h) { x += (r() - 0.5) * 40; y += 8 + r() * 12; g.lineTo(x, y); } g.stroke(); }
    });
    cracks.wrapS = THREE.RepeatWrapping; cracks.repeat.set(Math.max(2, W / 520), 1);
    for (const zs of [1, -1]) {
        const c = new THREE.Mesh(new THREE.PlaneGeometry(W, STAGE.height - 8), new THREE.MeshBasicMaterial({ map: cracks, transparent: true, color: new THREE.Color(2.2, 1.0, 0.3), toneMapped: false, depthWrite: false }));
        c.position.set(0, slab.position.y, zs * (D / 2 + 0.6)); if (zs < 0) c.rotation.y = Math.PI; stage.add(c);
    }
    // the molten top seam (animated pulse)
    const seam = new THREE.Mesh(new THREE.BoxGeometry(W * 0.9, 1.6, 7), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.6, 0.9, 0.2), transparent: true, opacity: 0.55, toneMapped: false }));
    seam.position.y = topY + 0.8; stage.add(seam);
    anim.push((t) => { seam.material.opacity = 0.35 + Math.sin(t * 2.1) * 0.15; });
    // hanging jagged rock under the slab
    const spikes = Math.max(5, Math.round(W / 220));
    for (let i = 0; i < spikes; i++) {
        const u = (i + 0.5) / spikes, hh = 160 + R() * 420 * (1 - Math.abs(u - 0.5) * 1.1), rr = 90 + R() * 90;
        const sp = new THREE.Mesh(new THREE.ConeGeometry(rr, hh, 6), i % 2 ? basalt : basaltLight);
        sp.rotation.x = Math.PI; sp.position.set((u - 0.5) * W * 0.96, topY - STAGE.height - hh / 2 + 20, (R() - 0.5) * D * 0.5); sp.rotation.z = (R() - 0.5) * 0.25; sp.castShadow = true; stage.add(sp);
        if (R() < 0.45) { const drip = new THREE.Mesh(new THREE.SphereGeometry(10, 8, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 1.2, 0.3), toneMapped: false })); drip.position.set(sp.position.x, sp.position.y - hh / 2 - 12, sp.position.z); stage.add(drip); const ph = R() * 6; anim.push((t) => { drip.position.y = sp.position.y - hh / 2 - 12 - ((t * 0.5 + ph) % 1) * 220; drip.scale.setScalar(1 - ((t * 0.5 + ph) % 1) * 0.7); }); }
    }

    // ------------------------------------------------------------ soft platforms: floating basalt slabs with a glowing lip and a rock keel
    const platG = [];
    for (const p of STAGE.platforms || []) {
        const g = new THREE.Group();
        const s2 = new THREE.Mesh(new THREE.BoxGeometry(p.w, 26, D * 0.55), basalt); s2.position.y = -13; s2.castShadow = true; s2.receiveShadow = true;
        const e2 = new THREE.Mesh(new THREE.BoxGeometry(p.w, 5, 8), emis('#ff7a1a', 2.6)); e2.position.set(0, 1, D * 0.275);
        const keel = new THREE.Mesh(new THREE.ConeGeometry(Math.min(70, p.w * 0.22), 90, 5), basaltLight); keel.rotation.x = Math.PI; keel.position.y = -70;
        g.add(s2, e2, keel);
        g.position.set(wx(p.x + p.w / 2), wy(p.y), 0); root.add(g); platG.push(g);
    }

    // ------------------------------------------------------------ floating basalt chunks drifting with a lava glow
    const nR = 14;
    for (let i = 0; i < nR; i++) {
        const g = new THREE.Group(), s = 70 + R() * 190;
        const m = new THREE.Mesh(new THREE.IcosahedronGeometry(s, 0), i % 3 ? basalt : basaltLight); m.scale.set(1.3, 0.8, 1); g.add(m);
        if (R() < 0.6) { const c = new THREE.Mesh(new THREE.IcosahedronGeometry(s * 0.35, 0), riverMat); c.position.set(0, s * 0.62, s * 0.3); g.add(c); }
        const x = (R() - 0.5) * 7600, y = -400 + R() * 1500, z = -900 - R() * 2600;
        g.position.set(x, y + BASEY * 0 + (topY / sc), z); g.userData = { base: g.position.y * sc, sp: 0.3 + R() * 0.5, ph: R() * 6.28, amp: 18 + R() * 30 };
        decor.add(g); details.push(g);
    }

    // lighting accents: a red-orange glow from the lava below
    const glowL = new THREE.PointLight(0xff5a14, 6e5 * sc, 7000 * sc, 1.6); glowL.position.set(cx, wy(STAGE.y + 700 * sc), 500); root.add(glowL);
    anim.push((t) => { glowL.intensity = (5.5e5 + Math.sin(t * 3.1) * 7e4) * sc; });

    // ------------------------------------------------------------ the dashed blast-zone frame
    const bz = BLAST_ZONES, K = sc;
    const Lx = wx(bz.left), Rx = wx(bz.right), Ty = wy(bz.top), By = wy(bz.bottom), DASH = 44 * K, GAP = 44 * K, TH = 5 * K, list = [];
    const edge = (x0, y0, x1, y1) => { const len = Math.hypot(x1 - x0, y1 - y0), n = Math.floor(len / (DASH + GAP)); for (let i = 0; i < n; i++) { const t0 = (i * (DASH + GAP) + DASH / 2) / len; list.push({ x: x0 + (x1 - x0) * t0, y: y0 + (y1 - y0) * t0, horiz: Math.abs(y1 - y0) < 1e-3 }); } };
    edge(Lx, Ty, Rx, Ty); edge(Lx, By, Rx, By); edge(Lx, By, Lx, Ty); edge(Rx, By, Rx, Ty);
    const frame = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff4a2a).multiplyScalar(1.4), transparent: true, opacity: 0.42, toneMapped: false }), list.length);
    const m4 = new THREE.Matrix4();
    list.forEach((d, i) => { m4.makeScale(d.horiz ? DASH : TH, d.horiz ? TH : DASH, TH); m4.setPosition(d.x, d.y, 0); frame.setMatrixAt(i, m4); });
    root.add(frame);

    return {
        root, stage, topY, W, D, decor, stars, rocks, details, theme: 'lava', sc, sky,
        update(t, dt) {
            for (const f of anim) f(t, dt);
            for (const g of details) g.position.y = (g.userData.base + Math.sin(t * g.userData.sp + g.userData.ph) * g.userData.amp) / sc;
        },
        ledgeY: topY,
    };
}
