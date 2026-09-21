// ===========================================================================
// FLORES - "UNIVERSO DE FLORES" con estética RETRO (PC de los 80s/90s)
// - Flor girasol 3D procedural en el centro
// - Fondo: puntos amarillos (estrellas retro) + CAMPO de flores variadas
//   (3 diseños: amarilla, margarita, rosa) en 2 tamaños cada una
// - Render a baja resolución + 14 fps + scanlines => se ve "antiguo" a propósito
// - CARGA LENTA: el mensaje se escribe trabajosamente, con pausas y trabas,
//   como una página web de hace años; luego la consola BAJA poco a poco
// - Texto FIJO: cada línea tiene su slot reservado; escribir no mueve nada
// - RESPONSIVE: móvil / tablet / PC, retrato o paisaje, pantalla completa
// - TAMAÑO MAPEADO POR DISPOSITIVO: el tamaño de letra se resuelve en CSS
//   puro por rango de pantalla (clamp + media queries); la consola y su
//   contenedor se acomodan solos en cualquier pantalla, sin JS de cálculo
// - MÚSICA: la canción del señor (viento.mp3) con sonido de GRABADORA DE
//   LOS 80s: agudos de cinta (sin HD), poco graves, saturación suave,
//   compresor ligero, "shhh" de cinta de fondo y temblor de velocidad.
//   Se escucha clara, con carácter vintage. Botón para callarla; si el
//   mp3 no carga, respaldo ambient.
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
  '> TE QUIERO MUCHÍSIMO ODETTESITA <3',
  '>',
  '> ........',
];

// Lentitud de web vieja: se escribe lento y de vez en cuando se "traba"
const TYPE_SPEED_MIN = 42;
const TYPE_SPEED_MAX = 135;
const STALL_CHANCE = 0.14; // probabilidad de trabón al escribir un carácter
const STALL_MIN = 380;     // trabón mínimo (ms)
const STALL_MAX = 950;     // trabón máximo (ms)
const LINE_BREAK_DELAY = 420;
const END_DELAY = 1800;    // pausa final antes de bajar la consola

// --- Parámetros de la estética "PC vieja" ---
const TARGET_FPS = 14;     // nada fluido: ~14 cuadros por segundo

// ---------------------------------------------------------------------------
// RESPONSIVE: perfiles por dispositivo (móvil / tablet / PC) y orientación
//   Los tamaños de LETRA no viven aquí: se resuelven en CSS (clase
//   .console-line con clamp + media queries, ver <style> del componente)
// ---------------------------------------------------------------------------
const detectDevice = (w = window.innerWidth) => {
  if (w < 768) return { kind: 'mobile' };
  if (w < 1024) return { kind: 'tablet' };
  return { kind: 'desktop' };
};

const DEVICE_PRESETS = {
  mobile:  { renderScale: 0.35, stars: 800,  bright: 140, fov: 65, camY: 9,  camZ: 40 },
  tablet:  { renderScale: 0.40, stars: 1100, bright: 200, fov: 62, camY: 8,  camZ: 37 },
  desktop: { renderScale: 0.45, stars: 1600, bright: 260, fov: 60, camY: 7,  camZ: 34 },
};

const getPreset = () => {
  const d = detectDevice();
  const base = DEVICE_PRESETS[d.kind];
  const portrait = window.innerHeight > window.innerWidth;
  // En retrato (móvil vertical) abrimos el ángulo y alejamos la cámara
  return { ...base, kind: d.kind, portrait, camZ: base.camZ + (portrait ? 5 : 0) };
};

