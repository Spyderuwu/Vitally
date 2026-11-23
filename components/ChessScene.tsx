"use client";

import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import { makePainterly, paintUniforms, getRamp } from "@/lib/painterlyMaterial";
import { MATERIAL_SLOTS, Palette, PaletteKey } from "@/lib/palette";

const BASE = process.env.NEXT_PUBLIC_BASE_PATH || "";
export const MODEL_URL = `${BASE}/models/chess_scene.glb`;

// Blender camera: 16mm on a 36mm-wide sensor.

const REF_ASPECT = 1055 / 560;

export type SceneSettings = {
  palette: Palette;
  sunAzimuth: number; // degrees
  sunElevation: number; // degrees
  sunIntensity: number;
  ambient: number;
  shadowSoftness: number;
  rampSoftness: number;
  idle: boolean;
  loopSeconds: number;
  cursorSun: boolean;
  dropEnabled: boolean;
  dropHeight: number;
  dropPreview: number; // -1 = follow scroll
  camMove: number; // 0 = off, 1 = default amount
  focal: number; // mm on a 36mm sensor
};

const camBase = { pos: new THREE.Vector3(), quat: new THREE.Quaternion(), ready: false };

function useBlenderCamera(gltfCam: THREE.Camera | undefined, focal: number) {
  const BLENDER_HFOV = 2 * Math.atan(18 / focal);
  const { camera, size } = useThree();
  useEffect(() => {
    if (!gltfCam) return;
    gltfCam.updateWorldMatrix(true, false);
    const p = new THREE.Vector3();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    gltfCam.matrixWorld.decompose(p, q, s);
    camera.position.copy(p);
    camera.quaternion.copy(q);
    camBase.pos.copy(p);
    camBase.quat.copy(q);
    camBase.ready = true;
    const cam = camera as THREE.PerspectiveCamera;
    const aspect = size.width / size.height;
    // Keep the reference's horizontal framing on wide screens; on narrower
    // screens keep its vertical framing so he never leaves the shot.
    const refVfov = 2 * Math.atan(Math.tan(BLENDER_HFOV / 2) / REF_ASPECT);
    const vfov = aspect >= REF_ASPECT ? 2 * Math.atan(Math.tan(BLENDER_HFOV / 2) / aspect) : refVfov;
    cam.fov = THREE.MathUtils.radToDeg(vfov);
    cam.aspect = aspect;
    cam.near = 0.1;
    cam.far = 1000;
    cam.updateProjectionMatrix();
  }, [gltfCam, camera, size, focal]);
}

