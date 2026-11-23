// King of the Hill zone (a golden ring + light column on the hill top, white when held, red when contested) and the Tag "IT" marker over the tagged fighter.
import * as THREE from 'three';
import { S, fighters } from '../gameCore.js';
import { wx, wy } from './space.js';

export class ModeFx {
    constructor(scene) {
        this.g = new THREE.Group(); this.g.visible = false; scene.add(this.g);
        this.ringMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 1.7, 0.3), transparent: true, opacity: 0.95, side: THREE.DoubleSide, toneMapped: false, depthWrite: false });
        this.ring = new THREE.Mesh(new THREE.RingGeometry(0.94, 1, 72), this.ringMat); this.ring.rotation.x = -Math.PI / 2; this.ring.renderOrder = 7;
        this.colMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.0, 1.6, 0.4), transparent: true, opacity: 0.14, side: THREE.DoubleSide, toneMapped: false, depthWrite: false });
        this.col = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 48, 1, true), this.colMat); this.col.renderOrder = 6;
        this.it = new THREE.Mesh(new THREE.ConeGeometry(26, 56, 4), new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 0.5, 0.4), toneMapped: false })); this.it.rotation.x = Math.PI;
        this.g.add(this.ring, this.col, this.it);
    }
    update(t) {
        const M = S.md, on = !!M && S.gameState === 'playing' && !!S.match; this.g.visible = on; if (!on) return;
        const z = M.zone;
        this.ring.visible = this.col.visible = M.sub === 'koth' && !!z;
        if (this.ring.visible) {
            const r = z.r, y = wy(z.y);
            this.ring.position.set(wx(z.x), y + 4, 0); this.ring.scale.set(r, r, r);
            this.col.position.set(wx(z.x), y + 230, 0); this.col.scale.set(r, 460, r * 0.55);
            const held = M.who >= 0, pulse = 0.85 + Math.sin(t * 4) * 0.15;
            this.ringMat.color.setRGB(held ? 0.6 : 2.2, held ? 2.2 : 1.7, held ? 0.6 : 0.3).multiplyScalar(pulse); this.colMat.color.copy(this.ringMat.color); this.colMat.opacity = held ? 0.1 : 0.06;
        }
        const f = M.sub === 'tag' ? fighters.find(x => x.slot === M.it && x.active && !x.out) : null;
        this.it.visible = !!f;
        if (f) { this.it.position.set(wx(f.x), wy(f.y) + (f.height || 110) + 60 + Math.sin(t * 6) * 8, 0); this.it.rotation.y = t * 3; }
    }
}
