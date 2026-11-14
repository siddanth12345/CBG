// "Horizon": a Battlefield-style silver / white stone stage with Greek trim, in front of a bright morning valley:
// a hazy sun, drifting clouds, floating islands, one giant waterfall and a huge castle very far off.
// Collision is exactly Frontier's (the € and ¥ versions share the same rectangles); everything here is looks only.
import * as THREE from 'three';
import { STAGE, BLAST_ZONES, WORLD, splitShake, splitClock, splitCuts } from '../gameCore.js';
import { wx, wy } from './space.js';

// small seeded random so every client builds the same valley
function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

function ctex(w, h, draw, srgb = true) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(c);
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return t;
}

/** the Greek key (meander) band, one square tile */
function meanderTile(ink, bg, line = 0.1) {
    return ctex(128, 128, (g, w, h) => {
        g.fillStyle = bg; g.fillRect(0, 0, w, h);
        g.strokeStyle = ink; g.lineWidth = w * line; g.lineCap = 'square'; g.lineJoin = 'miter';
        const m = w * 0.14, a = w - 2 * m, st = a / 5;
        g.beginPath();
        g.moveTo(m, h - m); g.lineTo(m, m); g.lineTo(w - m, m); g.lineTo(w - m, h - m - st * 1.0);
        g.lineTo(m + st * 2, h - m - st * 1.0); g.lineTo(m + st * 2, m + st * 2); g.lineTo(m + st * 3.2, m + st * 2);
        g.stroke();
        g.strokeRect(m + st * 0.0, m + st * 0.0, 0, 0);
    });
}

const gradTex = (stops, w = 4, h = 512) => ctex(w, h, (g) => {
    const gr = g.createLinearGradient(0, 0, 0, h);
    for (const [p, c] of stops) gr.addColorStop(p, c);
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
});

const glowTex = (inner, outer = 'rgba(255,255,255,0)') => ctex(256, 256, (g, w, h) => {
    const gr = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    gr.addColorStop(0, inner); gr.addColorStop(0.25, inner.replace(/[\d.]+\)$/, '0.45)')); gr.addColorStop(1, outer);
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
});

