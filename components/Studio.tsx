"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { Canvas, useThree } from "@react-three/fiber";
import { EffectComposer } from "@react-three/postprocessing";
import { Leva, button, folder, useControls } from "leva";
import { ChessScene, SceneSettings } from "./ChessScene";
import { PlaneScene, PLANE_PALETTE, PlaneSettings, PlanePalette } from "./PlaneScene";
import { scrollState } from "@/lib/scroll";
import { PaintEffect } from "@/lib/PaintEffect";
import { paintUniforms } from "@/lib/painterlyMaterial";
import { DEFAULT_PALETTE, PRESETS, Palette, PaletteKey } from "@/lib/palette";

type PaintSettings = { radius: number; lens: number; paper: number; vignette: number };

function Paint({ s }: { s: PaintSettings }) {
  const effect = useMemo(() => new PaintEffect(), []);
  useEffect(() => {
    effect.uniforms.get("uRadius")!.value = s.radius;
    effect.uniforms.get("uLens")!.value = s.lens;
    effect.uniforms.get("uPaper")!.value = s.paper;
    effect.uniforms.get("uVignette")!.value = s.vignette;
  }, [effect, s]);
  return (
    <EffectComposer multisampling={4}>
      <primitive object={effect} dispose={null} />
    </EffectComposer>
  );
}

// Exposes the canvas to the export buttons.
function GlGrabber({ onGl }: { onGl: (gl: THREE.WebGLRenderer) => void }) {
  const { gl } = useThree();
  useEffect(() => {
    onGl(gl);
  }, [gl, onGl]);
  return null;
}

function download(url: string, name: string) {
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
}

