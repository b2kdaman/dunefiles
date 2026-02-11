import * as THREE from "three";
import { getCurrentThemePalette } from "../../theme";

const palette = getCurrentThemePalette();

export const InfiniteGridShader = {
  uniforms: {
    gridColor: { value: new THREE.Color(palette.primaryHex) },
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