export function buildHorizon(scene, { D }) {
    const root = new THREE.Group(); scene.add(root);
    const anim = [];
    const W = STAGE.width, H = STAGE.height;
    const topY = wy(STAGE.y), cx = wx(STAGE.x + W / 2);
    // the whole backdrop is designed for the small arena and scaled up with the big one
    const sc = Math.max(WORLD.height / 2100, WORLD.width / 3800);
    const decor = new THREE.Group(); decor.scale.setScalar(sc); root.add(decor);
    const R = rng(7);

    // ------------------------------------------------------------ materials
    const silver = 0xbfc7d1, marble = 0xe6eaef, gold = 0xe7c36a;
    const tileInk = '#6f7a8a', tileBg = '#d9dee5';
    const keyTex = meanderTile(tileInk, tileBg);
    keyTex.wrapS = keyTex.wrapT = THREE.RepeatWrapping;
    const keyBand = (len, hgt) => { const t = keyTex.clone(); t.needsUpdate = true; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(Math.max(1, Math.round(len / hgt)), 1); return t; };
    const mSilver = new THREE.MeshStandardMaterial({ color: silver, metalness: 0.6, roughness: 0.3 });
    const mMarble = new THREE.MeshStandardMaterial({ color: marble, metalness: 0.1, roughness: 0.55 });
    const mGold = new THREE.MeshStandardMaterial({ color: gold, metalness: 0.8, roughness: 0.3, emissive: 0x6b4c10, emissiveIntensity: 0.35 });
    const mDark = new THREE.MeshStandardMaterial({ color: 0x9aa4b2, metalness: 0.4, roughness: 0.5, flatShading: true });

    // ------------------------------------------------------------ main stage
    const stage = new THREE.Group(); stage.position.set(cx, 0, 0); root.add(stage);
    const body = new THREE.Group(); stage.add(body);          // the stage itself (hidden while the split pieces are shown); the standing ruins stay in `stage`
    const bodyH = H - 6;
    const slab = new THREE.Mesh(new THREE.BoxGeometry(W, bodyH, D), mSilver);
    slab.position.y = topY - 6 - bodyH / 2; slab.castShadow = true; slab.receiveShadow = true;
    body.add(slab);
    // front / back faces carry the Greek key band (a plane just in front of the slab)
    const faceH = bodyH * 0.5;
    for (const zs of [1, -1]) {
        const band = new THREE.Mesh(new THREE.PlaneGeometry(W - 20, faceH), new THREE.MeshStandardMaterial({ map: keyBand(W - 20, faceH), roughness: 0.5, metalness: 0.15 }));
        band.position.set(0, topY - 6 - bodyH * 0.5, zs * (D / 2 + 0.6)); if (zs < 0) band.rotation.y = Math.PI;
        body.add(band);
        // gold trim lines above and below the band
        for (const dy of [faceH / 2 + 3, -faceH / 2 - 3]) {
            const tr = new THREE.Mesh(new THREE.BoxGeometry(W - 6, 4, 3), mGold);
            tr.position.set(0, topY - 6 - bodyH * 0.5 + dy, zs * (D / 2 + 1)); body.add(tr);
        }
    }
    // top face: pale stone tiles with a ring medallion
    const topTex = ctex(2048, Math.max(256, Math.round(2048 * D / W)), (g, w, h) => {
        g.fillStyle = '#cfd5dd'; g.fillRect(0, 0, w, h);
        const tile = h / 4;
        for (let ix = 0; ix * tile < w; ix++) for (let iy = 0; iy < 4; iy++) {
            const v = 206 + ((ix * 7 + iy * 13) % 5) * 3;
            g.fillStyle = `rgb(${v},${v + 3},${v + 8})`; g.fillRect(ix * tile + 3, iy * tile + 3, tile - 6, tile - 6);
        }
        g.strokeStyle = 'rgba(120,132,150,0.55)'; g.lineWidth = 3;
        for (let x = 0; x <= w; x += tile) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }
        for (let y = 0; y <= h; y += tile) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
        g.translate(w / 2, h / 2);
        g.strokeStyle = 'rgba(196,160,70,0.9)'; g.lineWidth = 7;
        g.beginPath(); g.arc(0, 0, h * 0.34, 0, Math.PI * 2); g.stroke();
        g.lineWidth = 3; g.beginPath(); g.arc(0, 0, h * 0.27, 0, Math.PI * 2); g.stroke();
        g.strokeStyle = 'rgba(141,151,166,0.9)'; g.lineWidth = 4;
        for (let i = 0; i < 12; i++) { const a = i * Math.PI / 6; g.beginPath(); g.moveTo(Math.cos(a) * h * 0.14, Math.sin(a) * h * 0.14); g.lineTo(Math.cos(a) * h * 0.25, Math.sin(a) * h * 0.25); g.stroke(); }
        g.beginPath(); g.arc(0, 0, h * 0.1, 0, Math.PI * 2); g.stroke();
    });
    const top = new THREE.Mesh(new THREE.PlaneGeometry(W, D), new THREE.MeshStandardMaterial({ map: topTex, roughness: 0.42, metalness: 0.2 }));
    top.rotation.x = -Math.PI / 2; top.position.y = topY + 0.05; top.receiveShadow = true; body.add(top);
    // marble cornice around the top edge + gold ledge caps (the two grabbable edges)
    const corn = (w, d, x, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, 9, d), mMarble); m.position.set(x, topY - 3, z); m.castShadow = true; body.add(m); };
    corn(W + 10, 12, 0, D / 2); corn(W + 10, 12, 0, -D / 2);
    corn(12, D, -W / 2 - 2, 0); corn(12, D, W / 2 + 2, 0);
    for (const sx of [-1, 1]) { const cap = new THREE.Mesh(new THREE.BoxGeometry(14, 18, D * 0.7), mGold); cap.position.set(sx * (W / 2 + 6), topY - 8, 0); body.add(cap); }
    // stepped underside + inverted stone keel with hanging broken columns (Battlefield's ruined underbelly)
    let yy = topY - H, ww = W * 0.9;
    for (let i = 0; i < 3; i++) {
        const th = Math.max(26, H * 0.55);
        const b = new THREE.Mesh(new THREE.BoxGeometry(ww, th, D * (0.92 - i * 0.14)), i % 2 ? mSilver : mMarble);
        b.position.y = yy - th / 2; b.castShadow = true; body.add(b);
        yy -= th; ww *= 0.72;
    }
    const keelGeo = new THREE.CylinderGeometry(0.5, 0.06, 1, 6, 1); keelGeo.rotateY(Math.PI / 6);
    const keel = new THREE.Mesh(keelGeo, mDark); keel.scale.set(ww * 1.15, Math.max(200, H * 3.4), D * 0.7); keel.position.y = yy - keel.scale.y / 2; keel.castShadow = true; body.add(keel);
    const colMat = mMarble;
    for (let i = 0; i < 5; i++) {
        const h = 90 + R() * 150, r = 9 + R() * 7;
        const c = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 1.1, h, 12), colMat);
        c.position.set((i - 2) * W * 0.17 + (R() - 0.5) * 30, topY - H - 12 - h / 2, (R() - 0.5) * 100);
        c.rotation.z = (R() - 0.5) * 0.12; c.castShadow = true; body.add(c);
    }

    // standing ruins behind the play lane: two fluted columns with a capital at each end and a broken arch (z behind the fighters)
    const column = (h, r, parent) => {
        const g = new THREE.Group();
        const shaft = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.88, r, h, 20), mMarble); shaft.position.y = h / 2; g.add(shaft);
        for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2; const fl = new THREE.Mesh(new THREE.BoxGeometry(r * 0.12, h * 0.94, r * 0.12), new THREE.MeshStandardMaterial({ color: 0xcfd6df, roughness: 0.7 })); fl.position.set(Math.cos(a) * r * 0.95, h / 2, Math.sin(a) * r * 0.95); g.add(fl); }
        const base = new THREE.Mesh(new THREE.BoxGeometry(r * 2.8, r * 0.5, r * 2.8), mSilver); base.position.y = r * 0.25; g.add(base);
        const cap = new THREE.Mesh(new THREE.BoxGeometry(r * 3, r * 0.5, r * 3), mSilver); cap.position.y = h + r * 0.25; g.add(cap);
        const cap2 = new THREE.Mesh(new THREE.BoxGeometry(r * 2.3, r * 0.35, r * 2.3), mGold); cap2.position.y = h - r * 0.05; g.add(cap2);
        g.traverse(o => { if (o.isMesh) o.castShadow = true; });
        parent.add(g); return g;
    };
    const pillarH = Math.max(260, H * 3.6), pr = Math.max(26, H * 0.32);
    for (const sx of [-1, 1]) {
        const c = column(pillarH * (sx < 0 ? 1 : 0.62), pr, stage);          // the right one is broken
        c.position.set(sx * (W / 2 - pr * 2.6), topY, -D / 2 - pr * 1.6);
    }
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(W * 0.5, pr * 0.9, pr * 2.2), mMarble);
    lintel.position.set(-W * 0.27, topY + pillarH + pr * 0.9, -D / 2 - pr * 1.6); lintel.castShadow = true; stage.add(lintel);
    const lk = new THREE.Mesh(new THREE.BoxGeometry(W * 0.5, pr * 0.22, pr * 2.3), mGold); lk.position.set(-W * 0.27, topY + pillarH + pr * 0.35, -D / 2 - pr * 1.6); stage.add(lk);

    // ------------------------------------------------------------ the soft platforms (same positions as Frontier)
    const platG = [];
    for (const p of STAGE.platforms || []) {
        const g = new THREE.Group(); g.position.set(wx(p.x + p.w / 2), wy(p.y), 0); root.add(g); platG.push({ g, p });
        const th = 26, pd = D * 0.55;
        const sl = new THREE.Mesh(new THREE.BoxGeometry(p.w, th, pd), mSilver); sl.position.y = -th / 2; sl.castShadow = true; sl.receiveShadow = true; g.add(sl);
        const cp = new THREE.Mesh(new THREE.BoxGeometry(p.w + 6, 5, pd + 4), mMarble); cp.position.y = 1; g.add(cp);
        const bd = new THREE.Mesh(new THREE.PlaneGeometry(p.w - 10, th * 0.62), new THREE.MeshStandardMaterial({ map: keyBand(p.w - 10, th * 0.62), roughness: 0.5 }));
        bd.position.set(0, -th / 2, pd / 2 + 0.5); g.add(bd);
        const bd2 = bd.clone(); bd2.position.z = -pd / 2 - 0.5; bd2.rotation.y = Math.PI; g.add(bd2);
        for (const sx of [-1, 1]) { const end = new THREE.Mesh(new THREE.BoxGeometry(8, th + 2, pd * 0.9), mGold); end.position.set(sx * (p.w / 2 + 1), -th / 2, 0); g.add(end); }
        const kl = new THREE.Mesh(keelGeo, mDark); kl.scale.set(p.w * 0.7, 90, pd * 0.7); kl.position.y = -th - 45; g.add(kl);
    }

    // ------------------------------------------------------------ sky, sun, clouds
    scene.userData.horizonSky = gradTex([[0, '#3f86d8'], [0.32, '#79b6ee'], [0.58, '#b9dcf6'], [0.78, '#fbe6c8'], [1, '#e8f1f8']]);
    const sun = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex('rgba(255,244,205,1)'), color: 0xffffff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, toneMapped: false }));
    sun.position.set(-2300, 2100, -7800); sun.scale.setScalar(5200); decor.add(sun);
    const rayTex = ctex(512, 512, (g, w, h) => {
        g.translate(w / 2, h / 2);
        for (let i = 0; i < 26; i++) {
            const a = i / 26 * Math.PI * 2 + R() * 0.1, wd = 0.03 + R() * 0.05;
            const gr = g.createRadialGradient(0, 0, 10, 0, 0, w / 2);
            gr.addColorStop(0, 'rgba(255,248,215,0.55)'); gr.addColorStop(1, 'rgba(255,248,215,0)');
            g.fillStyle = gr; g.beginPath(); g.moveTo(0, 0); g.arc(0, 0, w / 2, a - wd, a + wd); g.closePath(); g.fill();
        }
    });
    const rays = new THREE.Sprite(new THREE.SpriteMaterial({ map: rayTex, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, toneMapped: false }));
    rays.position.copy(sun.position); rays.position.z += 20; rays.scale.setScalar(12000); decor.add(rays);
    anim.push((t) => { rays.material.rotation = t * 0.01; });

    const cloudTex = ctex(512, 256, (g, w, h) => {
        for (let i = 0; i < 16; i++) {
            const x = w * (0.12 + R() * 0.76), y = h * (0.45 + R() * 0.3), r = h * (0.18 + R() * 0.28);
            const gr = g.createRadialGradient(x, y, 0, x, y, r);
            gr.addColorStop(0, 'rgba(255,255,255,0.95)'); gr.addColorStop(0.6, 'rgba(255,255,255,0.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
            g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
        }
    });
    const clouds = [];
    const cloud = (x, y, z, s, op, sp) => {
        const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: cloudTex, transparent: true, opacity: op, depthWrite: false, color: 0xfffdf8 }));
        m.position.set(x, y, z); m.scale.set(s, s * 0.5, 1); m.userData = { sp, x0: x, ph: R() * 6.28 }; decor.add(m); clouds.push(m);
    };
    for (let i = 0; i < 26; i++) cloud(-7000 + R() * 14000, -1900 + R() * 600, -2600 - R() * 3800, 1700 + R() * 1900, 0.9, 6 + R() * 8);         // the sea of clouds under the valley
    for (let i = 0; i < 9; i++) cloud(-6500 + R() * 13000, 900 + R() * 1700, -3800 - R() * 3600, 1400 + R() * 1500, 0.55, 4 + R() * 6);            // high cirrus
    anim.push((t) => { for (const c of clouds) c.position.x = c.userData.x0 + Math.sin(t * 0.02 * c.userData.sp * 0.2 + c.userData.ph) * 260 + t * 0.0; });

    // ------------------------------------------------------------ valley: layered hazy ridges
    const ridge = (z, y0, amp, col, seed, op = 1) => {
        const r = rng(seed), sh = new THREE.Shape(); const X0 = -11000, X1 = 11000;
        sh.moveTo(X0, -4200);
        for (let x = X0; x <= X1; x += 380) sh.lineTo(x, y0 + Math.sin(x * 0.00055 + seed) * amp + Math.sin(x * 0.0017 + seed * 2) * amp * 0.45 + r() * amp * 0.25);
        sh.lineTo(X1, -4200); sh.closePath();
        const m = new THREE.Mesh(new THREE.ShapeGeometry(sh), new THREE.MeshBasicMaterial({ color: col, transparent: op < 1, opacity: op }));
        m.position.z = z; decor.add(m); return m;
    };
    ridge(-8200, -300, 900, 0x93b4cf, 3);
    ridge(-7000, -750, 700, 0x86ab9f, 5);
    ridge(-5800, -1200, 520, 0x78a58a, 9);

    // ------------------------------------------------------------ floating islands
    const rocks = [];
    const mGrass = new THREE.MeshStandardMaterial({ color: 0x86c06c, roughness: 0.85, flatShading: true });
    const mRock = new THREE.MeshStandardMaterial({ color: 0xa79b8c, roughness: 0.9, flatShading: true });
    const mTrunk = new THREE.MeshStandardMaterial({ color: 0x7a5b3a, roughness: 0.9 });
    const mLeaf = new THREE.MeshStandardMaterial({ color: 0x4f9a55, roughness: 0.8, flatShading: true });
    const wob = (geo, k, seed) => { const r = rng(seed), p = geo.attributes.position; for (let i = 0; i < p.count; i++) { p.setXYZ(i, p.getX(i) * (1 + (r() - 0.5) * k), p.getY(i) * (1 + (r() - 0.5) * k * 0.5), p.getZ(i) * (1 + (r() - 0.5) * k)); } geo.computeVertexNormals(); return geo; };
    const island = (rx, thick, seed, opts = {}) => {
        const g = new THREE.Group(), r = rng(seed);
        const topM = new THREE.Mesh(wob(new THREE.CylinderGeometry(rx * 0.96, rx, thick * 0.22, 14, 1), 0.18, seed), mGrass); topM.position.y = 0; g.add(topM);
        const under = new THREE.Mesh(wob(new THREE.ConeGeometry(rx, thick, 9, 2), 0.3, seed + 1), mRock); under.rotation.x = Math.PI; under.position.y = -thick * 0.58; g.add(under);
        const nTrees = opts.trees ?? Math.floor(rx / 90);
        for (let i = 0; i < nTrees; i++) {
            const a = r() * 6.28, d = r() * rx * 0.7, h = 50 + r() * 70;
            const tr = new THREE.Mesh(new THREE.CylinderGeometry(4, 6, h * 0.4, 6), mTrunk); tr.position.set(Math.cos(a) * d, thick * 0.11 + h * 0.2, Math.sin(a) * d * 0.6); g.add(tr);
            const lf = new THREE.Mesh(new THREE.ConeGeometry(h * 0.35, h * 0.9, 7), mLeaf); lf.position.set(tr.position.x, thick * 0.11 + h * 0.75, tr.position.z); g.add(lf);
        }
        if (opts.ruin) { for (let i = 0; i < 3; i++) { const c = column(60 + r() * 60, 9, g); c.position.set((i - 1) * 55, thick * 0.11, -10 + r() * 20); if (i === 1) c.rotation.z = 0.25; } }
        return g;
    };
    const place = (g, x, y, z, bob, ph) => { g.position.set(x, y, z); g.userData = { base: y, ph, sp: 0.18 + R() * 0.18, rs: 0, amp: bob }; decor.add(g); rocks.push(g); return g; };
    place(island(420, 380, 11, { ruin: true }), -1750, 560, -2300, 22, 0.4);
    place(island(300, 260, 12), 1650, 1050, -2700, 18, 1.7);
    place(island(520, 520, 13, { ruin: true }), 2700, 140, -3100, 26, 2.9);
    place(island(240, 220, 14), -3300, 1500, -3300, 16, 4.1);
    place(island(360, 340, 15), -900, 1600, -4200, 20, 5.2);
    place(island(620, 600, 16), 4300, 1250, -4600, 24, 0.9);
    place(island(200, 200, 17), 400, 980, -3500, 14, 3.3);
    place(island(300, 300, 18), -4700, 250, -4300, 18, 2.2);

    // ------------------------------------------------------------ the giant waterfall (far left): a huge mass pouring into the clouds
    const fallTex = ctex(256, 1024, (g, w, h) => {
        const gr = g.createLinearGradient(0, 0, w, 0);
        gr.addColorStop(0, 'rgba(160,215,250,0.0)'); gr.addColorStop(0.12, 'rgba(190,230,252,0.95)'); gr.addColorStop(0.5, 'rgba(235,248,255,1)'); gr.addColorStop(0.88, 'rgba(190,230,252,0.95)'); gr.addColorStop(1, 'rgba(160,215,250,0.0)');
        g.fillStyle = gr; g.fillRect(0, 0, w, h);
        for (let i = 0; i < 70; i++) { const x = R() * w, y = R() * h, l = 80 + R() * 260; g.fillStyle = `rgba(255,255,255,${0.15 + R() * 0.35})`; g.fillRect(x, y, 2 + R() * 6, l); }
        for (let i = 0; i < 24; i++) { const x = R() * w, y = R() * h, l = 60 + R() * 200; g.fillStyle = `rgba(110,180,230,${0.1 + R() * 0.2})`; g.fillRect(x, y, 3 + R() * 6, l); }
    });
    fallTex.wrapS = fallTex.wrapT = THREE.RepeatWrapping; fallTex.repeat.set(1, 4);
    const fallMat = new THREE.MeshBasicMaterial({ map: fallTex, transparent: true, depthWrite: false, side: THREE.DoubleSide });
    const FX = -3000, FZ = -5000;
    const cliff = place(island(1250, 1500, 21, { trees: 14 }), FX, 1500, FZ - 150, 8, 0.2);
    const fall = new THREE.Mesh(new THREE.PlaneGeometry(520, 5200), fallMat); fall.position.set(FX + 80, 1430 - 2600, FZ + 380); decor.add(fall);
    const fall2 = new THREE.Mesh(new THREE.PlaneGeometry(240, 4200), fallMat); fall2.position.set(FX - 430, 1330 - 2100, FZ + 300); decor.add(fall2);
    const mistTex = glowTex('rgba(255,255,255,0.95)');
    for (let i = 0; i < 5; i++) { const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: mistTex, transparent: true, opacity: 0.8, depthWrite: false })); m.position.set(FX + 80 + (i - 2) * 190, -1500 + R() * 120, FZ + 420); m.scale.setScalar(1100 + R() * 500); decor.add(m); }
    anim.push((t, dt) => { fallTex.offset.y -= dt * 0.55; });

    // ------------------------------------------------------------ the castle, very far and very big
    const castle = new THREE.Group();
    const mStone = new THREE.MeshStandardMaterial({ color: 0xece6da, roughness: 0.8, flatShading: true });
    const mRoof = new THREE.MeshStandardMaterial({ color: 0x5d8ccf, roughness: 0.6, flatShading: true });
    const mRoof2 = new THREE.MeshStandardMaterial({ color: 0xc9564a, roughness: 0.6, flatShading: true });
    const tower = (x, z, r, h, roof, rm = mRoof) => {
        const t = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.9, r, h, 10), mStone); t.position.set(x, h / 2, z); castle.add(t);
        const rf = new THREE.Mesh(new THREE.ConeGeometry(r * 1.25, roof, 10), rm); rf.position.set(x, h + roof / 2, z); castle.add(rf);
        const ring = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.12, r * 1.12, r * 0.25, 10), mStone); ring.position.set(x, h - r * 0.1, z); castle.add(ring);
        return t;
    };
    const wall = (x0, x1, z, h, th = 70) => { const w = Math.abs(x1 - x0); const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, th), mStone); m.position.set((x0 + x1) / 2, h / 2, z); castle.add(m);
        for (let i = 0; i < w / 90; i++) { const b = new THREE.Mesh(new THREE.BoxGeometry(46, 36, th + 6), mStone); b.position.set(Math.min(x0, x1) + 45 + i * 90, h + 18, z); castle.add(b); } };
    const keep = new THREE.Mesh(new THREE.BoxGeometry(520, 900, 420), mStone); keep.position.set(0, 450, 0); castle.add(keep);
    const keepRoof = new THREE.Mesh(new THREE.ConeGeometry(430, 520, 4), mRoof); keepRoof.rotation.y = Math.PI / 4; keepRoof.position.set(0, 1160, 0); castle.add(keepRoof);
    tower(0, 0, 150, 1400, 620, mRoof);
    for (const sx of [-1, 1]) {
        tower(sx * 430, 60, 120, 1050, 460, sx < 0 ? mRoof : mRoof2);
        tower(sx * 880, 140, 100, 780, 360, mRoof);
        tower(sx * 1280, 240, 120, 640, 300, mRoof2);
        wall(sx * 430, sx * 880, 140, 420); wall(sx * 880, sx * 1280, 200, 360);
    }
    const gate = new THREE.Mesh(new THREE.BoxGeometry(170, 260, 90), new THREE.MeshStandardMaterial({ color: 0x3a4a63, roughness: 0.9 })); gate.position.set(0, 130, 215); castle.add(gate);
    for (let i = 0; i < 4; i++) { const win = new THREE.Mesh(new THREE.BoxGeometry(46, 100, 8), new THREE.MeshBasicMaterial({ color: 0xffe9a8 })); win.position.set((i - 1.5) * 110, 520 + (i % 2) * 120, 214); castle.add(win); }
    const hill = new THREE.Mesh(wob(new THREE.ConeGeometry(2100, 1500, 10, 2), 0.22, 31), new THREE.MeshStandardMaterial({ color: 0x8fb877, roughness: 0.9, flatShading: true }));
    hill.position.y = -740; castle.add(hill);
    const crag = new THREE.Mesh(wob(new THREE.ConeGeometry(1500, 1500, 9, 2), 0.3, 32), mRock); crag.rotation.x = Math.PI; crag.position.y = -1600; castle.add(crag);
    castle.position.set(1900, 140, -7600); castle.scale.setScalar(1.15);
    decor.add(castle);
    anim.push((t) => { castle.position.y = 140 + Math.sin(t * 0.07) * 14; });

    // a few birds
    const birdTex = ctex(64, 32, (g) => { g.strokeStyle = 'rgba(60,70,90,0.9)'; g.lineWidth = 3; g.beginPath(); g.moveTo(4, 8); g.quadraticCurveTo(18, 22, 32, 14); g.quadraticCurveTo(46, 22, 60, 8); g.stroke(); });
    const birds = [];
    for (let i = 0; i < 7; i++) { const b = new THREE.Sprite(new THREE.SpriteMaterial({ map: birdTex, transparent: true, depthWrite: false })); b.scale.set(120, 60, 1); b.position.set(-2500 + R() * 5000, 400 + R() * 900, -2600 - R() * 1200); b.userData = { sp: 40 + R() * 40, x0: b.position.x }; decor.add(b); birds.push(b); }
    anim.push((t) => { for (const b of birds) { const w = 5000; b.position.x = ((b.userData.x0 + t * b.userData.sp + w / 2) % w + w) % w - w / 2 - 300; b.position.y += Math.sin(t * 2 + b.userData.x0) * 0.3; } });

    // ------------------------------------------------------------ blast-zone frame (soft white dashes)
    const bz = BLAST_ZONES, K = W / 3800;
    const L = wx(bz.left), Rr = wx(bz.right), T = wy(bz.top), B = wy(bz.bottom);
    const DASH = 44 * K, GAP = 44 * K, TH = 5 * K, list = [];
    const edge = (x0, y0, x1, y1) => { const len = Math.hypot(x1 - x0, y1 - y0), n = Math.floor(len / (DASH + GAP)); for (let i = 0; i < n; i++) { const t0 = (i * (DASH + GAP) + DASH / 2) / len; list.push({ x: x0 + (x1 - x0) * t0, y: y0 + (y1 - y0) * t0, horiz: Math.abs(y1 - y0) < 1e-3 }); } };
    edge(L, T, Rr, T); edge(L, B, Rr, B); edge(L, B, L, T); edge(Rr, B, Rr, T);
    const frame = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: 0xff7a6b, transparent: true, opacity: 0.4, toneMapped: false }), list.length);
    const m4 = new THREE.Matrix4();
    list.forEach((d, i) => { m4.makeScale(d.horiz ? DASH : TH, d.horiz ? TH : DASH, TH); m4.setPosition(d.x, d.y, 0); frame.setMatrixAt(i, m4); });
    root.add(frame);

    // ---- the crack: jagged glowing lines on the top while the stage is about to split, and solid stone faces on every cut edge
    const crackTex = ctex(128, 512, (g, w, h) => {
        g.clearRect(0, 0, w, h);
        const seed = rng(7), pts = []; let x = w / 2;
        for (let y = 0; y <= h; y += 18) { x += (seed() - 0.5) * 44; x = Math.max(24, Math.min(w - 24, x)); pts.push([x, y]); }
        const stroke = (col, lw, blur) => { g.shadowColor = '#ff9a3c'; g.shadowBlur = blur; g.strokeStyle = col; g.lineWidth = lw; g.lineJoin = 'miter'; g.beginPath(); pts.forEach(([a, b], i) => i ? g.lineTo(a, b) : g.moveTo(a, b)); g.stroke(); };
        stroke('rgba(255,150,60,0.9)', 14, 22); stroke('#1b1410', 6, 0);
        for (let i = 2; i < pts.length - 2; i += 2) { const [a, b] = pts[i], d = seed() < 0.5 ? -1 : 1; g.strokeStyle = '#1b1410'; g.lineWidth = 3; g.beginPath(); g.moveTo(a, b); g.lineTo(a + d * (14 + seed() * 22), b + 8 + seed() * 14); g.stroke(); }
    });
    const decals = [0, 1].map(() => { const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: crackTex, transparent: true, depthWrite: false, toneMapped: false })); m.rotation.x = -Math.PI / 2; m.visible = false; m.renderOrder = 4; root.add(m); return m; });
    // ---- split pieces: when the stage breaks, every piece is its own solid chunk of floating stone (jagged cut edge, its own stepped underside and keel)
    // the keel (the big inverted triangle) never changes: it stays one whole stone under the cracked stage, and the crack lines run down its face
    const keelSolo = keel.clone(); keelSolo.visible = false; stage.add(keelSolo);
    const keelCracks = new THREE.Group(); keelCracks.visible = false; stage.add(keelCracks);
    const crackDark = new THREE.LineBasicMaterial({ color: 0x1b1410 }), crackGlow = new THREE.LineBasicMaterial({ color: new THREE.Color('#ff9a3c').multiplyScalar(1.6), toneMapped: false });
    function buildKeelCracks(cuts) {
        while (keelCracks.children.length) { const o = keelCracks.children.pop(); o.geometry.dispose(); }
        const top = keel.position.y + keel.scale.y / 2, kh = keel.scale.y, hwTop = keel.scale.x / 2, n = 14;
        cuts.forEach((c, ci) => {
            const r = rng(Math.round(c * 1000) + 11), pts = [], pts2 = [];
            for (let i = 0; i <= n; i++) {
                const t = i / n, hw = hwTop * (1 - 0.88 * t), x = (c - 0.5) * 2 * hw * 0.92 + (i && i < n ? (r() - 0.5) * 16 * (1 - t) : 0);
                pts.push(new THREE.Vector3(x, top - kh * t * 0.97, D * 0.7 * 0.5 * (1 - t * 0.6) * 0.78 + 1.2)); pts2.push(new THREE.Vector3(x, top - kh * t * 0.97, -(D * 0.7 * 0.5 * (1 - t * 0.6) * 0.78 + 1.2)));
            }
            for (const arr of [pts, pts2]) { const gl = new THREE.Line(new THREE.BufferGeometry().setFromPoints(arr), crackGlow); const dk = gl.clone(); dk.material = crackDark; dk.position.x += 1.4; keelCracks.add(gl, dk); }
        });
    }
    const pieces = []; let pieceKey = '', keelKey = '';
    const edgeLine = new THREE.LineBasicMaterial({ color: new THREE.Color('#ff9a3c').multiplyScalar(1.6), toneMapped: false });
    const jag = (seed, n, A) => { const r = rng(seed), o = [0]; for (let m = 1; m <= n; m++) o.push((m % 2 ? 1 : -1) * (0.35 + r() * 0.65) * A); return o; };
    function buildPiece(k, n, fr, cuts) {
        const pw = (fr[k + 1] - fr[k]) * W, g = new THREE.Group(), N = 8, A = 16, rowH = bodyH / N;
        const UR = 7 + 8, jl = k > 0 ? jag(Math.round(cuts[k - 1] * 1000) + 3, N + UR, A) : null, jr = k < n - 1 ? jag(Math.round(cuts[k] * 1000) + 3, N + UR, A) : null;      // the cut continues down through the underside and the keel (same zigzag)
        const sh = new THREE.Shape(); sh.moveTo(-pw / 2, 0); sh.lineTo(pw / 2, 0);
        for (let m = 1; m <= N; m++) sh.lineTo(pw / 2 + (jr ? jr[m] : 0), -m * rowH);
        for (let m = N; m >= 1; m--) sh.lineTo(-pw / 2 + (jl ? jl[m] : 0), -m * rowH);
        sh.lineTo(-pw / 2, 0);
        const geo = new THREE.ExtrudeGeometry(sh, { depth: D, bevelEnabled: false }); geo.translate(0, 0, -D / 2);
        const slabP = new THREE.Mesh(geo, mSilver); slabP.position.y = topY - 6; slabP.castShadow = true; slabP.receiveShadow = true; g.add(slabP);
        for (const zs of [1, -1]) {                                    // Greek key band + gold trims on the front and back
            const bw = Math.max(40, pw - 2 * (A + 6)), fh = bodyH * 0.5;
            const band = new THREE.Mesh(new THREE.PlaneGeometry(bw, fh), new THREE.MeshStandardMaterial({ map: keyBand(bw, fh), roughness: 0.5, metalness: 0.15 }));
            band.position.set((jl ? 0 : 0), topY - 6 - bodyH * 0.5, zs * (D / 2 + 0.6)); if (zs < 0) band.rotation.y = Math.PI; g.add(band);
            for (const dy of [fh / 2 + 3, -fh / 2 - 3]) { const tr = new THREE.Mesh(new THREE.BoxGeometry(bw + 10, 4, 3), mGold); tr.position.set(0, topY - 6 - bodyH * 0.5 + dy, zs * (D / 2 + 1)); g.add(tr); }
        }
        const tt = topTex.clone(); tt.needsUpdate = true; tt.repeat.set(pw / W, 1); tt.offset.set(fr[k], 0);
        const topP = new THREE.Mesh(new THREE.PlaneGeometry(pw, D), new THREE.MeshStandardMaterial({ map: tt, roughness: 0.42, metalness: 0.2 }));
        topP.rotation.x = -Math.PI / 2; topP.position.y = topY + 0.05; topP.receiveShadow = true; g.add(topP);
        const cornP = (w, d, x, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, 9, d), mMarble); m.position.set(x, topY - 3, z); m.castShadow = true; g.add(m); };
        cornP(pw + (jl ? 0 : 10) + (jr ? 0 : 0), 12, 0, D / 2); cornP(pw, 12, 0, -D / 2);
        if (!jl) { cornP(12, D, -pw / 2 - 2, 0); const cap = new THREE.Mesh(new THREE.BoxGeometry(14, 18, D * 0.7), mGold); cap.position.set(-pw / 2 - 6, topY - 8, 0); g.add(cap); }
        if (!jr) { cornP(12, D, pw / 2 + 2, 0); const cap = new THREE.Mesh(new THREE.BoxGeometry(14, 18, D * 0.7), mGold); cap.position.set(pw / 2 + 6, topY - 8, 0); g.add(cap); }
        // underside: the steps and the keel of the WHOLE stage, cut by the same crack lines, so the break runs through the rock instead of leaving a separate cone under every piece
        {
            const mid = ((fr[k] + fr[k + 1]) / 2 - 0.5) * W, xl = fr[k] * W - W / 2 - mid, xr = fr[k + 1] * W - W / 2 - mid;
            const stepH = Math.max(26, H * 0.55), keelH = Math.max(200, H * 3.4);
            let wk = W * 0.9; const secs = [];
            for (let i = 0; i < 3; i++) { secs.push({ rows: 2, h: stepH, w0: wk / 2, w1: wk / 2, d: D * (0.92 - i * 0.14), m: i % 2 ? mSilver : mMarble }); wk *= 0.72; }
            let y = topY - H, gi = N;
            for (const sc of secs) {
                const rh = sc.h / sc.rows, pts = [];
                for (let r = 0; r <= sc.rows; r++) {
                    const hw = sc.w0 + (sc.w1 - sc.w0) * r / sc.rows, idx = Math.min(gi + r, N + UR);
                    const L = Math.max(-hw, jl ? xl + jl[idx] : -1e9), R = Math.min(hw, jr ? xr + jr[idx] : 1e9);
                    pts.push({ y: y - r * rh, L, R, ok: R - L > 2 });
                }
                for (let a0 = 0; a0 < pts.length;) {                      // every unbroken run of rows becomes one solid block
                    if (!pts[a0].ok) { a0++; continue; }
                    let b0 = a0; while (b0 + 1 < pts.length && pts[b0 + 1].ok) b0++;
                    if (b0 > a0) {
                        const sh2 = new THREE.Shape(); sh2.moveTo(pts[a0].L, pts[a0].y);
                        for (let r = a0 + 1; r <= b0; r++) sh2.lineTo(pts[r].L, pts[r].y);
                        for (let r = b0; r >= a0; r--) sh2.lineTo(pts[r].R, pts[r].y);
                        sh2.lineTo(pts[a0].L, pts[a0].y);
                        const gg = new THREE.ExtrudeGeometry(sh2, { depth: sc.d, bevelEnabled: false }); gg.translate(0, 0, -sc.d / 2);
                        const mm = new THREE.Mesh(gg, sc.m); mm.castShadow = true; g.add(mm);
                    }
                    a0 = b0 + 1;
                }
                y -= sc.h; gi += sc.rows;
            }
        }
        const rr = rng(Math.round(fr[k] * 1000) + 5);
        for (let i = 0, nc = Math.max(1, Math.round(pw / W * 5)); i < nc; i++) {
            const h = 90 + rr() * 150, r = 9 + rr() * 7, c = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 1.1, h, 12), mMarble);
            c.position.set((i + 0.5 - nc / 2) * (pw * 0.8 / nc) + (rr() - 0.5) * 24, topY - H - 12 - h / 2, (rr() - 0.5) * 100); c.rotation.z = (rr() - 0.5) * 0.12; c.castShadow = true; g.add(c);
        }
        g.userData.mid = (fr[k] + fr[k + 1]) / 2 - 0.5; root.add(g); return g;
    }
    const clearPieces = () => { for (const g of pieces) { root.remove(g); g.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material && o.material.map && o.material.map !== keyTex && o.material.map !== topTex) { /* per-piece textures are tiny clones */ } }); } pieces.length = 0; pieceKey = ''; };

    // `stars` is only a handle the view toggles for quality / menu; Horizon has none
    const stars = new THREE.Points(new THREE.BufferGeometry(), new THREE.PointsMaterial({ transparent: true, opacity: 0 }));
    return {
        root, stage, topY, W, D, decor, stars, rocks, theme: 'horizon', sc, sky: scene.userData.horizonSky,
        update(t, dt) {
            for (const f of anim) f(t, dt);
            // ---- the split hazard: the stage is drawn as up to three clipped copies that drift apart (with a shake)
            const segs = STAGE.segs, shk = splitCuts().length ? splitShake(splitClock()) : 0;
            const jx = (k) => shk ? Math.sin(t * 61 + k * 2.3) * 5 * shk : 0, jy = (k) => shk ? Math.sin(t * 47 + k * 1.7) * 3 * shk : 0;
            const cuts = splitCuts(), clk = splitClock() % 900;
            const broken = cuts.length > 0 && clk >= 330;                       // the pieces replace the whole stage from the moment it breaks until it is whole again
            if (broken) {
                const fr = [0, ...cuts, 1], key = cuts.join(',');
                if (key !== pieceKey) { clearPieces(); pieceKey = key; for (let k = 0; k < fr.length - 1; k++) pieces.push(buildPiece(k, fr.length - 1, fr, cuts)); }
                body.visible = false; keelSolo.visible = true; keelCracks.visible = true; if (key !== keelKey) { keelKey = key; buildKeelCracks(cuts); }
                pieces.forEach((g, k) => { g.visible = true; const q = segs && segs[k]; g.position.set(cx + g.userData.mid * W + (q ? wx(q.off) - wx(0) : 0) + jx(k), jy(k), 0); });
            } else { body.visible = true; keelSolo.visible = false; keelCracks.visible = false; pieces.forEach(g => { g.visible = false; }); }
            // crack lines on the top just before it breaks
            const warn = cuts.length && clk >= 300 && clk < 330 ? Math.min(1, splitShake(splitClock()) * 1.4) : 0;
            decals.forEach((d, i) => {
                const on = warn > 0 && i < cuts.length; d.visible = on; if (!on) return;
                d.position.set(cx - W / 2 + cuts[i] * W + jx(i + 9), topY + 0.8, 0); d.scale.set(70, D * 0.98, 1); d.material.opacity = 0.35 + 0.65 * warn;
            });
            if (STAGE.platforms.some(q => q.bx !== undefined)) platG.forEach((o, i) => o.g.position.set(wx(o.p.x + o.p.w / 2) + jx(i + 3), wy(o.p.y) + jy(i + 3), 0));
            for (const g of rocks) g.position.y = g.userData.base + Math.sin(t * g.userData.sp + g.userData.ph) * g.userData.amp;
        },
        ledgeY: topY,
    };
}
