import type * as THREE from "three";

export function createBlendShader(bloomTexture: THREE.Texture) {
  return {
    uniforms: {
      tDiffuse: { value: null },
      bloomTexture: { value: bloomTexture },
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
}
