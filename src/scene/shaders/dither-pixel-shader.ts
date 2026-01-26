import * as THREE from "three";

export const DitherPixelShader = {
  uniforms: {
    tDiffuse: { value: null },
    resolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
    pixelSize: { value: 3.0 },
    ditherStrength: { value: 0.85 },
    gloom: { value: 0.12 },
    contrast: { value: 1.15 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform vec2 resolution;
    uniform float pixelSize;
    uniform float ditherStrength;
    uniform float gloom;
    uniform float contrast;
    varying vec2 vUv;

    float bayer4(vec2 p) {
      vec2 P = floor(mod(p, 4.0));
      float a = mod(P.x + P.y * 2.0, 4.0);
      float b = mod(P.x / 2.0 + P.y, 2.0);
      return (a * 4.0 + b) / 16.0 + 0.03125;
    }

    vec3 applyContrast(vec3 c, float k) {
      return (c - 0.5) * k + 0.5;
    }

    void main() {
      vec2 fragCoord = vUv * resolution;
      vec2 snapped = floor(fragCoord / pixelSize) * pixelSize;
      vec2 uv2 = (snapped + 0.5) / resolution;

      vec3 col = texture2D(tDiffuse, uv2).rgb;

      col = applyContrast(col, contrast);
      col *= (1.0 - gloom);

      float t = bayer4(snapped / pixelSize);

      float levels = 6.0;
      vec3 q = floor(col * levels + (t - 0.5) * ditherStrength) / levels;

      gl_FragColor = vec4(clamp(q, 0.0, 1.0), 1.0);
    }
  `,
};
