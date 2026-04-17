import { useEffect, useRef } from 'react';
import * as THREE from 'three';

/**
 * Immersive hero scene — a sphere of particles that reacts to the mouse,
 * plus a thin glowing ring and subtle nebula shader on the background plane.
 *
 * Rendered into a fullscreen canvas that fills its parent.
 */
export default function HeroScene() {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;

    const parent = canvas.parentElement;
    const prefersReduced = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;

    const getSize = () => ({
      w: parent?.offsetWidth || window.innerWidth,
      h: parent?.offsetHeight || window.innerHeight,
    });

    const { w: initialW, h: initialH } = getSize();

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    renderer.setSize(initialW, initialH);
    renderer.setClearColor(0x000000, 0);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(55, initialW / initialH, 0.1, 200);
    camera.position.set(0, 0, 22);

    // ----- Background shader plane (soft gradient + animated noise) -----
    const bgGeo = new THREE.PlaneGeometry(120, 80);
    const bgMat = new THREE.ShaderMaterial({
      transparent: true,
      uniforms: {
        u_time: { value: 0 },
        u_color_a: { value: new THREE.Color('#051034') },
        u_color_b: { value: new THREE.Color('#0a1b4f') },
        u_color_accent: { value: new THREE.Color('#3a8dff') },
      },
      vertexShader: `
        varying vec2 v_uv;
        void main() {
          v_uv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        varying vec2 v_uv;
        uniform float u_time;
        uniform vec3 u_color_a;
        uniform vec3 u_color_b;
        uniform vec3 u_color_accent;

        float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float noise(vec2 p) {
          vec2 i = floor(p); vec2 f = fract(p);
          float a = hash(i);
          float b = hash(i + vec2(1.0, 0.0));
          float c = hash(i + vec2(0.0, 1.0));
          float d = hash(i + vec2(1.0, 1.0));
          vec2 u = f * f * (3.0 - 2.0 * f);
          return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
        }

        void main() {
          vec2 uv = v_uv;
          float n = noise(uv * 3.0 + u_time * 0.05);
          vec3 grad = mix(u_color_a, u_color_b, uv.y + n * 0.25);
          float spot = smoothstep(0.9, 0.0, distance(uv, vec2(0.5, 0.55)));
          grad += u_color_accent * spot * 0.35;
          float alpha = 0.85;
          gl_FragColor = vec4(grad, alpha);
        }
      `,
    });
    const bg = new THREE.Mesh(bgGeo, bgMat);
    bg.position.z = -20;
    scene.add(bg);

    // ----- Particle sphere -----
    const particleCount = prefersReduced ? 600 : Math.min(2400, Math.round(initialW * initialH / 900));
    const positions = new Float32Array(particleCount * 3);
    const basePositions = new Float32Array(particleCount * 3);
    const rands = new Float32Array(particleCount);

    for (let i = 0; i < particleCount; i++) {
      const phi = Math.acos(2 * Math.random() - 1);
      const theta = Math.random() * Math.PI * 2;
      const r = 8 + Math.random() * 1.4;
      const x = r * Math.sin(phi) * Math.cos(theta);
      const y = r * Math.sin(phi) * Math.sin(theta);
      const z = r * Math.cos(phi);
      positions[i * 3] = basePositions[i * 3] = x;
      positions[i * 3 + 1] = basePositions[i * 3 + 1] = y;
      positions[i * 3 + 2] = basePositions[i * 3 + 2] = z;
      rands[i] = Math.random();
    }

    const pGeo = new THREE.BufferGeometry();
    pGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    pGeo.setAttribute('a_rand', new THREE.BufferAttribute(rands, 1));

    const pMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        u_time: { value: 0 },
        u_size: { value: 2.4 * Math.min(window.devicePixelRatio, 1.75) },
        u_color_core: { value: new THREE.Color('#ffffff') },
        u_color_edge: { value: new THREE.Color('#3a8dff') },
      },
      vertexShader: `
        attribute float a_rand;
        uniform float u_time;
        uniform float u_size;
        varying float v_rand;
        varying float v_depth;
        void main() {
          v_rand = a_rand;
          vec3 p = position;
          float wobble = sin(u_time * 0.7 + a_rand * 6.28) * 0.15;
          p *= 1.0 + wobble * 0.02;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          v_depth = -mv.z;
          gl_PointSize = u_size * (1.2 + a_rand * 1.6) * (18.0 / -mv.z);
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: `
        uniform vec3 u_color_core;
        uniform vec3 u_color_edge;
        varying float v_rand;
        varying float v_depth;
        void main() {
          float d = length(gl_PointCoord - vec2(0.5));
          if (d > 0.5) discard;
          float fall = 1.0 - smoothstep(0.0, 0.5, d);
          vec3 col = mix(u_color_edge, u_color_core, fall);
          float depthFade = smoothstep(35.0, 15.0, v_depth);
          float alpha = fall * (0.55 + v_rand * 0.45) * depthFade;
          gl_FragColor = vec4(col, alpha);
        }
      `,
    });

    const points = new THREE.Points(pGeo, pMat);
    scene.add(points);

    // ----- Thin glowing ring -----
    const ringGeo = new THREE.TorusGeometry(10, 0.035, 24, 200);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x3a8dff,
      transparent: true,
      opacity: 0.35,
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = Math.PI / 2.8;
    scene.add(ring);

    const ringOuterGeo = new THREE.TorusGeometry(12, 0.02, 24, 200);
    const ringOuterMat = new THREE.MeshBasicMaterial({
      color: 0x5ad38c,
      transparent: true,
      opacity: 0.18,
    });
    const ringOuter = new THREE.Mesh(ringOuterGeo, ringOuterMat);
    ringOuter.rotation.x = Math.PI / 3.1;
    ringOuter.rotation.z = 0.3;
    scene.add(ringOuter);

    // ----- Mouse interaction -----
    const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
    const handleMove = (e) => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.tx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.ty = -(((e.clientY - rect.top) / rect.height) * 2 - 1);
    };
    window.addEventListener('pointermove', handleMove);

    // ----- Animation loop -----
    const clock = new THREE.Clock();
    let raf;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const t = clock.getElapsedTime();

      pointer.x += (pointer.tx - pointer.x) * 0.05;
      pointer.y += (pointer.ty - pointer.y) * 0.05;

      points.rotation.y = t * 0.08 + pointer.x * 0.4;
      points.rotation.x = Math.sin(t * 0.2) * 0.08 + pointer.y * 0.25;

      ring.rotation.z = t * 0.12;
      ringOuter.rotation.z = -t * 0.07;

      camera.position.x += (pointer.x * 1.2 - camera.position.x) * 0.04;
      camera.position.y += (pointer.y * 0.8 - camera.position.y) * 0.04;
      camera.lookAt(0, 0, 0);

      pMat.uniforms.u_time.value = t;
      bgMat.uniforms.u_time.value = t;

      renderer.render(scene, camera);
    };
    raf = requestAnimationFrame(loop);

    // ----- Resize -----
    const ro = new ResizeObserver(() => {
      const { w, h } = getSize();
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    });
    if (parent) ro.observe(parent);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('pointermove', handleMove);
      ro.disconnect();
      pGeo.dispose();
      pMat.dispose();
      bgGeo.dispose();
      bgMat.dispose();
      ringGeo.dispose();
      ringMat.dispose();
      ringOuterGeo.dispose();
      ringOuterMat.dispose();
      renderer.dispose();
    };
  }, []);

  return <canvas ref={canvasRef} className="lv2-hero-canvas" aria-hidden="true" />;
}