export default function Studio() {
  const [embed, setEmbed] = useState(false);
  useEffect(() => {
    setEmbed(new URLSearchParams(window.location.search).has("embed"));
  }, []);

  const glRef = useRef<THREE.WebGLRenderer | null>(null);
  const [recording, setRecording] = useState(false);

  const [pal, setPal] = useControls(
    "Palette",
    () => ({
      sky: DEFAULT_PALETTE.sky,
      haze: DEFAULT_PALETTE.haze,
      boardLight: { value: DEFAULT_PALETTE.boardLight, label: "board light" },
      boardDark: { value: DEFAULT_PALETTE.boardDark, label: "board dark" },
      piece: DEFAULT_PALETTE.piece,
      suit: DEFAULT_PALETTE.suit,
      skin: DEFAULT_PALETTE.skin,
      hair: DEFAULT_PALETTE.hair,
      cap: DEFAULT_PALETTE.cap,
      shoes: DEFAULT_PALETTE.shoes,
      pants: DEFAULT_PALETTE.pants,
      briefcase: DEFAULT_PALETTE.briefcase,
      binoculars: DEFAULT_PALETTE.binoculars,
      shadow: { value: DEFAULT_PALETTE.shadow, label: "sky light" },
      bounce: { value: DEFAULT_PALETTE.bounce, label: "bounce light" },
    }),
    { collapsed: false }
  );

  useControls("Palette", {
    presets: folder(
      Object.fromEntries(
        Object.entries(PRESETS).map(([name, p]) => [name, button(() => setPal(p as Partial<Palette>))])
      ),
      { collapsed: true }
    ),
  });

  const light = useControls("Light", {
    cursorSun: { value: true, label: "cursor is sun" },
    sunAzimuth: { value: 255, min: 0, max: 360, step: 1, label: "sun azimuth" },
    sunElevation: { value: 16, min: 4, max: 85, step: 1, label: "sun elevation" },
    sunIntensity: { value: 2.9, min: 0, max: 6, step: 0.05, label: "sun strength" },
    ambient: { value: 0.95, min: 0, max: 3, step: 0.05, label: "sky fill" },
    shadowSoftness: { value: 6, min: 1, max: 16, step: 1, label: "shadow softness" },
  });

  const paint = useControls("Paint", {
    rampSoftness: { value: 0.22, min: 0.02, max: 0.48, step: 0.01, label: "light falloff" },
    grain: { value: 0.22, min: 0, max: 0.8, step: 0.01, label: "surface grain" },
    grainScale: { value: 9, min: 1, max: 40, step: 0.5, label: "grain scale" },
    radius: { value: 3, min: 0, max: 6, step: 1, label: "brush size" },
    paper: { value: 0.06, min: 0, max: 0.3, step: 0.005, label: "paper tooth" },
    vignette: { value: 0.12, min: 0, max: 1, step: 0.01 },
    focal: { value: 11.5, min: 6, max: 35, step: 0.5, label: "focal length (mm)" },
    lens: { value: 0.09, min: 0, max: 0.8, step: 0.01, label: "lens bend" },
    square: { value: 2.2, min: 0.4, max: 6, step: 0.05, label: "board square (m)" },
  });

  const drop = useControls("Scroll drop", {
    dropEnabled: { value: true, label: "pieces fall on scroll" },
    dropHeight: { value: 14, min: 0, max: 40, step: 0.5, label: "drop height" },
    camMove: { value: 1, min: 0, max: 3, step: 0.05, label: "camera move" },
    followScroll: { value: true, label: "follow page scroll" },
    dropPreview: { value: 1, min: 0, max: 1, step: 0.01, label: "preview", render: (get) => !get("Scroll drop.followScroll") },
  });

  const story = useControls("Story", {
    preview: { value: "follow scroll", options: ["follow scroll", "chess", "paper plane", "after the push"], label: "show scene" },
  });
  useEffect(() => {
    scrollState.override = story.preview === "chess" ? 0.38 : story.preview === "paper plane" ? 0.69 : story.preview === "after the push" ? 1 : -1;
  }, [story.preview]);

  const planePal = useControls("Paper plane · palette", {
    sky: PLANE_PALETTE.sky,
    skin: PLANE_PALETTE.skin,
    dress: PLANE_PALETTE.dress,
    top: PLANE_PALETTE.top,
    hair: PLANE_PALETTE.hair,
    shoes: PLANE_PALETTE.shoes,
    paper: PLANE_PALETTE.paper,
    grassDark: { value: PLANE_PALETTE.grassDark, label: "grass dark" },
    grassLight: { value: PLANE_PALETTE.grassLight, label: "grass light" },
    skyLight: { value: PLANE_PALETTE.skyLight, label: "sky light" },
    bounce: { value: PLANE_PALETTE.bounce, label: "bounce light" },
  }, { collapsed: true });

  const plane = useControls("Paper plane · light & motion", {
    sunAzimuth: { value: 250, min: 0, max: 360, step: 1, label: "sun azimuth" },
    sunElevation: { value: 40, min: 4, max: 85, step: 1, label: "sun elevation" },
    sunIntensity: { value: 1.6, min: 0, max: 6, step: 0.05, label: "sun strength" },
    ambient: { value: 2.2, min: 0, max: 4, step: 0.05, label: "sky fill" },
    flatness: { value: 0.75, min: 0, max: 1, step: 0.01 },
    softness: { value: 0.3, min: 0.02, max: 0.48, step: 0.01, label: "light falloff" },
    zoom: { value: 1.25, min: 0.5, max: 3, step: 0.01 },
    shiftX: { value: 0.15, min: -2, max: 2, step: 0.01, label: "frame shift x" },
    shiftY: { value: -0.12, min: -2, max: 2, step: 0.01, label: "frame shift y" },
    hairSway: { value: 1, min: 0, max: 3, step: 0.05, label: "hair sway" },
    skirtSway: { value: 1, min: 0, max: 3, step: 0.05, label: "skirt sway" },
    grassStreaks: { value: 1, min: 0, max: 2, step: 0.05, label: "grass streaks" },
  }, { collapsed: true });

  const motion = useControls("Motion", {
    idle: { value: true, label: "idle loop" },
    loopSeconds: { value: 4, options: { "4 s": 4, "6 s": 6, "8 s": 8 }, label: "loop length" },
  });

  useEffect(() => {
    paintUniforms.uGrain.value = paint.grain;
    paintUniforms.uGrainScale.value = paint.grainScale;
    paintUniforms.uSquare.value = paint.square;
  }, [paint.grain, paint.grainScale, paint.square]);

  useControls(
    "Export",
    {
      "Save still (PNG)": button(() => {
        const gl = glRef.current;
        if (!gl) return;
        download(gl.domElement.toDataURL("image/png"), "explorer-chess.png");
      }),
      "Record one loop (WebM)": button(() => {
        const gl = glRef.current;
        if (!gl || recording) return;
        const stream = gl.domElement.captureStream(60);
        const rec = new MediaRecorder(stream, { mimeType: "video/webm;codecs=vp9", videoBitsPerSecond: 16_000_000 });
        const chunks: Blob[] = [];
        rec.ondataavailable = (e) => chunks.push(e.data);
        rec.onstop = () => {
          setRecording(false);
          download(URL.createObjectURL(new Blob(chunks, { type: "video/webm" })), "explorer-chess-loop.webm");
        };
        setRecording(true);
        rec.start();
        setTimeout(() => rec.stop(), (motion.loopSeconds as number) * 1000);
      }),
    },
    { collapsed: true },
    [motion.loopSeconds, recording]
  );

  const settings: SceneSettings = {
    palette: pal as unknown as Palette,
    sunAzimuth: light.sunAzimuth,
    sunElevation: light.sunElevation,
    sunIntensity: light.sunIntensity,
    ambient: light.ambient,
    shadowSoftness: light.shadowSoftness,
    rampSoftness: paint.rampSoftness,
    idle: motion.idle,
    loopSeconds: motion.loopSeconds as number,
    cursorSun: embed || light.cursorSun,
    dropEnabled: drop.dropEnabled,
    dropHeight: drop.dropHeight,
    camMove: drop.dropEnabled ? drop.camMove : 0,
    focal: paint.focal,
    dropPreview: drop.followScroll ? -1 : drop.dropPreview,
  };

  const planeSettings: PlaneSettings = {
    palette: planePal as unknown as PlanePalette,
    sunAzimuth: plane.sunAzimuth,
    sunElevation: plane.sunElevation,
    sunIntensity: plane.sunIntensity,
    ambient: plane.ambient,
    flatness: plane.flatness,
    softness: plane.softness,
    zoom: plane.zoom,
    shiftX: plane.shiftX,
    shiftY: plane.shiftY,
    hairSway: plane.hairSway,
    skirtSway: plane.skirtSway,
    grassStreaks: plane.grassStreaks,
    loopSeconds: motion.loopSeconds as number,
  };

  return (
    <>
    {/* Scroll track: the page is tall so scrolling drives the drop; the scene stays pinned. */}
    <div style={{ height: "800vh" }} />
    <div style={{ position: "fixed", inset: 0, background: (pal as Record<PaletteKey, string>).sky }}>
      <Leva hidden={embed} collapsed={false} titleBar={{ title: "Explorer · studio" }} />
      <Canvas
        shadows
        dpr={[1, 2]}
        gl={{ preserveDrawingBuffer: true, antialias: true, toneMapping: THREE.NoToneMapping }}
        camera={{ fov: 50, position: [0, 2, 6] }}
      >
        <GlGrabber onGl={(gl) => (glRef.current = gl)} />
        <Suspense fallback={null}>
          <ChessScene settings={settings} />
          <PlaneScene settings={planeSettings} />
        </Suspense>
        <Paint s={{ radius: paint.radius, lens: paint.lens, paper: paint.paper, vignette: paint.vignette }} />
      </Canvas>
      {recording && (
        <div
          style={{
            position: "fixed",
            left: 16,
            bottom: 16,
            font: "12px/1 system-ui",
            color: "#fff",
            background: "rgba(0,0,0,.35)",
            padding: "8px 10px",
            borderRadius: 6,
          }}
        >
          Recording loop…
        </div>
      )}
    </div>
    </>
  );
}