// ---------------------------------------------------------------------------
// MÚSICA ambiental sintetizada: 4 acordes suaves en loop (sin archivos)
// ---------------------------------------------------------------------------
function buildAmbientBuffer(ctx, seconds = 22) {
  const sr = ctx.sampleRate;
  const buffer = ctx.createBuffer(1, Math.floor(sr * seconds), sr);
  const data = buffer.getChannelData(0);

  // Pads: Cmaj7 -> Am7 -> Fmaj7 -> G (vueltas suaves, estilo space)
  const chords = [
    [261.63, 329.63, 392.0, 493.88],  // Cmaj7
    [220.0, 261.63, 329.63, 392.0],   // Am7
    [174.61, 261.63, 329.63, 440.0],  // Fmaj7
    [196.0, 246.94, 392.0, 493.88],   // G
  ];
  const chordLen = seconds / chords.length;

  for (let c = 0; c < chords.length; c++) {
    const t0 = c * chordLen;
    for (let n = 0; n < chords[c].length; n++) {
      const f = chords[c][n];
      const amp = 0.04 / chords[c].length;
      for (let i = 0; i < data.length; i++) {
        const t = i / sr;
        const local = t - t0;
        if (local < 0 || local > chordLen) continue;
        let env = 1;
        if (local < 1.4) env = local / 1.4;          // ataque lento
        const rem = chordLen - local;
        if (rem < 2) env = Math.min(env, rem / 2);   // fuga suave (crossfade)
        data[i] +=
          amp *
          env *
          (Math.sin(2 * Math.PI * f * local) +
            0.35 * Math.sin(4 * Math.PI * f * local) +
            0.18 * Math.sin(6 * Math.PI * f * local));
      }
    }
  }
  return buffer;
}

// Curva de saturación "cinta de casete": calidez analógica MUY suave para
// no romper la voz ni los instrumentos (nada de chiptune ni de garabato)
function makeDriveCurve(amount = 1.6) {
  const n = 512;
  const curve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i * 2) / n - 1; // -1 .. 1
    curve[i] = Math.tanh(x * amount);
  }
  return curve;
}

