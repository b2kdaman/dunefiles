import * as THREE from "three";

export const FogShader = {
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
