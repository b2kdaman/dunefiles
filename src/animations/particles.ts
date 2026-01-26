import * as THREE from "three";
import type { Particle, PixelParticle } from "./types";

// Click particles system
export function spawnClickParticles(
  scene: THREE.Scene,
  position: THREE.Vector3,
  particles: Particle[],
  count: number = 10
) {
  const geometry = new THREE.SphereGeometry(0.08, 8, 8);

  for (let i = 0; i < count; i++) {
    const material = new THREE.MeshBasicMaterial({
      color: 0xff0000,
      transparent: true,
      opacity: 1,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.copy(position);

    const velocity = new THREE.Vector3(
      (Math.random() - 0.5) * 8,
      Math.random() * 6 + 2,
      (Math.random() - 0.5) * 8
    );

    scene.add(mesh);
    particles.push({
      mesh,
      velocity,
      startTime: performance.now(),
      lifetime: 500 + Math.random() * 300,
    });
  }
}

export function updateClickParticles(
  scene: THREE.Scene,
  particles: Particle[],
  delta: number
): Particle[] {
  const now = performance.now();

  return particles.filter(particle => {
    const elapsed = now - particle.startTime;
    const t = Math.min(elapsed / particle.lifetime, 1);

    if (t >= 1) {
      scene.remove(particle.mesh);
      particle.mesh.geometry.dispose();
      (particle.mesh.material as THREE.Material).dispose();
      return false;
    }

    // Update position with gravity
    particle.velocity.y -= delta * 15;
    particle.mesh.position.add(particle.velocity.clone().multiplyScalar(delta));

    // Fade out
    (particle.mesh.material as THREE.MeshBasicMaterial).opacity = 1 - t;

    return true;
  });
}

// Pixel particle system (for beam animation)
export function createPixelParticleSystem() {
  const pixelParticles: PixelParticle[] = [];
  const pixelGeometry = new THREE.PlaneGeometry(0.15, 0.15);

  function spawnBeamParticle(scene: THREE.Scene) {
    const mat = new THREE.MeshBasicMaterial({
      color: 0xff0000,
      transparent: true,
      opacity: 1,
      side: THREE.DoubleSide,
    });
    const pixel = new THREE.Mesh(pixelGeometry, mat);

    // Spawn along the beam height
    const y = Math.random() * 30 + 5;
    const angle = Math.random() * Math.PI * 2;
    const radius = 1 + Math.random() * 2;
    pixel.position.set(Math.cos(angle) * radius, y, Math.sin(angle) * radius);

    // Velocity outward to sides
    const speed = 3 + Math.random() * 4;
    const velocity = new THREE.Vector3(
      Math.cos(angle) * speed,
      (Math.random() - 0.5) * 2,
      Math.sin(angle) * speed
    );

    pixel.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, 0);
    scene.add(pixel);

    pixelParticles.push({
      mesh: pixel,
      velocity,
      life: 0,
      maxLife: 800 + Math.random() * 400,
    });
  }

  function spawnMechaParticle(scene: THREE.Scene, mechaPosition: THREE.Vector3) {
    const mat = new THREE.MeshBasicMaterial({
      color: Math.random() > 0.3 ? 0xff0000 : 0xff4444,
      transparent: true,
      opacity: 1,
      side: THREE.DoubleSide,
    });
    const pixel = new THREE.Mesh(pixelGeometry, mat);

    // Spawn around mecha position
    const offset = 1.5;
    pixel.position.set(
      mechaPosition.x + (Math.random() - 0.5) * offset,
      mechaPosition.y + Math.random() * 2,
      mechaPosition.z + (Math.random() - 0.5) * offset
    );

    // Velocity upward
    const velocity = new THREE.Vector3(
      (Math.random() - 0.5) * 2,
      4 + Math.random() * 3,
      (Math.random() - 0.5) * 2
    );

    pixel.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, 0);
    scene.add(pixel);

    pixelParticles.push({
      mesh: pixel,
      velocity,
      life: 0,
      maxLife: 600 + Math.random() * 400,
    });
  }

  function updateParticles(scene: THREE.Scene, delta: number) {
    for (let i = pixelParticles.length - 1; i >= 0; i--) {
      const p = pixelParticles[i];
      p.life += delta;

      // Update position
      p.mesh.position.add(p.velocity.clone().multiplyScalar(delta * 0.001));

      // Slow down
      p.velocity.multiplyScalar(0.98);

      // Fade out
      const lifeRatio = p.life / p.maxLife;
      (p.mesh.material as THREE.MeshBasicMaterial).opacity = 1 - lifeRatio;

      // Scale down slightly
      const scale = 1 - lifeRatio * 0.5;
      p.mesh.scale.set(scale, scale, scale);

      // Remove dead particles
      if (p.life >= p.maxLife) {
        scene.remove(p.mesh);
        (p.mesh.material as THREE.Material).dispose();
        pixelParticles.splice(i, 1);
      }
    }
  }

  function cleanup(scene: THREE.Scene) {
    for (const p of pixelParticles) {
      scene.remove(p.mesh);
      (p.mesh.material as THREE.Material).dispose();
    }
    pixelParticles.length = 0;
    pixelGeometry.dispose();
  }

  function getParticles() {
    return pixelParticles;
  }

  return {
    spawnBeamParticle,
    spawnMechaParticle,
    updateParticles,
    cleanup,
    getParticles,
  };
}