// ---------------------------------------------------------------------------
// MÚSICA con sonido de "PC vieja": la canción del señor pasa por una cadena
// de filtros (lowpass recorta el HD, highpass quita graves de bocina chica,
// waveshaper da carácter, compresor empareja el volumen). Si el archivo no
// carga, cae al pad sintetizado de respaldo: nunca queda en silencio.
// ---------------------------------------------------------------------------
function useAmbientMusic() {
  const [on, setOn] = useState(false);
  const audioRef = useRef(null);
  const startRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    let t;
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      const ctx = new Ctx();

      // --- Cadena "grabadora vieja de los 80s" ---
      // La canción se escucha CLARA pero con carácter de cinta de casete:
      // agudos redondeados (no HD), pocos graves, un "shhh" de fondo y un
      // temblor milimétrico de velocidad. Nada de sonido ahogado.
      const pre = ctx.createGain();
      pre.gain.value = 0.9;

      const drive = ctx.createWaveShaper();
      drive.curve = makeDriveCurve(1.6); // saturación suave, calidez analógica

      const lowpass = ctx.createBiquadFilter();
      lowpass.type = 'lowpass';
      lowpass.frequency.value = 6800; // agudos de cinta: nada de HD cristalino
      lowpass.Q.value = 0.3;

      const highpass = ctx.createBiquadFilter();
      highpass.type = 'highpass';
      highpass.frequency.value = 85; // un casete no baja de ahí

      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -18;
      comp.knee.value = 16;
      comp.ratio.value = 2.5; // compresión ligera: no aplasta la canción
      comp.attack.value = 0.008;
      comp.release.value = 0.25;

      const master = ctx.createGain();
      master.gain.value = 0; // arranca en silencio, sube flotando

      pre.connect(drive);
      drive.connect(lowpass);
      lowpass.connect(highpass);
      highpass.connect(comp);
      comp.connect(master);
      master.connect(ctx.destination);

      // "Shhh" de cinta: ruido de grabadora muy bajito (el sello de los 80s)
      const hissBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
      const hData = hissBuf.getChannelData(0);
      for (let i = 0; i < hData.length; i++) hData[i] = Math.random() * 2 - 1;
      const hissSrc = ctx.createBufferSource();
      hissSrc.buffer = hissBuf;
      hissSrc.loop = true;
      const hissFilter = ctx.createBiquadFilter();
      hissFilter.type = 'lowpass';
      hissFilter.frequency.value = 6000;
      const hissGain = ctx.createGain();
      hissGain.gain.value = 0.016;
      hissSrc.connect(hissFilter);
      hissFilter.connect(hissGain);
      hissGain.connect(master);
      hissSrc.start();

      // "Wow" de casete: la velocidad tiembla una pizca, como cinta real
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 0.6;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 0.002; // ±0.2% de velocidad: imperceptible pero real
      lfo.connect(lfoGain);
      lfo.start();

      const audio = { ctx, master, buffer: null, started: false, lfoGain };
      audioRef.current = audio;

      const start = () => {
        if (audio.started || !audio.buffer || cancelled) return;
        const src = ctx.createBufferSource();
        src.buffer = audio.buffer;
        src.loop = true;
        src.connect(pre);
        // El temblor de cinta se engancha a la velocidad de reproducción
        audio.lfoGain.connect(src.playbackRate);
        src.start();
        audio.started = true;
        audio.master.gain.setTargetAtTime(0.8, ctx.currentTime, 1.4); // clara, de fondo
        setOn(true);
      };
      startRef.current = start;

      const tryAutoplay = () => {
        t = setTimeout(() => {
          if (cancelled) return;
          if (ctx.state === 'suspended') {
            ctx.resume().then(() => {
              if (ctx.state === 'running') startRef.current();
            }).catch(() => {});
          } else if (ctx.state === 'running') {
            startRef.current();
          }
        }, 400);
      };

      // Carga la canción del señor; si falla, respaldo: pad sintetizado
      fetch('/viento.mp3')
        .then((r) => {
          if (!r.ok) throw new Error('no mp3');
          return r.arrayBuffer();
        })
        .then((buf) => ctx.decodeAudioData(buf))
        .then((buffer) => {
          if (cancelled) return;
          audio.buffer = buffer;
          tryAutoplay();
        })
        .catch(() => {
          if (cancelled) return;
          audio.buffer = buildAmbientBuffer(ctx, 22); // respaldo nunca silencio
          tryAutoplay();
        });

      return () => {
        cancelled = true;
        clearTimeout(t);
        try { ctx.close(); } catch (e) { /* ya cerrado */ }
      };
    } catch (e) {
      return undefined; // sin audio: el botón simplemente no hace nada
    }
  }, []);

  const toggle = () => {
    const a = audioRef.current;
    if (!a || !a.buffer) return;
    // Despierta el contexto si el navegador lo tenía dormido (esto sí se permite)
    if (a.ctx.state === 'suspended') a.ctx.resume().catch(() => {});
    if (on) {
      a.master.gain.setTargetAtTime(0, a.ctx.currentTime, 0.8);
      setOn(false);
    } else {
      if (!a.started) { startRef.current(); }
      else a.master.gain.setTargetAtTime(0.8, a.ctx.currentTime, 0.8);
      setOn(true);
    }
  };

  return { on, toggle };
}

// ---------------------------------------------------------------------------
// Texturas procedurales
// ---------------------------------------------------------------------------

// Sprite de mini flor amarilla (6 pétalos)
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

