import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';

// ---------------------------------------------------------------------------
// MENSAJE DE LA CONSOLA DE INICIO (TEMPORAL)
// El señor pasará el texto definitivo; se edita aquí y ya.
// ---------------------------------------------------------------------------
const CONSOLE_LINES = [
  '> sunflower v1.0',
  '> cargando universo...',
  '> bienvenido a mi pequeño universo',
  '',
];

const TYPE_SPEED_MIN = 18; // ms por carácter
const TYPE_SPEED_MAX = 55;
const END_DELAY = 1400;    // pausa tras el último carácter antes de bajar

export default function SunScene() {
  const mountRef = useRef(null);

  // Estado de la consola de inicio
  const [typedLines, setTypedLines] = useState([]);
  const [currentLine, setCurrentLine] = useState('');
  const [lineIndex, setLineIndex] = useState(0);
  const [charIndex, setCharIndex] = useState(0);
  const [overlayDown, setOverlayDown] = useState(false);

  // --- Escena Three.js: SOL + ESTRELLAS únicamente ---
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x000000);

    const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 3000);
    camera.position.set(0, 5, 34);
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    mount.appendChild(renderer.domElement);

    const textureLoader = new THREE.TextureLoader();
    const sunTexture = textureLoader.load('./8k_sun.jpg');
    const starsTexture = textureLoader.load('./8k_stars.webp');

    // --- Sol ---
    const sunGeometry = new THREE.SphereGeometry(8, 48, 48);
    const sun = new THREE.Mesh(
      sunGeometry,
      new THREE.MeshBasicMaterial({ map: sunTexture })
    );
    scene.add(sun);

    // Resplandor del sol (sprites aditivos generados en canvas)
    const makeGlowTexture = (colorHex) => {
      const canvas = document.createElement('canvas');
      canvas.width = 128;
      canvas.height = 128;
      const ctx = canvas.getContext('2d');
      const gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
      gradient.addColorStop(0, colorHex);
      gradient.addColorStop(0.35, colorHex.replace('1)', '0.55)'));
      gradient.addColorStop(1, colorHex.replace('1)', '0)'));
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, 128, 128);
      return new THREE.CanvasTexture(canvas);
    };

    const corona = new THREE.Sprite(new THREE.SpriteMaterial({
      map: makeGlowTexture('rgba(255, 196, 0, 1)'), transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending, opacity: 0.95
    }));
    corona.scale.set(46, 46, 1);
    scene.add(corona);

    const bloom = new THREE.Sprite(new THREE.SpriteMaterial({
      map: makeGlowTexture('rgba(255, 240, 150, 1)'), transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending, opacity: 0.5
    }));
    bloom.scale.set(85, 85, 1);
    scene.add(bloom);

    // --- Estrellas de fondo ---
    const starsGeometry = new THREE.SphereGeometry(1500, 32, 32);
    const stars = new THREE.Mesh(
      starsGeometry,
      new THREE.MeshBasicMaterial({ map: starsTexture, side: THREE.BackSide })
    );
    scene.add(stars);

    // --- Bucle de animación mínima ---
    let frameId;
    const animate = () => {
      frameId = requestAnimationFrame(animate);
      sun.rotation.y += 0.0006;   // giro lentísimo del sol
      stars.rotation.y -= 0.0001; // deriva casi imperceptible del cielo
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
        sunGeometry.dispose();
        starsGeometry.dispose();
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
    }, 250);
    return () => clearTimeout(t);
  }, [lineIndex, charIndex]);

  return (
    <div className="relative w-full h-screen bg-black overflow-hidden">
      {/* Universo (sol + estrellas) */}
      <div ref={mountRef} className="absolute inset-0 z-0" />

      {/* Consola de inicio: escribe el mensaje y baja al terminar */}
      <div className={`absolute inset-0 z-50 bg-black transition-transform ease-in-out ${overlayDown ? '-translate-y-full' : 'translate-y-0'}`} style={{ transitionDuration: '1100ms' }}>
        <div className="flex items-center justify-center w-full h-full">
          <div className="w-[min(90vw,720px)] mx-auto px-2">
            <pre className="font-mono text-yellow-400 text-sm sm:text-base md:text-lg leading-relaxed whitespace-pre-wrap select-none">
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