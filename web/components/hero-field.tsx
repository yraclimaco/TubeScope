"use client";

import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useEffect, useRef } from "react";
import * as THREE from "three";
import { prefersReducedMotion } from "./motion";

gsap.registerPlugin(ScrollTrigger);

export interface HeroPoint {
  day: number;
  lane: number; // index into lanes
  days: number;
  stayed: boolean;
}

const VERTEX = /* glsl */ `
  uniform float uProgress;
  uniform float uTime;
  uniform float uPixelRatio;
  attribute vec3 aStart;
  attribute vec3 aColor;
  attribute float aSize;
  attribute float aSeed;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    float t = smoothstep(0.0, 1.0, clamp(uProgress * 1.35 - aSeed * 0.35, 0.0, 1.0));
    vec3 p = mix(aStart, position, t);
    p.y += sin(uTime * 0.6 + aSeed * 40.0 + position.x * 0.15) * 0.06 * aSize;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = aSize * uPixelRatio * (90.0 / -mv.z);
    vColor = aColor;
    vAlpha = mix(0.15, 1.0, t);
  }
`;

const FRAGMENT = /* glsl */ `
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float d = length(c);
    float a = smoothstep(0.5, 0.0, d);
    gl_FragColor = vec4(vColor, a * a * vAlpha);
  }
`;

/**
 * Every labelled video as a particle: x = first chart day, lane = category, brightness and size =
 * days on the chart. Videos that stayed glow; one-day videos are faint. Pauses off-screen.
 */
export function HeroField({ points, lanes, colors }: { points: HeroPoint[]; lanes: string[]; colors: string[] }) {
  const mount = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = mount.current;
    if (!el || points.length === 0) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true, powerPreference: "low-power" });
    } catch {
      return; // no WebGL: the gradient backdrop stays
    }
    const reduced = prefersReducedMotion();
    const ratio = Math.min(window.devicePixelRatio, 2);
    renderer.setPixelRatio(ratio);
    renderer.setClearColor(0x000000, 0);
    el.appendChild(renderer.domElement);
    renderer.domElement.style.display = "block";

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 200);

    const maxDay = Math.max(...points.map((p) => p.day), 1);
    const span = 64;
    const laneGap = 3.4;
    const n = points.length;
    const pos = new Float32Array(n * 3);
    const start = new Float32Array(n * 3);
    const col = new Float32Array(n * 3);
    const size = new Float32Array(n);
    const seed = new Float32Array(n);
    const palette = colors.map((c) => new THREE.Color(c));
    let s = 7;
    const rand = () => ((s = (s * 16807) % 2147483647) / 2147483647);

    points.forEach((p, i) => {
      const lane = p.lane - (lanes.length - 1) / 2;
      const stayed = p.stayed;
      pos[i * 3] = (p.day / maxDay - 0.5) * span + (rand() - 0.5) * 0.5;
      pos[i * 3 + 1] = (stayed ? Math.min(p.days, 12) * 0.45 : 0) + (rand() - 0.5) * 0.6;
      pos[i * 3 + 2] = lane * laneGap + (rand() - 0.5) * 1.5;
      const r = 18 + rand() * 18;
      const th = rand() * Math.PI * 2;
      const ph = Math.acos(2 * rand() - 1);
      start[i * 3] = r * Math.sin(ph) * Math.cos(th);
      start[i * 3 + 1] = r * Math.cos(ph);
      start[i * 3 + 2] = r * Math.sin(ph) * Math.sin(th);
      const c = (palette[p.lane] ?? palette[palette.length - 1]!).clone();
      if (!stayed) c.multiplyScalar(0.55);
      col.set([c.r, c.g, c.b], i * 3);
      size[i] = stayed ? 2.4 + Math.min(p.days, 10) * 0.35 : 1.5;
      seed[i] = rand();
    });

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geometry.setAttribute("aStart", new THREE.BufferAttribute(start, 3));
    geometry.setAttribute("aColor", new THREE.BufferAttribute(col, 3));
    geometry.setAttribute("aSize", new THREE.BufferAttribute(size, 1));
    geometry.setAttribute("aSeed", new THREE.BufferAttribute(seed, 1));
    const uniforms = {
      uProgress: { value: reduced ? 1 : 0 },
      uTime: { value: 0 },
      uPixelRatio: { value: ratio },
    };
    const material = new THREE.ShaderMaterial({
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      uniforms,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const cloud = new THREE.Points(geometry, material);
    cloud.position.set(6, 3.5, 0);
    scene.add(cloud);

    const pointer = { x: 0, y: 0 };
    const base = { z: 46 };
    const scroll = { p: 0 };
    const view = { yaw: -0.5, pitch: 0.5 };
    const resize = () => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      renderer.setSize(w, h, false);
      renderer.domElement.style.width = `${w}px`;
      renderer.domElement.style.height = `${h}px`;
      camera.aspect = w / Math.max(1, h);
      base.z = w < 640 ? 70 : 46;
      camera.position.set(0, 0, base.z);
      camera.updateProjectionMatrix();
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(el);

    const place = () => {
      const yaw = view.yaw + pointer.x * 0.22;
      const pitch = view.pitch + pointer.y * 0.1 + scroll.p * 0.35;
      cloud.rotation.set(pitch, yaw, 0);
      camera.position.z = base.z + scroll.p * 26;
      renderer.domElement.style.opacity = String(1 - scroll.p * 0.85);
    };
    // Scrolling past the hero pulls the camera back and fades the field.
    const scrub = reduced
      ? null
      : ScrollTrigger.create({
          trigger: el,
          start: "top top",
          end: "bottom top",
          scrub: true,
          onUpdate: (self) => {
            scroll.p = self.progress;
          },
        });

    const intro = reduced
      ? null
      : gsap.to(uniforms.uProgress, { value: 1, duration: 2.8, ease: "power3.out", delay: 0.15 });

    let visible = true;
    const io = new IntersectionObserver(([entry]) => {
      visible = !!entry?.isIntersecting;
    });
    io.observe(el);

    const onPointer = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      gsap.to(pointer, {
        x: ((e.clientX - r.left) / r.width - 0.5) * 2,
        y: ((e.clientY - r.top) / r.height - 0.5) * 2,
        duration: 1.2,
        ease: "power2.out",
        overwrite: true,
      });
    };
    if (!reduced) window.addEventListener("pointermove", onPointer, { passive: true });

    const clock = new THREE.Clock();
    const tick = () => {
      if (!visible || document.hidden) return;
      const t = clock.getElapsedTime();
      uniforms.uTime.value = t;
      view.yaw = -0.5 + Math.sin(t * 0.05) * 0.2;
      place();
      renderer.render(scene, camera);
    };
    if (reduced) {
      place();
      renderer.render(scene, camera);
    } else {
      gsap.ticker.add(tick);
    }

    return () => {
      gsap.ticker.remove(tick);
      intro?.kill();
      scrub?.kill();
      window.removeEventListener("pointermove", onPointer);
      observer.disconnect();
      io.disconnect();
      geometry.dispose();
      material.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [points, lanes, colors]);

  return <div ref={mount} className="absolute inset-0" aria-hidden />;
}