// Margarita: 8 pétalos blancos finos + centro amarillo
function makeDaisyTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, 128, 128);
  const cx = 64;
  const cy = 64;

  for (let i = 0; i < 8; i++) {
    const angle = (i * Math.PI) / 4;
    ctx.save();
    ctx.translate(cx + Math.cos(angle) * 16, cy + Math.sin(angle) * 16);
    ctx.rotate(angle);
    ctx.fillStyle = '#fff6e0';
    ctx.beginPath();
    ctx.ellipse(0, 0, 5, 26, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  const grad = ctx.createRadialGradient(cx - 3, cy - 3, 2, cx, cy, 13);
  grad.addColorStop(0, '#fff7c2');
  grad.addColorStop(0.6, '#ffd23e');
  grad.addColorStop(1, '#e09a00');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(cx, cy, 10, 0, Math.PI * 2);
  ctx.fill();

  const tex = new CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}

// Flor rosa: 5 pétalos redondos + centro naranja
function makeRosaTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, 128, 128);
  const cx = 64;
  const cy = 64;

  for (let i = 0; i < 5; i++) {
    const angle = (i * Math.PI * 2) / 5;
    ctx.save();
    ctx.translate(cx + Math.cos(angle) * 15, cy + Math.sin(angle) * 15);
    ctx.rotate(angle);
    ctx.fillStyle = '#ff9ad5';
    ctx.beginPath();
    ctx.ellipse(0, 0, 10, 18, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  const grad = ctx.createRadialGradient(cx - 3, cy - 3, 2, cx, cy, 12);
  grad.addColorStop(0, '#ffd9a0');
  grad.addColorStop(0.6, '#ffb347');
  grad.addColorStop(1, '#e07f00');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(cx, cy, 9, 0, Math.PI * 2);
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

  const { on: musicaOn, toggle: toggleMusica } = useAmbientMusic();

  // --- Escena Three.js ---
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const preset = getPreset();

    const scene = new Scene();
    scene.background = new Color(0x000000); // negro total, paleta DOS

    const camera = new PerspectiveCamera(preset.fov, window.innerWidth / window.innerHeight, 0.1, 4000);
    camera.position.set(0, preset.camY, preset.camZ);
    camera.lookAt(0, -1, 0);

    const renderer = new WebGLRenderer({ antialias: false }); // sin suavizado: retro
    renderer.setPixelRatio(1);
    renderer.setSize(
      Math.max(320, Math.floor(window.innerWidth * preset.renderScale)),
      Math.max(240, Math.floor(window.innerHeight * preset.renderScale))
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

    // ============ FONDO: puntos amarillos + campo de flores variadas ============
    const texYellow = makeFlowerTexture();
    const texDaisy = makeDaisyTexture();
    const texRosa = makeRosaTexture();

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
    const makeStars = (count, color, size, rMin, rMax, ySpread) => {
      const geo = scatter(count, rMin, rMax, ySpread);
      const mat = new PointsMaterial({
        color,
        size,
        sizeAttenuation: false,
        transparent: true,
        opacity: 0.95,
      });
      const pts = new Points(geo, mat);
      return { pts, mat };
    };

    // 2) Un grupo de mini flores con su textura y tamaño
    const makeFlowerField = (tex, size, count, rMin, rMax) => {
      const geo = scatter(count, rMin, rMax, 0.8);
      const mat = new PointsMaterial({
        color: 0xfff2c0,
        size,
        map: tex,
        transparent: true,
        alphaTest: 0.2,
        depthWrite: false,
        blending: AdditiveBlending,
        sizeAttenuation: true,
        opacity: 0.92,
      });
      return new Points(geo, mat);
    };

    // 3) Arma todo el fondo: estrellas + 3 diseños de flor × 2 tamaños
    const makeField = (p) => {
      const group = new Group();

      const tiny = makeStars(p.stars, 0xffe88a, 2.2, 280, 1500, 1.0);
      group.add(tiny.pts);

      const bright = makeStars(p.bright, 0xffdd55, 4.2, 200, 900, 0.9);
      group.add(bright.pts);

      // En pantallas chicas se dibujan menos flores
      const mult = p.kind === 'mobile' ? 0.7 : p.kind === 'tablet' ? 0.85 : 1;
      const defs = [
        { tex: texYellow, size: 34, count: 42, rMin: 170, rMax: 850 },
        { tex: texYellow, size: 62, count: 26, rMin: 240, rMax: 1050 },
        { tex: texDaisy, size: 36, count: 38, rMin: 180, rMax: 880 },
        { tex: texDaisy, size: 64, count: 24, rMin: 250, rMax: 1080 },
        { tex: texRosa, size: 33, count: 40, rMin: 175, rMax: 860 },
        { tex: texRosa, size: 60, count: 25, rMin: 245, rMax: 1060 },
      ];
      defs.forEach((f) => {
        group.add(makeFlowerField(f.tex, f.size, Math.round(f.count * mult), f.rMin, f.rMax));
      });

      return { group, tinyMat: tiny.mat, brightMat: bright.mat };
    };

    const disposeField = (f) => {
      f.group.traverse((obj) => {
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) obj.material.dispose();
      });
    };

    let field = makeField(preset);
    scene.add(field.group);

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
      // Estrellas y flores del fondo: MUY MUY lentas (una vuelta en ~6 horas)
      field.group.rotation.y -= 0.00002;

      // Parpadeo retro de las estrellas: sutil, sin nerviosismo
      field.tinyMat.opacity = 0.8 + Math.random() * 0.2;
      field.brightMat.opacity = 0.72 + Math.random() * 0.28;

      controls.update();
      renderer.render(scene, camera);
    };
    animate(0);

    // El canvas se estira a pantalla completa con aspecto pixelado (CRT)
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    renderer.domElement.style.objectFit = 'contain';
    renderer.domElement.style.imageRendering = 'pixelated';

    // Recalcula todo al cambiar tamaño u orientación del dispositivo
    const onResize = () => {
      const next = getPreset();

      // Cambió el tipo de dispositivo (móvil <-> tablet <-> PC): se reconstruye el fondo
      if (next.kind !== preset.kind) {
        scene.remove(field.group);
        disposeField(field);
        field = makeField(next);
        scene.add(field.group);
      }

      camera.aspect = window.innerWidth / window.innerHeight;
      camera.fov = next.fov;
      camera.position.z = next.camZ;
      camera.updateProjectionMatrix();
      renderer.setSize(
        Math.max(320, Math.floor(window.innerWidth * next.renderScale)),
        Math.max(240, Math.floor(window.innerHeight * next.renderScale))
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
        disposeField(field);
        texYellow.dispose();
        texDaisy.dispose();
        texRosa.dispose();
        renderer.dispose();
      } catch (e) { /* limpieza segura */ }
    };
  }, []);

  // --- Efecto máquina de escribir: LENTO, con trabas (web de los 90s) ---
  useEffect(() => {
    if (lineIndex >= CONSOLE_LINES.length) {
      const t = setTimeout(() => setBajando(true), END_DELAY);
      return () => clearTimeout(t);
    }
    const line = CONSOLE_LINES[lineIndex];
    if (charIndex < line.length) {
      // A veces el "módem" se traba un momento y luego sigue
      let delay;
      if (Math.random() < STALL_CHANCE) {
        delay = STALL_MIN + Math.random() * (STALL_MAX - STALL_MIN);
      } else {
        delay = TYPE_SPEED_MIN + Math.random() * (TYPE_SPEED_MAX - TYPE_SPEED_MIN);
      }
      const t = setTimeout(() => {
        setCharIndex(charIndex + 1);
        setCurrentLine(line.slice(0, charIndex + 1));
      }, delay);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => {
      setTypedLines((prev) => [...prev, line]);
      setCurrentLine('');
      setCharIndex(0);
      setLineIndex(lineIndex + 1);
    }, LINE_BREAK_DELAY);
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
      setTimeout(step, 130 + Math.random() * 330); // pausas irregulares
    };

    const t = setTimeout(step, 600); // "le cuesta arrancar"
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [bajando, oculto]);

  return (
    // #root mide calc(var(--vh) * 100), corregido por el script del index.html:
    // en móvil la barra del navegador ya no encoge la pantalla
    <div className="absolute inset-0 z-0 bg-black overflow-hidden">
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

      {/* Flicker sutil de CRT */}
      <style>{`
        @keyframes crt-flicker {
          0%, 100% { opacity: 1; }
          88% { opacity: 0.93; }
          93% { opacity: 0.97; }
          97% { opacity: 0.9; }
        }
        .crt-flicker { animation: crt-flicker 0.22s steps(1) infinite; }
        @keyframes crt-cursor {
          0%, 49% { opacity: 1; }
          50%, 100% { opacity: 0; }
        }
        .crt-cursor { animation: crt-cursor 1s steps(1) infinite; }

        /* ===== TAMAÑO DE LA CONSOLA: MAPEADO POR DISPOSITIVO (CSS puro) =====
           El señor pidió "mapear el tamaño del dispositivo y de acuerdo a
           eso acomodarlo" + corregir el alto real en móvil (--vh).
           - Móvil (<768): letra pequeña-media; cada línea reserva 3em para
             tolerar un enredo si entra, sin mover el bloque (texto fijo).
           - Tablet (768-1023): letra media, sin enredo.
           - PC (>=1024): consola más ancha y letra GRANDE (hasta 38px).  */
        .console-box { width: 92vw; margin: 0 auto; }
        .console-line {
          font-family: 'Courier New', Courier, Consolas, monospace;
          line-height: 1.5;
          white-space: pre;
          color: #66ff66;
          text-shadow: 0 0 10px rgba(102, 255, 102, 0.45);
          letter-spacing: 0.02em;
        }
        @media (max-width: 767px) {
          .console-line { font-size: clamp(13px, 3.2vw, 15px); min-height: 3em; }
        }
        @media (min-width: 768px) and (max-width: 1023px) {
          .console-line { font-size: clamp(18px, 2.4vw, 24px); }
        }
        @media (min-width: 1024px) {
          .console-box { width: min(94vw, 1400px); }
          .console-line { font-size: clamp(26px, 2.1vw, 38px); }
        }
      `}</style>
      <div className="absolute inset-0 z-10 pointer-events-none crt-flicker" />

      {/*
        Consola estilo BIOS vieja. Cada línea OCUPA SU SLOT desde el primer
        cuadro: el bloque nunca cambia de altura y el texto NO se mueve.
        El tamaño de letra lo decide CSS por rango de pantalla (clamp +
        media queries, ver .console-line arriba): móvil, tablet y PC.
      */}
      <div
        className={`absolute inset-0 z-50 bg-black ${oculto ? 'hidden' : ''}`}
        style={{ transform: `translateY(${slidePct}%)` }}
      >
        <div className="flex items-center justify-center w-full h-full">
          <div className="console-box">
            {CONSOLE_LINES.map((l, i) => {
              const done = i < typedLines.length;
              const active = i === lineIndex;
              const content = done ? typedLines[i] : active ? currentLine : '';
              return (
                <div key={i} className="console-line select-none">
                  {content}
                  {active && <span className="crt-cursor">▌</span>}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Botón de música: discreto, estilo terminal. Silencia o enciende. */}
      <button
        type="button"
        onClick={toggleMusica}
        className="absolute z-[60] bottom-3 right-3 select-none"
        style={{
          background: 'rgba(0, 0, 0, 0.75)',
          border: `1px solid ${musicaOn ? '#33ff66' : '#2a5533'}`,
          color: musicaOn ? '#66ff66' : '#467a52',
          fontFamily: "'Courier New', Courier, Consolas, monospace",
          fontSize: '12px',
          letterSpacing: '0.08em',
          padding: '6px 10px',
          cursor: 'pointer',
          textShadow: musicaOn ? '0 0 8px rgba(102, 255, 102, 0.4)' : 'none',
        }}
      >
        {musicaOn ? '♪ MÚSICA: ON' : '♪ MÚSICA: OFF'}
      </button>
    </div>
  );
}