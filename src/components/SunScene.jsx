import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';

// ---------------------------------------------------------------------------
// MENSAJE DE LA CONSOLA DE INICIO
// El señor pidió este texto EXACTO (7 líneas). Se edita aquí y ya.
// ---------------------------------------------------------------------------
const CONSOLE_LINES = [
  '> TAL VEZ NO PUDE REGALARTE UN RAMO DE FLORES,',
  '> PERO LO QUE SÍ PUEDO REGALARTE',
  '> ES UN UNIVERSO ENTERO DE FLORES.',
  '> TE QUIERO MUCHÍSIMO',
  '',
  '> ........',
];

const TYPE_SPEED_MIN = 14; // ms por carácter
const TYPE_SPEED_MAX = 45;
const END_DELAY = 1600;    // pausa tras el último carácter antes de bajar

// ---------------------------------------------------------------------------
// UNIVERSO DE FLORES: una flor gigante (girasol 3D) en el centro y miles de
// mini flores amarillas en el fondo. Cero texturas externas, todo procedural.
// ---------------------------------------------------------------------------

// Sprite de una mini flor amarilla (la usa el fondo de estrellas/flores)
function makeFlowerTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, 128, 128);

  const cx = 64;
  const cy = 64;
  const petalLen = 26;

  // 6 pétalos (elipses amarillas) alrededor del centro
  for (let i = 0; i < 6; i++) {
    const angle = (i * Math.PI) / 3;
    ctx.save();
    ctx.translate(cx + Math.cos(angle) * 16, cy + Math.sin(angle) * 16);
    ctx.rotate(angle);
    ctx.fillStyle = '#ffd54a';
    ctx.beginPath();
    ctx.ellipse(0, 0, 9, petalLen, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // Centro de la mini flor
  const grad = ctx.createRadialGradient(cx - 3, cy - 3, 2, cx, cy, 14);
  grad.addColorStop(0, '#fff3b0');
  grad.addColorStop(0.6, '#ffc400');
  grad.addColorStop(1, '#d98f00');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(cx, cy, 11, 0, Math.PI * 2);
  ctx.fill();

  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}

// Resplandor suave (glow) generado en canvas
function makeGlowTexture(colorHex) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
  gradient.addColorStop(0, colorHex);
  gradient.addColorStop(0.3, colorHex.replace('1)', '0.6)'));
  gradient.addColorStop(1, colorHex.replace('1)', '0)'));
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 256, 256);
  return new THREE.CanvasTexture(canvas);
}

