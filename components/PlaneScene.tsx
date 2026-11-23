"use client";

import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import { makePainterly, makeRamp } from "@/lib/painterlyMaterial";
import { scrollState, beats } from "@/lib/scroll";

const BASE = process.env.NEXT_PUBLIC_BASE_PATH || "";
export const PLANE_URL = `${BASE}/models/plane_scene.glb`;

// The paper plane world floats high above the chessboard, so the two never
// share a frame; the hand-off happens through the empty sky between them.
const OFFSET = new THREE.Vector3(0, 1000, 0);

export type PlanePalette = {
  sky: string;
  skin: string;
  dress: string;
  top: string;
  hair: string;
  shoes: string;
  paper: string;
  grassDark: string;
  grassLight: string;
  skyLight: string;
  bounce: string;
};

export const PLANE_PALETTE: PlanePalette = {
  sky: "#aad0f6",
  skin: "#f0ba84",
  dress: "#faf6ef",
  top: "#faf3ea",
  hair: "#4d3e26",
  shoes: "#f6f1ea",
  paper: "#fbf7f1",
  grassDark: "#566637",
  grassLight: "#8aa064",
  skyLight: "#e8f0fb",
  bounce: "#f3ece2",
};

export type PlaneSettings = {
  palette: PlanePalette;
  sunAzimuth: number;
  sunElevation: number;
  sunIntensity: number;
  ambient: number;
  flatness: number; // 0 = modelled, 1 = fully flat
  softness: number;
  zoom: number; // 1 = Blender framing
  shiftX: number;
  shiftY: number;
  updraft: number;
  hairSway: number;
  skirtSway: number;
  grassStreaks: number;
  loopSeconds: number;
};

const SLOT: Record<string, keyof PlanePalette> = {
  MAT_Skin: "skin",
  MAT_Dress: "dress",
  MAT_Shirt: "top",
  MAT_Hair: "hair",
  MAT_Shoes: "shoes",
  MAT_Paper: "paper",
};

