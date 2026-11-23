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
const BLENDER_HFOV = 2 * Math.atan(18 / 16);
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
};

function useBlenderCamera(gltfCam: THREE.Camera | undefined) {
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
  }, [gltfCam, camera, size]);
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

  const boardMat = useMemo(() => makePainterly("#ffffff", { board: true }), []);
  const gltfCam = useMemo(() => gltf.cameras?.[0], [gltf]);
  useBlenderCamera(gltfCam);

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