export function ChessScene({ settings }: { settings: SceneSettings }) {
  const gltf = useGLTF(MODEL_URL);
  const { scene, gl } = useThree();
  const sun = useRef<THREE.DirectionalLight>(null);
  const hemi = useRef<THREE.HemisphereLight>(null);
  const pointer = useRef<{ x: number; y: number } | null>(null);

  // Swap every glTF material for a painterly one keyed to a palette slot.
  const mats = useMemo(() => {
    const bySlot = {} as Record<PaletteKey, THREE.MeshToonMaterial>;
    gltf.scene.traverse((o) => {
      const light = o as THREE.Light;
      if (light.isLight) light.visible = false; // we drive our own sun
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      const src = m.material as THREE.Material;
      const slot = MATERIAL_SLOTS[src.name.replace(/\.\d+$/, "")] ?? "piece";
      if (!bySlot[slot]) bySlot[slot] = makePainterly(settings.palette[slot]);
      m.material = bySlot[slot];
      m.castShadow = true;
      m.receiveShadow = true;
      m.frustumCulled = false;
    });
    return bySlot;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gltf]);

  // Pieces that fall onto the board with scroll (everything but the center piece).
  const drops = useMemo(() => {
    const list: { obj: THREE.Object3D; baseY: number; delay: number; spin: number; cell: [number, number] }[] = [];
    gltf.scene.traverse((o) => {
      if (o.name.startsWith("Piece_") && o.name !== "Piece_Center") list.push({ obj: o, baseY: o.position.y, delay: 0, spin: 0, cell: [Math.round(o.position.x / 2.2), Math.round(o.position.z / 2.2)] });
    });
    // stagger: nearer pieces land first
    list.sort((a, b) => a.obj.position.z - b.obj.position.z).reverse();
    list.forEach((d, i) => {
      d.delay = (i / Math.max(1, list.length - 1)) * 0.45;
      d.spin = (i % 2 ? 1 : -1) * (0.35 + 0.15 * i);
    });
    return list;
  }, [gltf]);
  const scroll = useRef(0);
  const scrollEased = useRef(0);
  useEffect(() => {
    const onScroll = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      scroll.current = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 1;
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const boardMat = useMemo(() => makePainterly("#ffffff", { board: true }), []);
  const gltfCam = useMemo(() => gltf.cameras?.[0], [gltf]);
  useBlenderCamera(gltfCam, settings.focal);

  // Bones for the idle loop (GLTFLoader strips ":" from Mixamo names).
  const idle = useMemo(() => {
    const names = ["mixamorigSpine1", "mixamorigSpine2", "mixamorigHead", "mixamorigLeftForeArm", "mixamorigLeftArm"];
    const bones: Record<string, { bone: THREE.Object3D; base: THREE.Quaternion }> = {};
    for (const n of names) {
      const b = gltf.scene.getObjectByName(n);
      if (b) bones[n] = { bone: b, base: b.quaternion.clone() };
    }
    return bones;
  }, [gltf]);

  // Palette -> materials, sky, haze.
  useEffect(() => {
    const p = settings.palette;
    (Object.keys(mats) as PaletteKey[]).forEach((k) => mats[k].color.set(p[k]));
    paintUniforms.uBoardA.value.set(p.boardLight);
    paintUniforms.uBoardB.value.set(p.boardDark);
    scene.background = new THREE.Color(p.sky);
    scene.fog = new THREE.Fog(p.haze, 30, 160);
    if (hemi.current) {
      hemi.current.color.set(p.shadow);
      hemi.current.groundColor.set(p.bounce);
    }
  }, [settings.palette, mats, scene]);

  useEffect(() => {
    getRamp(settings.rampSoftness);
  }, [settings.rampSoftness]);

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      pointer.current = { x: e.clientX / window.innerWidth, y: e.clientY / window.innerHeight };
    };
    window.addEventListener("pointermove", onMove);
    return () => window.removeEventListener("pointermove", onMove);
  }, []);

  useEffect(() => {
    (window as unknown as { __three: unknown }).__three = { scene, gl };
  }, [scene, gl]);

  useEffect(() => {
    gl.shadowMap.enabled = true;
    gl.shadowMap.type = THREE.PCFShadowMap;
  }, [gl]);

  const az = useRef(settings.sunAzimuth);
  const el = useRef(settings.sunElevation);

  useFrame((state, dt) => {
    const target = !settings.dropEnabled ? 1 : settings.dropPreview >= 0 ? settings.dropPreview : scroll.current;
    scrollEased.current += (target - scrollEased.current) * (1 - Math.exp(-dt * 8));
    const p = scrollEased.current;
    // Camera rides down with the pieces: starts a little higher, tilted up,
    // and settles into the reference framing as the last piece lands.
    if (camBase.ready) {
      const ct = Math.min(1, p / 0.95);
      const k = settings.camMove * (1 - ct * ct * (3 - 2 * ct));
      const cam = state.camera;
      cam.position.copy(camBase.pos);
      cam.position.y += 0.9 * k;
      cam.quaternion.copy(camBase.quat);
      cam.rotateX(-0.035 * k);
      cam.rotateZ(0.012 * k);
    }
    // Scroll drop: each piece falls in and lands.
    // Start height per piece: high enough that its base sits above the top
    // of the frame for the current camera (focal length, lens bend, camera
    // move), so pieces always slide in from off screen instead of popping.
    const cam3 = state.camera as THREE.PerspectiveCamera;
    cam3.updateMatrixWorld();
    for (const d of drops) {
      let lo = 0, hi = 200;
      const probe = new THREE.Vector3();
      for (let i = 0; i < 18; i++) {
        const mid = (lo + hi) / 2;
        probe.set(d.obj.position.x, d.baseY + mid, d.obj.position.z).project(cam3);
        if (probe.y > 1.08 || probe.z > 1) hi = mid; else lo = mid;
      }
      const startH = Math.max(settings.dropHeight, hi + 0.5);
      const t = Math.min(1, Math.max(0, (p - d.delay) / 0.55));
      // ease-in fall that lands cleanly (no bounce)
      const fall = 1 - t * t;
      d.obj.position.y = d.baseY + startH * fall;
      // Each piece sits in the middle of its own board square.
      d.obj.position.x = d.cell[0] * paintUniforms.uSquare.value;
      d.obj.position.z = d.cell[1] * paintUniforms.uSquare.value;
      d.obj.rotation.y = d.spin * (1 - t) * (1 - t);
      d.obj.visible = true;
    }


    // Sun: either from the panel or from the cursor (eased either way).
    let tAz = settings.sunAzimuth;
    let tEl = settings.sunElevation;
    if (settings.cursorSun && pointer.current) {
      tAz = 300 - pointer.current.x * 150; // a third in from the left ≈ the reference's low left sun
      tEl = Math.max(5, 42 - pointer.current.y * 42);
    }
    const k = 1 - Math.exp(-dt * 4);
    az.current += (tAz - az.current) * k;
    el.current += (tEl - el.current) * k;
    if (sun.current) {
      const a = THREE.MathUtils.degToRad(az.current);
      const e = THREE.MathUtils.degToRad(el.current);
      const r = 40;
      sun.current.position.set(Math.cos(e) * Math.sin(a) * r, Math.sin(e) * r, Math.cos(e) * Math.cos(a) * r);
      sun.current.target.position.set(0, 0, 0);
      sun.current.target.updateMatrixWorld();
      sun.current.intensity = settings.sunIntensity;
      sun.current.shadow.radius = settings.shadowSoftness;
    }
    if (hemi.current) hemi.current.intensity = settings.ambient;

    // Idle loop: one full cycle every loopSeconds (keep it even: 4 or 6).
    const t = state.clock.elapsedTime;
    const ph = settings.idle ? ((t % settings.loopSeconds) / settings.loopSeconds) * Math.PI * 2 : 0;
    const amt = settings.idle ? 1 : 0;
    const set = (n: string, axis: THREE.Vector3, angle: number) => {
      const b = idle[n];
      if (!b) return;
      b.bone.quaternion.copy(b.base).multiply(new THREE.Quaternion().setFromAxisAngle(axis, angle * amt));
    };
    const X = new THREE.Vector3(1, 0, 0);
    const Y = new THREE.Vector3(0, 1, 0);
    const Z = new THREE.Vector3(0, 0, 1);
    set("mixamorigSpine1", Y, Math.sin(ph) * 0.06); // slow scan of the horizon
    set("mixamorigSpine2", X, Math.sin(ph * 2) * 0.012); // two breaths per loop
    set("mixamorigLeftArm", Z, Math.sin(ph + 0.8) * 0.03); // briefcase sway
    set("mixamorigLeftForeArm", X, Math.sin(ph + 1.2) * 0.04);
  });

  return (
    <>
      <hemisphereLight ref={hemi} args={[settings.palette.shadow, settings.palette.bounce, settings.ambient]} />
      <directionalLight
        ref={sun}
        color="#fff1e2"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0006}
        shadow-normalBias={0.04}
        shadow-blurSamples={16}
        shadow-camera-left={-40}
        shadow-camera-right={40}
        shadow-camera-top={40}
        shadow-camera-bottom={-40}
        shadow-camera-near={1}
        shadow-camera-far={120}
      />
      <primitive object={gltf.scene} />
      <mesh rotation-x={-Math.PI / 2} receiveShadow material={boardMat}>
        <planeGeometry args={[800, 800]} />
      </mesh>
    </>
  );
}

useGLTF.preload(MODEL_URL);