export function PlaneScene({ settings }: { settings: PlaneSettings }) {
  const gltf = useGLTF(PLANE_URL);
  const { scene } = useThree();
  const group = useRef<THREE.Group>(null);
  const sun = useRef<THREE.DirectionalLight>(null);
  const hemi = useRef<THREE.HemisphereLight>(null);

  const ramp = useMemo(() => makeRamp(0.3, 0.8), []);
  useEffect(() => {
    makeRamp(settings.softness, 0.35 + 0.6 * settings.flatness, ramp);
  }, [ramp, settings.softness, settings.flatness]);

  const u = useMemo(
    () => ({
      uTime: { value: 0 },
      uSkirt: { value: 1 },
      uStreaks: { value: 1 },
      uGrassA: { value: new THREE.Color(PLANE_PALETTE.grassDark) },
      uGrassB: { value: new THREE.Color(PLANE_PALETTE.grassLight) },
    }),
    []
  );

  const mats = useMemo(() => {
    const out: Partial<Record<keyof PlanePalette, THREE.MeshToonMaterial>> = {};
    const mk = (slot: keyof PlanePalette) => {
      if (out[slot]) return out[slot]!;
      let m: THREE.MeshToonMaterial;
      if (slot === "dress") {
        // Hem ripple: strength grows from the waist down (bind-pose height).
        m = makePainterly(PLANE_PALETTE.dress, {
          ramp,
          key: "plane-dress",
          extraUniforms: { uTime: u.uTime, uSkirt: u.uSkirt },
          vertexAfterSkin: `
            float skirtMask = smoothstep(1.02, 0.6, position.y);
            float ang = atan(position.z, position.x);
            float w = sin(uTime * 2.1 + ang * 3.0 + position.y * 6.0) * 0.6 + sin(uTime * 1.3 - ang * 2.0) * 0.4;
            transformed.x += w * 0.018 * skirtMask * uSkirt;
            transformed.z += cos(uTime * 1.7 + ang * 2.0) * 0.012 * skirtMask * uSkirt;`,
        });
      } else {
        m = makePainterly(PLANE_PALETTE[slot], { ramp, key: "plane-" + slot });
      }
      out[slot] = m;
      return m;
    };
    const grass = makePainterly(PLANE_PALETTE.grassDark, {
      ramp,
      key: "plane-grass",
      extraUniforms: { uGrassA: u.uGrassA, uGrassB: u.uGrassB, uStreaks: u.uStreaks },
      // Wind-swept streaks stretched along the ground, with fine flecks on top.
      colorFragment: `
        vec3 gpos = vPaintWorld;
        float streak = fbm(vec3(gpos.x * 1.3, gpos.z * 9.0, 3.1));
        float fleck = fbm(vec3(gpos.x * 14.0, gpos.z * 40.0, 7.7));
        float tone = clamp(0.5 + (streak - 0.5) * 2.6 * uStreaks + (fleck - 0.5) * 0.8, 0.0, 1.0);
        diffuseColor.rgb = mix(uGrassA, uGrassB, tone);`,
    });
    gltf.scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      const light = o as THREE.Light;
      if (light.isLight) light.visible = false;
      if (!mesh.isMesh) return;
      const name = (mesh.material as THREE.Material).name.replace(/\.\d+$/, "");
      if (name === "MAT_Grass") {
        mesh.material = grass;
        mesh.scale.z *= 1.8; // deeper patch so it reads from the low camera
        mesh.receiveShadow = true;
        mesh.castShadow = false;
      } else {
        mesh.material = mk(SLOT[name] ?? "dress");
        mesh.castShadow = true;
        mesh.receiveShadow = true;
      }
      mesh.frustumCulled = false;
    });
    return out;
  }, [gltf, ramp, u]);

  useEffect(() => {
    const p = settings.palette;
    (Object.keys(mats) as (keyof PlanePalette)[]).forEach((k) => mats[k]!.color.set(p[k]));
    u.uGrassA.value.set(p.grassDark);
    u.uGrassB.value.set(p.grassLight);
    if (hemi.current) {
      hemi.current.color.set(p.skyLight);
      hemi.current.groundColor.set(p.bounce);
    }
  }, [settings.palette, mats, u]);

  // Camera: Blender's orthographic camera, rebuilt as a very long lens far away
  // so it reads flat but still blends with the chess camera's perspective.
  const cam = useMemo(() => {
    gltf.scene.position.copy(OFFSET);
    gltf.scene.updateWorldMatrix(true, true);
    const c = gltf.cameras?.[0] as THREE.OrthographicCamera | undefined;
    const pos = new THREE.Vector3();
    const quat = new THREE.Quaternion();
    let height = 4.6;
    if (c) {
      c.updateWorldMatrix(true, false);
      c.matrixWorld.decompose(pos, quat, new THREE.Vector3());
      height = (c.top - c.bottom) / (c.zoom || 1);
    }
    return { pos, quat, height };
  }, [gltf]);

  const hair = useMemo(() => {
    const out: { bone: THREE.Object3D; base: THREE.Quaternion; depth: number; side: number }[] = [];
    ["HairL", "HairC", "HairR"].forEach((c, ci) => {
      for (let i = 1; i <= 3; i++) {
        const b = gltf.scene.getObjectByName(`${c}0${i}`);
        if (b) out.push({ bone: b, base: b.quaternion.clone(), depth: i, side: ci - 1 });
      }
    });
    return out;
  }, [gltf]);

  // Push animation (Blender frames 1-96) scrubbed by scroll.
  const mixer = useMemo(() => {
    const m = new THREE.AnimationMixer(gltf.scene);
    for (const clip of gltf.animations) {
      const a = m.clipAction(clip);
      a.setLoop(THREE.LoopOnce, 1);
      a.clampWhenFinished = true;
      a.play();
    }
    return m;
  }, [gltf]);
  const clipLen = useMemo(() => Math.max(0.001, ...gltf.animations.map((c) => c.duration)), [gltf]);
  const pushT = useRef(0);
  const paper = useMemo(() => gltf.scene.getObjectByName("Paper_Plane") ?? null, [gltf]);
  // Where the plane is the moment it leaves her hand (Blender frame 27 of 96).
  const releasePos = useMemo(() => {
    const v = new THREE.Vector3();
    if (paper) {
      mixer.setTime((26 / 95) * clipLen);
      gltf.scene.updateMatrixWorld(true);
      paper.getWorldPosition(v);
      mixer.setTime(0);
    }
    return v;
  }, [paper, mixer, clipLen, gltf]);
  const follow = useRef(new THREE.Vector3());
  const tmp = useMemo(() => new THREE.Vector3(), []);

  const fwd = useMemo(() => new THREE.Vector3(), []);
  const q = useMemo(() => new THREE.Quaternion(), []);
  const ax = useMemo(() => new THREE.Vector3(), []);

  useFrame((state) => {
    const g = scrollState.eased;
    const b = beats(g);
    const active = !b.chessActive;
    if (group.current) group.current.visible = active;
    const t = state.clock.elapsedTime;
    u.uTime.value = t;
    u.uSkirt.value = settings.skirtSway;
    u.uStreaks.value = settings.grassStreaks;

    // Scroll drives the push; the clip is applied first, sway goes on top.
    pushT.current += (b.planePush - pushT.current) * 0.15;
    // Start every frame from the bind pose so the sway can never pile up.
    for (const h of hair) h.bone.quaternion.copy(h.base);
    mixer.setTime(Math.min(pushT.current * clipLen, clipLen - 1e-3));
    // After release the plane catches an updraft, so the camera riding with it
    // lifts her out of the bottom of the frame.
    if (paper) {
      const rel = 26 / 95;
      const e = Math.max(0, (pushT.current - rel) / (1 - rel));
      paper.position.y += settings.updraft * Math.pow(e, 1.5);
    }

    // Hair: a slow wave down each chain, tips moving most.
    const ph = ((t % settings.loopSeconds) / settings.loopSeconds) * Math.PI * 2;
    for (const h of hair) {
      const amp = settings.hairSway * 0.06 * h.depth;
      ax.set(1, 0, 0);
      q.setFromAxisAngle(ax, Math.sin(ph - h.depth * 0.7 + h.side) * amp);
      h.bone.quaternion.multiply(q);
      ax.set(0, 0, 1);
      q.setFromAxisAngle(ax, Math.sin(ph * 2 - h.depth * 0.9) * amp * 0.5);
      h.bone.quaternion.multiply(q);
    }

    if (!active) return;
    scene.fog = null;
    (scene.background as THREE.Color | null)?.isColor
      ? (scene.background as THREE.Color).set(settings.palette.sky)
      : (scene.background = new THREE.Color(settings.palette.sky));

    const camera = state.camera as THREE.PerspectiveCamera;
    const D = 400;
    fwd.set(0, 0, -1).applyQuaternion(cam.quat);
    const h = cam.height / settings.zoom;
    camera.quaternion.copy(cam.quat);
    camera.position.copy(cam.pos).addScaledVector(fwd, -D);
    // Keep the frame centred on her (and the plane's path) at any zoom.
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(cam.quat);
    camera.position.addScaledVector(right, settings.shiftX);
    camera.position.addScaledVector(new THREE.Vector3(0, 1, 0).applyQuaternion(cam.quat), settings.shiftY);
    // Exit: ride along with the plane, then let it go and hold on open sky.
    if (paper && !b.planeLetGo) {
      gltf.scene.updateMatrixWorld(true);
      paper.getWorldPosition(tmp);
      tmp.sub(releasePos);
      tmp.addScaledVector(fwd, -tmp.dot(fwd)); // stay in the picture plane
      follow.current.copy(tmp);
    }
    camera.position.addScaledVector(follow.current, b.planeFollow);
    // A little extra lift so she sinks out the bottom and the plane settles mid-frame.
    // Arrive from the sky: start a frame and a half higher, then settle.
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(cam.quat);
    camera.position.addScaledVector(up, h * 0.45 * b.planeFollow);
    camera.position.addScaledVector(up, h * 1.6 * (1 - b.planeIn));
    camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan(h / 2 / (D + 20)));
    camera.near = D - 60;
    camera.far = D + 200;
    camera.updateProjectionMatrix();

    if (sun.current) {
      const a = THREE.MathUtils.degToRad(settings.sunAzimuth);
      const e = THREE.MathUtils.degToRad(settings.sunElevation);
      const r = 30;
      sun.current.position.set(Math.cos(e) * Math.sin(a) * r, Math.sin(e) * r, Math.cos(e) * Math.cos(a) * r).add(OFFSET);
      sun.current.target.position.copy(OFFSET);
      sun.current.target.updateMatrixWorld();
      sun.current.intensity = settings.sunIntensity;
    }
    if (hemi.current) hemi.current.intensity = settings.ambient;
  });

  return (
    <group ref={group} visible={false}>
      <hemisphereLight ref={hemi} args={[PLANE_PALETTE.skyLight, PLANE_PALETTE.bounce, 1.6]} />
      <directionalLight
        ref={sun}
        color="#fff6ea"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0005}
        shadow-normalBias={0.02}
        shadow-radius={6}
        shadow-camera-left={-5}
        shadow-camera-right={5}
        shadow-camera-top={5}
        shadow-camera-bottom={-5}
        shadow-camera-near={1}
        shadow-camera-far={80}
      />
      <primitive object={gltf.scene} />
    </group>
  );
}

useGLTF.preload(PLANE_URL);
