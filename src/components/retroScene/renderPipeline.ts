import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { DitherPixelShader } from "./shaders";

type RenderPipeline = {
  composer: EffectComposer;
  bloomComposer: EffectComposer;
  bloomPass: UnrealBloomPass;
  blendPass: ShaderPass;
  ditherPass: ShaderPass;
  bloomLayer: THREE.Layers;
  darkenNonBloomed: (obj: THREE.Object3D) => void;
  restoreMaterial: (obj: THREE.Object3D) => void;
  setSize: (width: number, height: number) => void;
};

export function createRenderPipeline(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
  bloomLayerId: number
): RenderPipeline {
  const bloomLayer = new THREE.Layers();
  bloomLayer.set(bloomLayerId);
  const darkMaterial = new THREE.MeshBasicMaterial({ color: 0x000000 });
  const materials: Map<string, THREE.Material | THREE.Material[]> = new Map();

  function darkenNonBloomed(obj: THREE.Object3D) {
    if ((obj as THREE.Mesh).isMesh && !bloomLayer.test(obj.layers)) {
      const mesh = obj as THREE.Mesh;
      materials.set(mesh.uuid, mesh.material);
      mesh.material = darkMaterial;
    }
  }

  function restoreMaterial(obj: THREE.Object3D) {
    if ((obj as THREE.Mesh).isMesh) {
      const mesh = obj as THREE.Mesh;
      const cached = materials.get(mesh.uuid);
      if (cached) {
        mesh.material = cached;
        materials.delete(mesh.uuid);
      }
    }
  }

  const renderScene = new RenderPass(scene, camera);
  const bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 3.0, 0.15, 0.0);
  const bloomComposer = new EffectComposer(renderer);
  bloomComposer.renderToScreen = false;
  bloomComposer.addPass(renderScene);
  bloomComposer.addPass(bloomPass);

  const BlendShader = {
    uniforms: {
      tDiffuse: { value: null },
      bloomTexture: { value: bloomComposer.renderTarget2.texture },
      bloomIntensity: { value: 0.0 },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D tDiffuse;
      uniform sampler2D bloomTexture;
      uniform float bloomIntensity;
      varying vec2 vUv;
      void main() {
        vec4 base = texture2D(tDiffuse, vUv);
        vec4 bloom = texture2D(bloomTexture, vUv);
        gl_FragColor = base + bloom * bloomIntensity;
      }
    `,
  };

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const blendPass = new ShaderPass(BlendShader);
  blendPass.needsSwap = true;
  composer.addPass(blendPass);

  const ditherPass = new ShaderPass(DitherPixelShader);
  composer.addPass(ditherPass);

  const setSize = (width: number, height: number) => {
    composer.setSize(width, height);
    bloomComposer.setSize(width, height);
    bloomPass.resolution.set(width, height);
    ditherPass.uniforms.resolution.value.set(width, height);
  };

  return {
    composer,
    bloomComposer,
    bloomPass,
    blendPass,
    ditherPass,
    bloomLayer,
    darkenNonBloomed,
    restoreMaterial,
    setSize,
  };
}
