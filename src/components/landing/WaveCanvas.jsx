import { useEffect, useRef } from 'react';
import * as THREE from 'three';

/**
 * Three.js wave particle animation — ported from landing_aimlead.html
 * Renders a grid of particles animated with a sinusoidal wave shader.
 * Props:
 *   color    {string} hex color for particles e.g. '#3A8DFF'
 *   speed    {number} wave speed multiplier (default 1.8)
 *   intensity {number} wave frequency multiplier (default 6.0)
 */
export default function WaveCanvas({ color = '#ffffff', speed = 1.8, intensity = 6.0 }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const card = canvas.parentElement;
    const w = card.offsetWidth || 300;
    const h = card.offsetHeight || 200;

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(w, h);
    renderer.setClearColor(0x000000, 0);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(60, w / h, 1, 1000);
    camera.position.set(0, 0, 12);

    // Particle grid
    const gridW = 320, gridD = 200, step = 6;
    const positions = [];
    for (let x = 0; x < gridW; x += step)
      for (let z = 0; z < gridD; z += step)
        positions.push(-gridW / 2 + x, -20, -gridD / 2 + z);

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));

    const spd = speed.toFixed(1);
    const itx = intensity.toFixed(1);

    const mat = new THREE.ShaderMaterial({
      transparent: true,
      uniforms: {
        u_time: { value: 0 },
        u_color: { value: new THREE.Color(color) },
        u_size: { value: 1.8 * Math.min(window.devicePixelRatio, 2) },
      },
      vertexShader: `
        #define PI 3.14159265358979
        uniform float u_time;
        uniform float u_size;
        void main(){
          vec3 p = position;
          p.y += (cos(p.x/PI*${itx}+u_time*${spd}) + sin(p.z/PI*${itx}+u_time*${spd})) * 1.0;
          gl_PointSize = u_size;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(p,1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 u_color;
        void main(){
          float d = length(gl_PointCoord - vec2(.5));
          if(d > .5) discard;
          gl_FragColor = vec4(u_color, 1.0 - d * 1.2);
        }
      `,
    });

    const points = new THREE.Points(geo, mat);
    scene.add(points);

    const clock = new THREE.Clock();
    let raf;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      mat.uniforms.u_time.value = clock.getElapsedTime();
      renderer.render(scene, camera);
    };
    loop();

    const ro = new ResizeObserver(() => {
      const nw = card.offsetWidth;
      const nh = card.offsetHeight;
      camera.aspect = nw / nh;
      camera.updateProjectionMatrix();
      renderer.setSize(nw, nh);
    });
    ro.observe(card);

    return () => {
      cancelAnimationFrame(raf);
      renderer.dispose();
      geo.dispose();
      mat.dispose();
      ro.disconnect();
    };
  }, [color, speed, intensity]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        opacity: 0.22,
        pointerEvents: 'none',
        zIndex: 0,
        borderRadius: 18,
      }}
    />
  );
}
