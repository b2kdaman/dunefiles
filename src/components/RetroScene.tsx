import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import type { Settings } from "../types";

interface RetroSceneProps {
  settings: Settings;
  onRendererReady?: (renderer: THREE.WebGLRenderer) => void;
}

const DitherPixelShader = {
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

    // 4x4 Bayer matrix threshold (0..1)
    float bayer4(vec2 p) {
      int x = int(mod(p.x, 4.0));
      int y = int(mod(p.y, 4.0));
      int index = x + y * 4;

      int m[16];
      m[0]=0;  m[1]=8;  m[2]=2;  m[3]=10;
      m[4]=12; m[5]=4;  m[6]=14; m[7]=6;
      m[8]=3;  m[9]=11; m[10]=1; m[11]=9;
      m[12]=15;m[13]=7; m[14]=13;m[15]=5;

      return (float(m[index]) + 0.5) / 16.0;
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

export default function RetroScene({ settings, onRendererReady }: RetroSceneProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const ditherPassRef = useRef<ShaderPass | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    // Renderer
    const renderer = new THREE.WebGLRenderer({
      antialias: false,
      powerPreference: "high-performance",
      preserveDrawingBuffer: true,
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.8;
    containerRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;
    onRendererReady?.(renderer);

    // Scene
    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x05070a, 0.065);
    scene.background = new THREE.Color(0x05070a);

    // Camera
    const camera = new THREE.PerspectiveCamera(
      45,
      window.innerWidth / window.innerHeight,
      0.1,
      100
    );
    const r = 9.0;
    const pitch = THREE.MathUtils.degToRad(45);
    const yaw = THREE.MathUtils.degToRad(45);
    camera.position.set(
      r * Math.cos(pitch) * Math.cos(yaw),
      r * Math.sin(pitch),
      r * Math.cos(pitch) * Math.sin(yaw)
    );
    camera.lookAt(0, 0, 0);

    // Controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.target.set(0, 0, 0);
    controls.minDistance = 4;
    controls.maxDistance = 18;
    controls.maxPolarAngle = THREE.MathUtils.degToRad(80);

    // Lights
    scene.add(new THREE.AmbientLight(0x223344, 0.25));

    const key = new THREE.DirectionalLight(0xaabbd0, 0.55);
    key.position.set(3, 6, 2);
    scene.add(key);

    const rim = new THREE.DirectionalLight(0x445566, 0.25);
    rim.position.set(-5, 2, -6);
    scene.add(rim);

    // Ground plane
    const planeGeo = new THREE.PlaneGeometry(30, 30, 1, 1);
    const planeMat = new THREE.MeshStandardMaterial({
      color: 0x0b1117,
      roughness: 0.98,
      metalness: 0.02,
    });
    const plane = new THREE.Mesh(planeGeo, planeMat);
    plane.rotation.x = -Math.PI / 2;
    plane.position.y = -1.2;
    scene.add(plane);

    // Grid
    const grid = new THREE.GridHelper(30, 30, 0x0f1a22, 0x0a121a);
    grid.position.y = -1.19;
    (grid.material as THREE.Material).opacity = 0.35;
    (grid.material as THREE.Material).transparent = true;
    scene.add(grid);

    // Sphere
    const sphere = new THREE.Mesh(
      new THREE.SphereGeometry(1.1, 24, 16),
      new THREE.MeshStandardMaterial({
        color: 0x2a3a44,
        roughness: 0.65,
        metalness: 0.15,
      })
    );
    sphere.position.set(-1.8, -0.2, 0.3);
    scene.add(sphere);

    // Diamond (Octahedron)
    const diamond = new THREE.Mesh(
      new THREE.OctahedronGeometry(1.0, 0),
      new THREE.MeshStandardMaterial({
        color: 0x3a2f3f,
        roughness: 0.35,
        metalness: 0.25,
        emissive: 0x050006,
        emissiveIntensity: 0.35,
      })
    );
    diamond.position.set(1.8, -0.2, -0.6);
    scene.add(diamond);

    // Post-processing
    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));

    const ditherPass = new ShaderPass(DitherPixelShader);
    composer.addPass(ditherPass);
    ditherPassRef.current = ditherPass;

    // Animation
    const clock = new THREE.Clock();
    let animationId: number;

    function animate() {
      animationId = requestAnimationFrame(animate);
      const t = clock.getElapsedTime();

      controls.update();

      sphere.rotation.y = t * 0.35;
      diamond.rotation.y = -t * 0.55;
      diamond.rotation.x = t * 0.25;

      composer.render();
    }
    animate();

    // Resize handler
    function handleResize() {
      renderer.setSize(window.innerWidth, window.innerHeight);
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      composer.setSize(window.innerWidth, window.innerHeight);
      ditherPass.uniforms.resolution.value.set(
        window.innerWidth,
        window.innerHeight
      );
    }
    window.addEventListener("resize", handleResize);

    // Cleanup
    return () => {
      cancelAnimationFrame(animationId);
      window.removeEventListener("resize", handleResize);
      controls.dispose();
      renderer.dispose();
      containerRef.current?.removeChild(renderer.domElement);
    };
  }, [onRendererReady]);

  // Update shader uniforms when settings change
  useEffect(() => {
    if (ditherPassRef.current) {
      ditherPassRef.current.uniforms.pixelSize.value = settings.pixel_size;
      ditherPassRef.current.uniforms.ditherStrength.value = settings.dither_strength;
      ditherPassRef.current.uniforms.gloom.value = settings.gloom;
      ditherPassRef.current.uniforms.contrast.value = settings.contrast;
    }
  }, [settings]);

  return <div ref={containerRef} style={{ width: "100%", height: "100%" }} />;
}
