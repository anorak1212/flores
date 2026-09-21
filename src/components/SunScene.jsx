// ===========================================================================
// SUNFLOWER - "UNIVERSO DE FLORES" con estética RETRO (PC de los 80s/90s)
// - Flor girasol 3D procedural en el centro
// - Fondo: puntos amarillos (estrellas retro) + algunas flores
// - Render a baja resolución + 14 fps + scanlines => se ve "antiguo" a propósito
// - El usuario puede MOVER el universo con el ratón (OrbitControls)
// - Consola DOS al inicio con el mensaje definitivo
// ===========================================================================

import {
  Scene,
  PerspectiveCamera,
  WebGLRenderer,
  Color,
  AmbientLight,
  DirectionalLight,
  PointLight,
  Group,
  SphereGeometry,
  CylinderGeometry,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Sprite,
  SpriteMaterial,
  CanvasTexture,
  BufferGeometry,
  BufferAttribute,
  Points,
  PointsMaterial,
  AdditiveBlending,
} from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';

import { useEffect, useRef, useState } from 'react';

// ---------------------------------------------------------------------------
// MENSAJE DE LA CONSOLA DE INICIO (definitivo, aprobado por el señor)
// ---------------------------------------------------------------------------
const CONSOLE_LINES = [
  '> TAL VEZ NO PUDE REGALARTE UN RAMO DE FLORES,',
  '> PERO LO QUE SÍ PUEDO REGALARTE',
  '> ES UN UNIVERSO ENTERO DE FLORES.',
  '> TE QUIERO MUCHÍSIMO',
  '',
  '> ........',
];

const TYPE_SPEED_MIN = 14;
const TYPE_SPEED_MAX = 45;
const END_DELAY = 1600;   // pausa final antes de bajar la consola

// --- Parámetros de la estética "PC vieja" ---
const RENDER_SCALE = 0.45; // el canvas se pinta al 45% y se estira => pixelado
const TARGET_FPS = 14;     // nada fluido: ~14 cuadros por segundo

// ---------------------------------------------------------------------------
// Texturas procedurales
// ---------------------------------------------------------------------------

// Sprite de mini flor amarilla (fondo, "algunas flores")
function makeFlowerTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, 128, 128);
  const cx = 64;
  const cy = 64;

  for (let i = 0; i < 6; i++) {
    const angle = (i * Math.PI) / 3;
    ctx.save();
    ctx.translate(cx + Math.cos(angle) * 16, cy + Math.sin(angle) * 16);
    ctx.rotate(angle);
    ctx.fillStyle = '#ffd54a';
    ctx.beginPath();
    ctx.ellipse(0, 0, 9, 26, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  const grad = ctx.createRadialGradient(cx - 3, cy - 3, 2, cx, cy, 14);
  grad.addColorStop(0, '#fff3b0');
  grad.addColorStop(0.6, '#ffc400');
  grad.addColorStop(1, '#d98f00');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(cx, cy, 11, 0, Math.PI * 2);
  ctx.fill();

  const tex = new CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}

// Resplandor suave del halo de la flor
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
  return new CanvasTexture(canvas);
}

