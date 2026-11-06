/** the big falling sword used by Bulwark's Shield Rush, and the one that carries him up with his Up-F */
import * as THREE from 'three';
const ADD = THREE.AdditiveBlending;
export function buildSword(glow = true) {
    const obj = new THREE.Group();
    const blade = new THREE.Mesh(new THREE.BoxGeometry(18, 120, 6), new THREE.MeshStandardMaterial({ color: 0xe2e8f0, metalness: 0.7, roughness: 0.25, emissive: 0x475569, emissiveIntensity: 0.6 }));
    const tip = new THREE.Mesh(new THREE.ConeGeometry(9, 26, 4), blade.material); tip.rotation.z = Math.PI; tip.rotation.y = Math.PI / 4; tip.position.y = -73;
    const guard = new THREE.Mesh(new THREE.BoxGeometry(60, 10, 12), new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.6, roughness: 0.4, emissive: 0x334155, emissiveIntensity: 0.6 })); guard.position.y = 66;
    const grip = new THREE.Mesh(new THREE.CylinderGeometry(5, 5, 34, 8), new THREE.MeshStandardMaterial({ color: 0x1e293b })); grip.position.y = 88;
    const pom = new THREE.Mesh(new THREE.SphereGeometry(8, 10, 8), guard.material); pom.position.y = 108;
    obj.add(blade, tip, guard, grip, pom);
    if (glow) {
        const gl = new THREE.Mesh(new THREE.BoxGeometry(26, 150, 2), new THREE.MeshBasicMaterial({ color: new THREE.Color('#bae6fd').multiplyScalar(1.5), transparent: true, opacity: 0.25, blending: ADD, depthWrite: false, toneMapped: false })); gl.position.y = 10;
        obj.add(gl);
    }
    return obj;
}
