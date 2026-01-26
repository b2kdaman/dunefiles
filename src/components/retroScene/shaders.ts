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

export function createFogShader() {
  return {
    uniforms: {
      fogColor: { value: new THREE.Color(0x3a0808) },
      time: { value: 0 },
      layerHeight: { value: 0.0 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vWorldPosition;
      varying vec2 vUv;
      varying float vHeight;
      void main() {
        vUv = uv;
        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
        vWorldPosition = worldPosition.xyz;
        vHeight = position.z; // Local Z becomes height in rotated plane
        gl_Position = projectionMatrix * viewMatrix * worldPosition;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 fogColor;
      uniform float time;
      uniform float layerHeight;
      varying vec3 vWorldPosition;
      varying vec2 vUv;
      varying float vHeight;

      float hash(vec2 p) {
        vec3 p3 = fract(vec3(p.xyx) * 0.13);
        p3 += dot(p3, p3.yzx + 3.333);
        return fract((p3.x + p3.y) * p3.z);
      }

      float noise(vec2 x) {
        vec2 i = floor(x);
        vec2 f = fract(x);
        float a = hash(i);
        float b = hash(i + vec2(1.0, 0.0));
        float c = hash(i + vec2(0.0, 1.0));
        float d = hash(i + vec2(1.0, 1.0));
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
      }

      float fbm(vec2 p) {
        float value = 0.0;
        float amplitude = 0.5;
        float frequency = 1.0;
        for(int i = 0; i < 5; i++) {
          value += amplitude * noise(p * frequency);
          frequency *= 2.0;
          amplitude *= 0.5;
        }
        return value;
      }

      void main() {
        // Distance from center
        float dist = length(vWorldPosition.xz) / 18.0;

        // Animated noise for smoke
        vec2 fogUv1 = vUv * 2.5 + vec2(time * 0.012, time * 0.008) + layerHeight * 0.5;
        vec2 fogUv2 = vUv * 3.5 - vec2(time * 0.018, time * 0.012) + layerHeight * 0.3;
        float noiseValue1 = fbm(fogUv1);
        float noiseValue2 = fbm(fogUv2);
        float combinedNoise = (noiseValue1 * 0.6 + noiseValue2 * 0.4);

        // Wispy smoke patterns with threshold
        float smokeDensity = smoothstep(0.3, 0.7, combinedNoise);

        // Distance falloff
        float distFactor = 1.0 - smoothstep(0.2, 1.0, dist);

        // Vertical gradient - denser at bottom, fades to top
        float heightGradient = 1.0 - (vHeight / 3.0 + 0.5);
        heightGradient = clamp(pow(heightGradient, 1.2), 0.0, 1.0);

        // Combine all factors
        float alpha = smokeDensity * distFactor * heightGradient;

        // Red glow with gradient
        vec3 glowColor = mix(fogColor, vec3(0.5, 0.08, 0.08), heightGradient * 0.6);

        gl_FragColor = vec4(glowColor, alpha * 0.6);
      }
    `,
  };
}

export function createInfiniteGridShader() {
  return {
    uniforms: {
      gridColor: { value: new THREE.Color(0xff0000) },
      gridSize: { value: 1.5 },
      fadeDistance: { value: 25.0 },
      opacity: { value: 0.4 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vWorldPosition;
      void main() {
        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
        vWorldPosition = worldPosition.xyz;
        gl_Position = projectionMatrix * viewMatrix * worldPosition;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 gridColor;
      uniform float gridSize;
      uniform float fadeDistance;
      uniform float opacity;
      varying vec3 vWorldPosition;

      float getGrid(vec2 pos, float scale) {
        vec2 coord = pos / scale;
        vec2 grid = abs(fract(coord - 0.5) - 0.5) / fwidth(coord);
        float line = min(grid.x, grid.y);
        return 1.0 - min(line, 1.0);
      }

      void main() {
        // Distance from camera for fade
        float dist = length(vWorldPosition.xz);
        float fadeFactor = 1.0 - smoothstep(fadeDistance * 0.5, fadeDistance, dist);

        // Get grid lines
        float grid1 = getGrid(vWorldPosition.xz, gridSize);
        float grid2 = getGrid(vWorldPosition.xz, gridSize * 5.0) * 0.5; // Larger grid, dimmer

        float gridValue = max(grid1, grid2);

        // Fade color to black with distance
        vec3 finalColor = mix(vec3(0.0), gridColor, fadeFactor);

        // Apply fade and opacity
        float finalAlpha = gridValue * fadeFactor * opacity;

        gl_FragColor = vec4(finalColor, finalAlpha);
      }
    `,
  };
}