export default function SunScene() {
  const mountRef = useRef(null);

  // Estado de la consola de inicio
  const [typedLines, setTypedLines] = useState([]);
  const [currentLine, setCurrentLine] = useState('');
  const [lineIndex, setLineIndex] = useState(0);
  const [charIndex, setCharIndex] = useState(0);
  const [overlayDown, setOverlayDown] = useState(false);

  // --- Escena Three.js: FLOR GIGANTE + UNIVERSO DE FLORES ---
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x050208);

    const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 4000);
    camera.position.set(0, 6.5, 32);
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    mount.appendChild(renderer.domElement);

    // --- Luces: la flor necesita volumen para "sentirse" 3D ---
    const ambient = new THREE.AmbientLight(0xfff2dd, 0.5);
    scene.add(ambient);
    const keyLight = new THREE.DirectionalLight(0xfff7e0, 1.15);
    keyLight.position.set(6, 14, 10);
    scene.add(keyLight);
    const warm = new THREE.PointLight(0xffb300, 1.6, 90);
    warm.position.set(0, 0, 0);
    scene.add(warm);

    // ================= FLOR GIGANTE 3D (girasol) =================
    const flowerRoot = new THREE.Group();

    // Pétalos: dos anillos (interior erecto, exterior abierto)
    const petalMat = new THREE.MeshStandardMaterial({
      color: 0xffc400,
      roughness: 0.42,
      metalness: 0.02,
      emissive: 0x402600,
      emissiveIntensity: 0.35,
    });

    const layers = [
      { count: 10, radius: 3.4, scaleY: 1.6, tilt: -0.32, scaleX: 0.5 },  // anillo interior
      { count: 14, radius: 5.4, scaleY: 2.3, tilt: -0.95, scaleX: 0.62 }, // anillo exterior
    ];
    const ringGroup = new THREE.Group();
    layers.forEach((layer) => {
      for (let i = 0; i < layer.count; i++) {
        const slot = new THREE.Group();
        slot.rotation.y = (i * Math.PI * 2) / layer.count;

        const petalGeo = new THREE.SphereGeometry(1.6, 18, 18);
        petalGeo.scale(layer.scaleX, layer.scaleY, 1.0);
        const petal = new THREE.Mesh(petalGeo, petalMat);
        petal.position.set(layer.radius, 0.5, 0);
        petal.rotation.z = layer.tilt;
        petal.rotation.y = 0.08;
        slot.add(petal);
        ringGroup.add(slot);
      }
    });
    flowerRoot.add(ringGroup);

    // Centro tipo girasol: base + "semillas" en espiral
    const centerGeo = new THREE.SphereGeometry(2.35, 32, 32);
    const centerMat = new THREE.MeshStandardMaterial({
      color: 0x9c6b1e,
      roughness: 0.85,
      metalness: 0.0,
      emissive: 0x2a1a00,
      emissiveIntensity: 0.4,
    });
    const center = new THREE.Mesh(centerGeo, centerMat);
    flowerRoot.add(center);

    const seedGeo = new THREE.SphereGeometry(0.17, 8, 8);
    const seedMat = new THREE.MeshStandardMaterial({ color: 0x6b4a12, roughness: 0.9 });
    for (let i = 0; i < 110; i++) {
      const r = 2.15 * Math.sqrt(i / 110);
      const a = i * 2.399963; // ángulo dorado
      const seed = new THREE.Mesh(seedGeo, seedMat);
      const flat = 1 - r / 2.15;
      seed.position.set(
        Math.cos(a) * r,
        Math.sin(a) * r * 0.62,
        Math.sqrt(Math.max(0, 4.8 - r * r)) * 0.62 * flat
      );
      center.add(seed);
    }

    // Tallo verde y dos hojas (la flor "flota" pero se lee claramente como flor)
    const stemMat = new THREE.MeshStandardMaterial({ color: 0x2e7d32, roughness: 0.7 });
    const stemGeo = new THREE.CylinderGeometry(0.45, 0.85, 15, 12);
    const stem = new THREE.Mesh(stemGeo, stemMat);
    stem.position.y = -8.6;
    flowerRoot.add(stem);

    const leafMat = new THREE.MeshStandardMaterial({ color: 0x3f9e47, roughness: 0.65 });
    const leafGeo = new THREE.SphereGeometry(2.4, 12, 12);
    leafGeo.scale(1, 0.16, 0.62);
    const leafL = new THREE.Mesh(leafGeo, leafMat);
    leafL.position.set(-3.2, -12.4, 0);
    leafL.rotation.z = 0.55;
    flowerRoot.add(leafL);
    const leafR = leafL.clone();
    leafR.position.set(3.2, -12.4, 0);
    leafR.rotation.z = -0.55;
    flowerRoot.add(leafR);

    scene.add(flowerRoot);

    // Halo dorado que irradia de la flor
    const halo1 = new THREE.Sprite(new THREE.SpriteMaterial({
      map: makeGlowTexture('rgba(255, 190, 40, 1)'),
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      opacity: 0.85,
    }));
    halo1.scale.set(50, 50, 1);
    flowerRoot.add(halo1);

    const halo2 = new THREE.Sprite(new THREE.SpriteMaterial({
      map: makeGlowTexture('rgba(255, 235, 150, 1)'),
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      opacity: 0.4,
    }));
    halo2.scale.set(95, 95, 1);
    flowerRoot.add(halo2);

    // ============ UNIVERSO DE FONDO: mini flores amarillas ============
    const flowerTex = makeFlowerTexture();

    const makeFlowerField = (count, rMin, rMax, size, opacity) => {
      const positions = new Float32Array(count * 3);
      for (let i = 0; i < count; i++) {
        // dirección aleatoria uniforme en la esfera
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(2 * Math.random() - 1);
        const r = rMin + Math.random() * (rMax - rMin);
        positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
        positions[i * 3 + 1] = r * Math.cos(phi) * 0.7 + 2;
        positions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      const mat = new THREE.PointsMaterial({
        color: 0xffe066,
        size,
        map: flowerTex,
        transparent: true,
        alphaTest: 0.2,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        sizeAttenuation: true,
        opacity,
      });
      return new THREE.Points(geo, mat);
    };

    // Dos capas para dar profundidad
    const farFlowers = makeFlowerField(1500, 500, 1300, 30, 0.5);
    const nearFlowers = makeFlowerField(450, 260, 620, 62, 0.85);
    scene.add(farFlowers);
    scene.add(nearFlowers);

    // --- Bucle de animación: la flor gira lentísima, el universo deriva ---
    let frameId;
    const animate = () => {
      frameId = requestAnimationFrame(animate);
      ringGroup.rotation.y += 0.0016;   // pétalos girando
      center.rotation.y += 0.0016;
      flowerRoot.rotation.y = Math.sin(Date.now() * 0.0002) * 0.06; // balanceo sutil
      farFlowers.rotation.y -= 0.00008;
      nearFlowers.rotation.y += 0.00012;
      renderer.render(scene, camera);
    };
    animate();

    const onResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener('resize', onResize);

    return () => {
      cancelAnimationFrame(frameId);
      window.removeEventListener('resize', onResize);
      try {
        mount.removeChild(renderer.domElement);
        scene.traverse((obj) => {
          if (obj.geometry) obj.geometry.dispose();
          if (obj.material) {
            if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose());
            else obj.material.dispose();
          }
        });
        if (flowerTex) flowerTex.dispose();
        renderer.dispose();
      } catch (e) { /* limpieza segura */ }
    };
  }, []);

  // --- Efecto máquina de escribir de la consola ---
  useEffect(() => {
    if (lineIndex >= CONSOLE_LINES.length) {
      // Mensaje terminado: el timer baja el panel
      const t = setTimeout(() => setOverlayDown(true), END_DELAY);
      return () => clearTimeout(t);
    }

    const line = CONSOLE_LINES[lineIndex];
    if (charIndex < line.length) {
      const t = setTimeout(() => {
        setCharIndex(charIndex + 1);
        setCurrentLine(line.slice(0, charIndex + 1));
      }, TYPE_SPEED_MIN + Math.random() * (TYPE_SPEED_MAX - TYPE_SPEED_MIN));
      return () => clearTimeout(t);
    }

    // Línea completada: pasar a la siguiente
    const t = setTimeout(() => {
      setTypedLines((prev) => [...prev, line]);
      setCurrentLine('');
      setCharIndex(0);
      setLineIndex(lineIndex + 1);
    }, 300);
    return () => clearTimeout(t);
  }, [lineIndex, charIndex]);

  return (
    <div className="relative w-full h-screen bg-black overflow-hidden">
      {/* Universo de flores */}
      <div ref={mountRef} className="absolute inset-0 z-0" />

      {/* Consola de inicio: escribe como código real y BAJA al terminar */}
      <div
        className={`absolute inset-0 z-50 bg-black transition-transform ease-in-out ${overlayDown ? 'translate-y-full' : 'translate-y-0'}`}
        style={{ transitionDuration: '1200ms' }}
      >
        <div className="flex items-center justify-center w-full h-full">
          <div className="w-[min(92vw,760px)] mx-auto px-2">
            <pre
              className="text-[#ffd700] text-sm sm:text-base md:text-lg leading-loose whitespace-pre-wrap select-none"
              style={{
                fontFamily: "'Cascadia Code', 'Consolas', 'Courier New', monospace",
                textShadow: '0 0 14px rgba(255, 200, 0, 0.45)',
                letterSpacing: '0.02em',
              }}
            >
              {typedLines.map((l, i) => (
                <span key={i}>{l}{'\n'}</span>
              ))}
              <span>{currentLine}</span>
              <span className="animate-pulse">▌</span>
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
}