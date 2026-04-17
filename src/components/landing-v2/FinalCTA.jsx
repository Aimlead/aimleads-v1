import { useEffect, useRef } from 'react';
import * as THREE from 'three';

function OrbScene() {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const parent = canvas.parentElement;

    const getSize = () => ({
      w: parent?.offsetWidth || window.innerWidth,
      h: parent?.offsetHeight || 480,
    });
    const { w, h } = getSize();

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    renderer.setSize(w, h);
    renderer.setClearColor(0x000000, 0);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(50, w / h, 0.1, 100);
    camera.position.set(0, 0, 7);

    const sphereGeo = new THREE.SphereGeometry(1.8, 128, 128);
    const sphereMat = new THREE.ShaderMaterial({
      transparent: true,
      uniforms: {
        u_time: { value: 0 },
        u_a: { value: new THREE.Color('#3a8dff') },
        u_b: { value: new THREE.Color('#5ad38c') },
      },
      vertexShader: `
        uniform float u_time;
        varying vec3 v_normal;
        varying vec3 v_pos;

        // Classic 3D simplex noise (Ashima / Stefan Gustavson) — condensed
        vec3 mod289(vec3 x) { return x - floor(x * (1.0/289.0)) * 289.0; }
        vec4 mod289(vec4 x) { return x - floor(x * (1.0/289.0)) * 289.0; }
        vec4 permute(vec4 x) { return mod289(((x*34.0)+1.0)*x); }
        vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

        float snoise(vec3 v) {
          const vec2 C = vec2(1.0/6.0, 1.0/3.0);
          const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
          vec3 i = floor(v + dot(v, C.yyy));
          vec3 x0 = v - i + dot(i, C.xxx);
          vec3 g = step(x0.yzx, x0.xyz);
          vec3 l = 1.0 - g;
          vec3 i1 = min(g.xyz, l.zxy);
          vec3 i2 = max(g.xyz, l.zxy);
          vec3 x1 = x0 - i1 + C.xxx;
          vec3 x2 = x0 - i2 + C.yyy;
          vec3 x3 = x0 - D.yyy;
          i = mod289(i);
          vec4 p = permute(permute(permute(
            i.z + vec4(0.0, i1.z, i2.z, 1.0))
            + i.y + vec4(0.0, i1.y, i2.y, 1.0))
            + i.x + vec4(0.0, i1.x, i2.x, 1.0));
          float n_ = 0.142857142857;
          vec3 ns = n_ * D.wyz - D.xzx;
          vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
          vec4 x_ = floor(j * ns.z);
          vec4 y_ = floor(j - 7.0 * x_);
          vec4 x = x_ * ns.x + ns.yyyy;
          vec4 y = y_ * ns.x + ns.yyyy;
          vec4 h = 1.0 - abs(x) - abs(y);
          vec4 b0 = vec4(x.xy, y.xy);
          vec4 b1 = vec4(x.zw, y.zw);
          vec4 s0 = floor(b0)*2.0 + 1.0;
          vec4 s1 = floor(b1)*2.0 + 1.0;
          vec4 sh = -step(h, vec4(0.0));
          vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
          vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
          vec3 p0 = vec3(a0.xy, h.x);
          vec3 p1 = vec3(a0.zw, h.y);
          vec3 p2 = vec3(a1.xy, h.z);
          vec3 p3 = vec3(a1.zw, h.w);
          vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
          p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
          vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
          m = m * m;
          return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
        }

        void main() {
          vec3 p = position;
          float n = snoise(p * 1.2 + u_time * 0.25);
          p += normal * n * 0.25;
          v_normal = normalize(normalMatrix * normal);
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          v_pos = mv.xyz;
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: `
        uniform vec3 u_a;
        uniform vec3 u_b;
        uniform float u_time;
        varying vec3 v_normal;
        varying vec3 v_pos;

        void main() {
          float fresnel = pow(1.0 - abs(dot(normalize(v_normal), normalize(-v_pos))), 2.5);
          float pulse = 0.5 + 0.5 * sin(u_time * 0.8);
          vec3 col = mix(u_a, u_b, fresnel * (0.8 + 0.4 * pulse));
          float alpha = 0.35 + fresnel * 0.9;
          gl_FragColor = vec4(col, alpha);
        }
      `,
    });
    const sphere = new THREE.Mesh(sphereGeo, sphereMat);
    scene.add(sphere);

    // Outer halo ring
    const haloGeo = new THREE.TorusGeometry(2.6, 0.018, 16, 180);
    const haloMat = new THREE.MeshBasicMaterial({ color: 0x3a8dff, transparent: true, opacity: 0.4 });
    const halo = new THREE.Mesh(haloGeo, haloMat);
    halo.rotation.x = Math.PI / 2.6;
    scene.add(halo);

    const clock = new THREE.Clock();
    let raf;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const t = clock.getElapsedTime();
      sphereMat.uniforms.u_time.value = t;
      sphere.rotation.y = t * 0.25;
      sphere.rotation.x = Math.sin(t * 0.3) * 0.15;
      halo.rotation.z = t * 0.35;
      renderer.render(scene, camera);
    };
    raf = requestAnimationFrame(loop);

    const ro = new ResizeObserver(() => {
      const { w: nw, h: nh } = getSize();
      camera.aspect = nw / nh;
      camera.updateProjectionMatrix();
      renderer.setSize(nw, nh);
    });
    if (parent) ro.observe(parent);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      sphereGeo.dispose();
      sphereMat.dispose();
      haloGeo.dispose();
      haloMat.dispose();
      renderer.dispose();
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="lv2-final-canvas"
      aria-hidden="true"
    />
  );
}

export default function FinalCTA({ onOpenBooking }) {
  return (
    <section className="lv2-final" aria-label="Appel à l'action final">
      <OrbScene />
      <div className="lv2-final-inner">
        <span className="lv2-eyebrow">
          <span className="lv2-eyebrow-dot" />
          <span>Prêt à accélérer ?</span>
        </span>
        <h2 className="lv2-h2">
          Votre IA commerciale <span className="lv2-h1-gradient">démarre lundi prochain</span>.
        </h2>
        <p className="lv2-sub">
          Audit offert de 30 minutes. On cartographie votre pipeline, on identifie les 3 leviers IA
          à plus fort ROI, et on vous envoie un plan chiffré sous 48h.
        </p>
        <div className="lv2-hero-ctas">
          <button type="button" className="lv2-btn lv2-btn-primary lv2-btn-lg" onClick={onOpenBooking}>
            <span>Réserver mon audit</span>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="5" y1="12" x2="19" y2="12" />
              <polyline points="12 5 19 12 12 19" />
            </svg>
          </button>
        </div>
      </div>
    </section>
  );
}
