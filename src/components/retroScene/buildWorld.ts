import * as THREE from "three";
import { createFogShader, createInfiniteGridShader } from "./shaders";
import { getCurrentThemePalette } from "../../theme";

type BuildWorldOptions = {
  scene: THREE.Scene;
  groundY: number;
};

export type WorldVisuals = {
  plane: THREE.Mesh;
  planeGeometry: THREE.PlaneGeometry;
  planeMaterial: THREE.MeshStandardMaterial;
  fogLayers: THREE.Mesh[];
  infiniteGrid: THREE.Mesh;
  gridGeometry: THREE.PlaneGeometry;
  gridMaterial: THREE.ShaderMaterial;
};

export function buildWorld({ scene, groundY }: BuildWorldOptions): WorldVisuals {
  const palette = getCurrentThemePalette();
  scene.add(new THREE.AmbientLight(palette.dimHex, 0.4));

  const key = new THREE.DirectionalLight(palette.accentHex, 2.0);
  key.position.set(3, 6, 2);
  key.castShadow = true;
  key.shadow.mapSize.width = 1024;
  key.shadow.mapSize.height = 1024;
  key.shadow.camera.near = 0.5;
  key.shadow.camera.far = 20;
  key.shadow.camera.left = -10;
  key.shadow.camera.right = 10;
  key.shadow.camera.top = 10;
  key.shadow.camera.bottom = -10;
  scene.add(key);

  const rim = new THREE.DirectionalLight(palette.primaryHex, 0.8);
  rim.position.set(-5, 2, -6);
  scene.add(rim);

  const pointLight = new THREE.PointLight(palette.primaryHex, 1.5, 20);
  pointLight.position.set(0, 3, 0);
  scene.add(pointLight);

  const planeGeometry = new THREE.PlaneGeometry(30, 30, 1, 1);
  const planeMaterial = new THREE.MeshStandardMaterial({ color: palette.planeHex, roughness: 0.98, metalness: 0.02 });
  const plane = new THREE.Mesh(planeGeometry, planeMaterial);
  plane.rotation.x = -Math.PI / 2;
  plane.position.y = groundY;
  plane.receiveShadow = true;
  scene.add(plane);

  const fogShader = createFogShader();
  const fogLayers: THREE.Mesh[] = [];
  for (let i = 0; i < 3; i++) {
    const layerHeight = i * 0.6;
    const fogGeometry = new THREE.PlaneGeometry(40, 40, 48, 48);
    const positions = fogGeometry.attributes.position;
    for (let j = 0; j < positions.count; j++) {
      const z = positions.getZ(j);
      positions.setZ(j, z + (Math.random() - 0.5) * 0.3);
    }
    positions.needsUpdate = true;

    const fogMaterial = new THREE.ShaderMaterial({
      uniforms: {
        fogColor: { value: new THREE.Color(palette.fogHex) },
        time: { value: 0 },
        layerHeight: { value: layerHeight },
      },
      vertexShader: fogShader.vertexShader,
      fragmentShader: fogShader.fragmentShader,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });

    const fogPlane = new THREE.Mesh(fogGeometry, fogMaterial);
    fogPlane.rotation.x = -Math.PI / 2;
    fogPlane.position.y = -0.9 + layerHeight;
    fogPlane.userData = { ...fogPlane.userData, isFogLayer: true };
    scene.add(fogPlane);
    fogLayers.push(fogPlane);
  }

  const infiniteGridShader = createInfiniteGridShader();
  const gridGeometry = new THREE.PlaneGeometry(200, 200);
  const gridMaterial = new THREE.ShaderMaterial({
    uniforms: infiniteGridShader.uniforms,
    vertexShader: infiniteGridShader.vertexShader,
    fragmentShader: infiniteGridShader.fragmentShader,
    transparent: true,
    depthWrite: false,
  });
  const infiniteGrid = new THREE.Mesh(gridGeometry, gridMaterial);
  infiniteGrid.rotation.x = -Math.PI / 2;
  infiniteGrid.position.y = groundY + 0.005;
  scene.add(infiniteGrid);

  return {
    plane,
    planeGeometry,
    planeMaterial,
    fogLayers,
    infiniteGrid,
    gridGeometry,
    gridMaterial,
  };
}
