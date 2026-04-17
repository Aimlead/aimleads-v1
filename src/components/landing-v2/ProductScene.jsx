import { useEffect, useRef } from 'react';
import * as THREE from 'three';

/**
 * Mini 3D scene embedded in a product showcase card.
 * Variant determines the geometry:
 *   - 'grid'    : 3D scoring grid (Lead-Scoreur)
 *   - 'orbit'   : Rotating torus/particle orbit (BDR Automatisé)
 *   - 'icosa'   : Wireframe icosahedron + inner glow (Conseil)
 */
export default function ProductScene({ variant = 'grid', color = '#3a8dff' }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const parent = canvas.parentElement;
    if (!parent) return undefined;

    const getSize = () => ({
      w: parent.offsetWidth || 400,
      h: parent.offsetHeight || 400,
    });
    const { w: initialW, h: initialH } = getSize();

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    renderer.setSize(initialW, initialH);
    renderer.setClearColor(0x000000, 0);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, initialW / initialH, 0.1, 200);
    camera.position.set(0, 0, 9);

    const accent = new THREE.Color(color);

    const disposables = [];
    let updateScene = () => {};

    if (variant === 'grid') {
      // Lead-Scoreur: 3D scoring grid — columns of different heights colored by score
      const group = new THREE.Group();
      const cols = 9, rows = 9;
      const spacing = 0.55;
      const cubes = [];
      const baseHeights = [];
      for (let x = 0; x < cols; x++) {
        for (let z = 0; z < rows; z++) {
          const dx = (x - (cols - 1) / 2) * spacing;
          const dz = (z - (rows - 1) / 2) * spacing;
          const dist = Math.sqrt(dx * dx + dz * dz);
          const baseH = 0.3 + Math.max(0, 1.8 - dist * 0.45) + Math.random() * 0.5;
          baseHeights.push(baseH);
          const geo = new THREE.BoxGeometry(0.32, baseH, 0.32);
          const scoreT = Math.max(0, Math.min(1, (baseH - 0.3) / 2));
          const col = new THREE.Color().lerpColors(new THREE.Color('#1a2550'), accent, scoreT);
          const mat = new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.85 });
          const cube = new THREE.Mesh(geo, mat);
          cube.position.set(dx, baseH / 2 - 0.8, dz);
          group.add(cube);
          cubes.push({ mesh: cube, mat, geo, baseH, phase: Math.random() * Math.PI * 2 });
          disposables.push(geo, mat);
        }
      }
      group.rotation.x = -0.45;
      scene.add(group);

      updateScene = (t) => {
        group.rotation.y = t * 0.25;
        for (const c of cubes) {
          const pulse = 0.9 + Math.sin(t * 1.2 + c.phase) * 0.15;
          c.mesh.scale.y = pulse;
          c.mesh.position.y = (c.baseH * pulse) / 2 - 0.8;
        }
      };
    } else if (variant === 'orbit') {
      // BDR: central node + orbiting particles (24/7 automated outreach)
      const group = new THREE.Group();

      const coreGeo = new THREE.IcosahedronGeometry(1.2, 1);
      const coreMat = new THREE.MeshBasicMaterial({ color: accent, wireframe: true, transparent: true, opacity: 0.65 });
      const core = new THREE.Mesh(coreGeo, coreMat);
      group.add(core);
      disposables.push(coreGeo, coreMat);

      const particleN = 260;
      const positions = new Float32Array(particleN * 3);
      const orbits = [];
      for (let i = 0; i < particleN; i++) {
        const r = 2.2 + Math.random() * 1.8;
        const theta = Math.random() * Math.PI * 2;
        const inclination = (Math.random() - 0.5) * 0.8;
        orbits.push({ r, theta, inclination, speed: 0.4 + Math.random() * 0.8 });
        positions[i * 3] = Math.cos(theta) * r;
        positions[i * 3 + 1] = inclination * r;
        positions[i * 3 + 2] = Math.sin(theta) * r;
      }
      const pGeo = new THREE.BufferGeometry();
      pGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      const pMat = new THREE.PointsMaterial({
        color: accent,
        size: 0.06,
        transparent: true,
        opacity: 0.9,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const particles = new THREE.Points(pGeo, pMat);
      group.add(particles);
      disposables.push(pGeo, pMat);

      // Orbit rings for depth
      [2.6, 3.4, 4.2].forEach((r, idx) => {
        const g = new THREE.TorusGeometry(r, 0.008, 12, 128);
        const m = new THREE.MeshBasicMaterial({ color: accent, transparent: true, opacity: 0.12 + idx * 0.04 });
        const t = new THREE.Mesh(g, m);
        t.rotation.x = Math.PI / 2 + (idx - 1) * 0.3;
        t.rotation.z = idx * 0.2;
        group.add(t);
        disposables.push(g, m);
      });

      scene.add(group);

      updateScene = (time) => {
        core.rotation.x = time * 0.3;
        core.rotation.y = time * 0.4;
        for (let i = 0; i < particleN; i++) {
          const o = orbits[i];
          const theta = o.theta + time * o.speed * 0.25;
          positions[i * 3] = Math.cos(theta) * o.r;
          positions[i * 3 + 1] = o.inclination * o.r + Math.sin(time * 0.8 + i) * 0.08;
          positions[i * 3 + 2] = Math.sin(theta) * o.r;
        }
        pGeo.attributes.position.needsUpdate = true;
        group.rotation.y = time * 0.12;
      };
    } else {
      // Conseil: wireframe icosahedron with inner core glow
      const group = new THREE.Group();

      const outerGeo = new THREE.IcosahedronGeometry(2.6, 1);
      const outerMat = new THREE.MeshBasicMaterial({
        color: accent,
        wireframe: true,
        transparent: true,
        opacity: 0.7,
      });
      const outer = new THREE.Mesh(outerGeo, outerMat);
      group.add(outer);
      disposables.push(outerGeo, outerMat);

      const innerGeo = new THREE.IcosahedronGeometry(1.4, 2);
      const innerMat = new THREE.ShaderMaterial({
        transparent: true,
        uniforms: {
          u_time: { value: 0 },
          u_color: { value: accent },
        },
        vertexShader: `
          varying vec3 v_normal;
          void main() {
            v_normal = normalize(normalMatrix * normal);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: `
          uniform float u_time;
          uniform vec3 u_color;
          varying vec3 v_normal;
          void main() {
            float fresnel = pow(1.0 - abs(v_normal.z), 2.0);
            float pulse = 0.6 + 0.4 * sin(u_time * 1.2);
            gl_FragColor = vec4(u_color * (0.6 + fresnel * 1.5 * pulse), fresnel * 0.85);
          }
        `,
      });
      const inner = new THREE.Mesh(innerGeo, innerMat);
      group.add(inner);
      disposables.push(innerGeo, innerMat);

      // Floating satellites
      const sats = [];
      for (let i = 0; i < 5; i++) {
        const g = new THREE.SphereGeometry(0.1, 12, 12);
        const m = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 });
        const s = new THREE.Mesh(g, m);
        sats.push({ mesh: s, baseAngle: (i / 5) * Math.PI * 2, r: 3.6, speed: 0.4 + i * 0.1 });
        group.add(s);
        disposables.push(g, m);
      }

      scene.add(group);

      updateScene = (time) => {
        outer.rotation.x = time * 0.25;
        outer.rotation.y = time * 0.35;
        inner.rotation.x = -time * 0.4;
        inner.rotation.y = -time * 0.55;
        innerMat.uniforms.u_time.value = time;
        for (const s of sats) {
          const a = s.baseAngle + time * s.speed;
          s.mesh.position.set(
            Math.cos(a) * s.r,
            Math.sin(a * 1.3) * 0.8,
            Math.sin(a) * s.r,
          );
        }
        group.rotation.y = time * 0.08;
      };
    }

    const clock = new THREE.Clock();
    let raf;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const t = clock.getElapsedTime();
      updateScene(t);
      renderer.render(scene, camera);
    };
    raf = requestAnimationFrame(loop);

    const ro = new ResizeObserver(() => {
      const { w, h } = getSize();
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    });
    ro.observe(parent);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      disposables.forEach((d) => d.dispose?.());
      renderer.dispose();
    };
  }, [variant, color]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        display: 'block',
      }}
      aria-hidden="true"
    />
  );
}