export default function SunScene() {
  const mountRef = useRef(null);

  // Estado de la consola de inicio
  const [typedLines, setTypedLines] = useState([]);
  const [currentLine, setCurrentLine] = useState('');
  const [lineIndex, setLineIndex] = useState(0);
  const [charIndex, setCharIndex] = useState(0);
  const [bajando, setBajando] = useState(false);
  const [slidePct, setSlidePct] = useState(0);
  const [oculto, setOculto] = useState(false);

  // --- Escena Three.js ---
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const scene = new Scene();
    scene.background = new Color(0x000000); // negro total, paleta DOS

    const camera = new PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 4000);
    camera.position.set(0, 7, 34);
    camera.lookAt(0, -1, 0);

    const renderer = new WebGLRenderer({ antialias: false }); // sin suavizado: retro
    renderer.setPixelRatio(1);
    renderer.setSize(
      Math.max(320, Math.floor(window.innerWidth * RENDER_SCALE)),
      Math.max(240, Math.floor(window.innerHeight * RENDER_SCALE))
    );
    mount.appendChild(renderer.domElement);

    // Controles: el usuario MUEVE el universo con el ratón
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = false;             // respuesta seca, sin suavizado
    controls.enablePan = false;
    controls.enableZoom = true;
    controls.zoomSpeed = 0.5;
    controls.rotateSpeed = 0.55;
    controls.minDistance = 14;
    controls.maxDistance = 160;
    controls.maxPolarAngle = Math.PI * 0.93;
    controls.target.set(0, -1, 0);

    // --- Luces ---
    const ambient = new AmbientLight(0xfff2dd, 0.55);
    scene.add(ambient);
    const keyLight = new DirectionalLight(0xfff7e0, 1.1);
    keyLight.position.set(6, 14, 10);
    scene.add(keyLight);
    const warm = new PointLight(0xffb300, 1.6, 100);
    warm.position.set(0, 0, 0);
    scene.add(warm);

    // ================= FLOR GIGANTE 3D (girasol) =================
    const flowerRoot = new Group();
    const ringGroup = new Group();

    const petalMat = new MeshStandardMaterial({
      color: 0xffc400,
      roughness: 0.42,
      metalness: 0.02,
      emissive: 0x402600,
      emissiveIntensity: 0.35,
    });

    const layers = [
      { count: 10, radius: 3.4, scaleY: 1.6, tilt: -0.32, scaleX: 0.5 },
      { count: 14, radius: 5.4, scaleY: 2.3, tilt: -0.95, scaleX: 0.62 },
    ];
    layers.forEach((layer) => {
      for (let i = 0; i < layer.count; i++) {
        const slot = new Group();
        slot.rotation.y = (i * Math.PI * 2) / layer.count;
        const petalGeo = new SphereGeometry(1.6, 16, 16);
        petalGeo.scale(layer.scaleX, layer.scaleY, 1.0);
        const petal = new Mesh(petalGeo, petalMat);
        petal.position.set(layer.radius, 0.5, 0);
        petal.rotation.z = layer.tilt;
        petal.rotation.y = 0.08;
        slot.add(petal);
        ringGroup.add(slot);
      }
    });
    flowerRoot.add(ringGroup);

    // Centro con "semillas" en espiral de Fibonacci
    const centerGeo = new SphereGeometry(2.35, 24, 24);
    const centerMat = new MeshStandardMaterial({
      color: 0x9c6b1e,
      roughness: 0.85,
      emissive: 0x2a1a00,
      emissiveIntensity: 0.4,
    });
    const center = new Mesh(centerGeo, centerMat);
    flowerRoot.add(center);

    const seedGeo = new SphereGeometry(0.17, 8, 8);
    const seedMat = new MeshStandardMaterial({ color: 0x6b4a12, roughness: 0.9 });
    for (let i = 0; i < 110; i++) {
      const r = 2.15 * Math.sqrt(i / 110);
      const a = i * 2.399963;
      const flat = 1 - r / 2.15;
      const seed = new Mesh(seedGeo, seedMat);
      seed.position.set(
        Math.cos(a) * r,
        Math.sin(a) * r * 0.62,
        Math.sqrt(Math.max(0, 4.8 - r * r)) * 0.62 * flat
      );
      center.add(seed);
    }

    // Tallo y hojas
    const stemMat = new MeshStandardMaterial({ color: 0x2e7d32, roughness: 0.7 });
    const stem = new Mesh(new CylinderGeometry(0.45, 0.85, 15, 10), stemMat);
    stem.position.y = -8.6;
    flowerRoot.add(stem);

    const leafMat = new MeshStandardMaterial({ color: 0x3f9e47, roughness: 0.65 });
    const leafGeo = new SphereGeometry(2.4, 10, 10);
    leafGeo.scale(1, 0.16, 0.62);
    const leafL = new Mesh(leafGeo, leafMat);
    leafL.position.set(-3.2, -12.4, 0);
    leafL.rotation.z = 0.55;
    flowerRoot.add(leafL);
    const leafR = leafL.clone();
    leafR.position.set(3.2, -12.4, 0);
    leafR.rotation.z = -0.55;
    flowerRoot.add(leafR);

    scene.add(flowerRoot);

    // Halos dorados
    const halo1 = new Sprite(new SpriteMaterial({
      map: makeGlowTexture('rgba(255, 190, 40, 1)'),
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      opacity: 0.85,
    }));
    halo1.scale.set(50, 50, 1);
    flowerRoot.add(halo1);

    const halo2 = new Sprite(new SpriteMaterial({
      map: makeGlowTexture('rgba(255, 235, 150, 1)'),
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      opacity: 0.4,
    }));
    halo2.scale.set(95, 95, 1);
    flowerRoot.add(halo2);

    // ======= FONDO: puntos amarillos (estrellas retro) + flores =======
    const flowerTex = makeFlowerTexture();

    // Dispersión esférica aleatoria
    const scatter = (count, rMin, rMax, ySpread) => {
      const positions = new Float32Array(count * 3);
      for (let i = 0; i < count; i++) {
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(2 * Math.random() - 1);
        const r = rMin + Math.random() * (rMax - rMin);
        positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
        positions[i * 3 + 1] = r * Math.cos(phi) * ySpread;
        positions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
      }
      const geo = new BufferGeometry();
      geo.setAttribute('position', new BufferAttribute(positions, 3));
      return geo;
    };

    // 1) Estrellas minúsculas: puntos amarillos fijos (tamaño en píxeles)
    const tinyGeo = scatter(1600, 280, 1500, 1.0);
    const tinyMat = new PointsMaterial({
      color: 0xffe88a,
      size: 2.2,
      sizeAttenuation: false,
      transparent: true,
      opacity: 0.95,
    });
    const tinyStars = new Points(tinyGeo, tinyMat);
    scene.add(tinyStars);

    // 2) Puntos brillantes más grandes, parpadean como estrellas de verdad
    const brightGeo = scatter(260, 200, 900, 0.9);
    const brightMat = new PointsMaterial({
      color: 0xffdd55,
      size: 4.2,
      sizeAttenuation: false,
      transparent: true,
      opacity: 1,
    });
    const brightStars = new Points(brightGeo, brightMat);
    scene.add(brightStars);

    // 3) Algunas flores repartidas (sprite de mini flor, con perspectiva)
    const flowerGeo = scatter(70, 220, 1100, 0.8);
    const flowerMat = new PointsMaterial({
      color: 0xffe066,
      size: 46,
      map: flowerTex,
      transparent: true,
      alphaTest: 0.2,
      depthWrite: false,
      blending: AdditiveBlending,
      sizeAttenuation: true,
      opacity: 0.9,
    });
    const fieldFlowers = new Points(flowerGeo, flowerMat);
    scene.add(fieldFlowers);

    // ================= BUCLE RETRO: ~14 fps + parpadeo =================
    let frameId;
    const frameTime = 1000 / TARGET_FPS;
    let lastRender = 0;

    const animate = (now) => {
      frameId = requestAnimationFrame(animate);
      if (now - lastRender < frameTime) return; // limite de cuadros: no fluido
      lastRender = now;

      // Movimientos lentos
      ringGroup.rotation.y += 0.0016;
      center.rotation.y += 0.0016;
      flowerRoot.rotation.y = Math.sin(now * 0.0002) * 0.06;
      tinyStars.rotation.y -= 0.00008;
      brightStars.rotation.y += 0.00012;
      fieldFlowers.rotation.y -= 0.00006;

      // Parpadeo retro de las estrellas
      tinyMat.opacity = 0.72 + Math.random() * 0.28;
      brightMat.opacity = 0.62 + Math.random() * 0.38;

      controls.update();
      renderer.render(scene, camera);
    };
    animate(0);

    // El canvas se estira a pantalla completa con aspecto pixelado (CRT)
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    renderer.domElement.style.imageRendering = 'pixelated';

    const onResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(
        Math.max(320, Math.floor(window.innerWidth * RENDER_SCALE)),
        Math.max(240, Math.floor(window.innerHeight * RENDER_SCALE))
      );
    };
    window.addEventListener('resize', onResize);

    return () => {
      cancelAnimationFrame(frameId);
      window.removeEventListener('resize', onResize);
      controls.dispose();
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
      const t = setTimeout(() => setBajando(true), END_DELAY);
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
    const t = setTimeout(() => {
      setTypedLines((prev) => [...prev, line]);
      setCurrentLine('');
      setCharIndex(0);
      setLineIndex(lineIndex + 1);
    }, 300);
    return () => clearTimeout(t);
  }, [lineIndex, charIndex]);

  // --- Bajada TRABADA de la consola: pasos con pausas, como BIOS vieja ---
  useEffect(() => {
    if (!bajando || oculto) return;
    let pct = 0;
    let cancelled = false;

    const step = () => {
      if (cancelled) return;
      const r = Math.random();
      // 30% de las veces se "traba" (avance mínimo), el resto salta
      const advance = r < 0.3 ? 1 + Math.random() * 2 : 5 + Math.random() * 12;
      pct = Math.min(100, pct + advance);
      setSlidePct(pct);
      if (pct >= 100) {
        setOculto(true); // listo: se quita del todo y libera el puntero
        return;
      }
      setTimeout(step, 110 + Math.random() * 310); // pausas irregulares
    };

    const t = setTimeout(step, 500); // "le cuesta arrancar"
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [bajando, oculto]);

  return (
    <div className="relative w-full h-screen bg-black overflow-hidden">
      {/* Universo (canvas pixelado + scanlines + viñeta) */}
      <div ref={mountRef} className="absolute inset-0 z-0" />

      {/* Scanlines CRT */}
      <div
        className="absolute inset-0 z-10 pointer-events-none"
        style={{
          backgroundImage:
            'repeating-linear-gradient(0deg, rgba(0,0,0,0.28) 0px, rgba(0,0,0,0.28) 1px, transparent 1px, transparent 3px)',
        }}
      />

      {/* Viñeta de monitor viejo */}
      <div
        className="absolute inset-0 z-10 pointer-events-none"
        style={{
          backgroundImage: 'radial-gradient(ellipse at center, transparent 55%, rgba(0,0,0,0.55) 100%)',
        }}
      />

      {/* Flicker sutil de CRT + fuente DOS */}
      <style>{`
        @font-face {
          font-family: 'Perfect DOS VGA 437';
          src: url('./fonts/PerfectDOSVGA437.ttf') format('truetype');
          font-display: swap;
        }
        @keyframes crt-flicker {
          0%, 100% { opacity: 1; }
          88% { opacity: 0.93; }
          93% { opacity: 0.97; }
          97% { opacity: 0.9; }
        }
        .crt-flicker { animation: crt-flicker 0.22s steps(1) infinite; }
      `}</style>
      <div className="absolute inset-0 z-10 pointer-events-none crt-flicker" />

      {/* Consola: estilo BIOS vieja. BAJA trabada en pasos al terminar */}
      <div
        className={`absolute inset-0 z-50 bg-black ${oculto ? 'hidden' : ''}`}
        style={{ transform: `translateY(${slidePct}%)` }}
      >
        <div className="flex items-center justify-center w-full h-full">
          <div className="w-[min(92vw,720px)] mx-auto px-2">
            {/*
              Todas las filas se reservan desde el primer cuadro (vacías) para
              que el bloque no crezca y el texto quede SIEMPRE centrado, fijo.
            */}
            <pre
              className="text-[#66ff66] text-sm sm:text-base md:text-lg leading-loose whitespace-pre-wrap select-none"
              style={{
                fontFamily: "'Perfect DOS VGA 437', 'Terminal', 'Courier New', monospace",
                textShadow: '0 0 10px rgba(102, 255, 102, 0.45)',
                letterSpacing: '0.04em',
                fontSize: '1.25em',
              }}
            >
              {CONSOLE_LINES.map((l, i) => {
                const content =
                  i < typedLines.length ? typedLines[i] : i === typedLines.length ? currentLine : '';
                return (
                  <span key={i}>
                    {content}
                    {i === typedLines.length && (
                      <span className="animate-pulse">▌</span>
                    )}
                    {'\n'}
                  </span>
                );
              })}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
}