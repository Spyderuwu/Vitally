import * as THREE from "three";

// Shared uniforms: every painterly material reads these, so one slider in the
// studio panel updates the whole scene at once.
export const paintUniforms = {
  uGrain: { value: 0.22 },
  uGrainScale: { value: 9.0 },
  uBoardA: { value: new THREE.Color("#f3eee6") },
  uBoardB: { value: new THREE.Color("#d6d4d0") },
  uSquare: { value: 2.2 },
};

// Soft two-tone ramp: a gentle shoulder instead of a hard toon step, so light
// rolls over forms the way gouache does.
let rampTex: THREE.DataTexture | null = null;
export function getRamp(softness = 0.22) {
  // Three flat values (shadow / half-tone / lit) with a short blend between them,
  // matching the cel-like steps traced from the reference.
  const size = 256;
  const data = new Uint8Array(size * 4);
  // One soft terminator: shadow -> lit, no half-tone band.
  const steps = [
    { at: 0.0, v: 0.4 },
    { at: 0.52, v: 1.0 },
  ];
  const ss = (a: number, b: number, x: number) => {
    const t = Math.min(1, Math.max(0, (x - a) / Math.max(1e-4, b - a)));
    return t * t * (3 - 2 * t);
  };
  for (let i = 0; i < size; i++) {
    const x = i / (size - 1);
    let v = steps[0].v;
    for (let k = 1; k < steps.length; k++) {
      const e = steps[k].at;
      v += (steps[k].v - steps[k - 1].v) * ss(e - softness, e + softness, x);
    }
    const b = Math.round(255 * v);
    data.set([b, b, b, 255], i * 4);
  }
  if (!rampTex) {
    rampTex = new THREE.DataTexture(data, size, 1, THREE.RGBAFormat);
    rampTex.magFilter = THREE.LinearFilter;
    rampTex.minFilter = THREE.LinearFilter;
    rampTex.generateMipmaps = false;
  } else {
    (rampTex.image.data as Uint8Array).set(data);
  }
  rampTex.needsUpdate = true;
  return rampTex;
}

const NOISE = /* glsl */ `
  varying vec3 vPaintPos;
  varying vec3 vPaintWorld;
  uniform float uGrain;
  uniform float uGrainScale;
  float ph(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
  float pn(vec3 x){
    vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(ph(i), ph(i + vec3(1,0,0)), f.x), mix(ph(i + vec3(0,1,0)), ph(i + vec3(1,1,0)), f.x), f.y),
               mix(mix(ph(i + vec3(0,0,1)), ph(i + vec3(1,0,1)), f.x), mix(ph(i + vec3(0,1,1)), ph(i + vec3(1,1,1)), f.x), f.y), f.z);
  }
  float fbm(vec3 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 4; i++){ s += a * pn(p); p *= 2.07; a *= 0.5; } return s; }
`;

/**
 * A MeshToonMaterial with painterly additions:
 *  - soft ramp lighting (via gradientMap)
 *  - grain that is pinned to the surface (object space), so it travels with
 *    the forms instead of sliding over them like a screen overlay
 *  - optional world-space checkerboard for the ground
 * Toon keeps skinning, morph targets and shadows working for free.
 */
export function makePainterly(color: THREE.ColorRepresentation, opts: { board?: boolean } = {}) {
  const mat = new THREE.MeshToonMaterial({ color, gradientMap: getRamp() });
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, paintUniforms);
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vPaintPos;\nvarying vec3 vPaintWorld;")
      .replace(
        "#include <skinning_vertex>",
        "#include <skinning_vertex>\nvPaintPos = transformed;\nvPaintWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;"
      );
    const board = opts.board
      ? `
        vec2 q = floor(vPaintWorld.xz / uSquare + 0.5); // squares centred on the grid, centre piece on (0,0)
        float chk = mod(q.x + q.y, 2.0);
        diffuseColor.rgb = mix(uBoardA, uBoardB, chk);
`
      : ``;
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>\n${NOISE}\nuniform vec3 uBoardA;\nuniform vec3 uBoardB;\nuniform float uSquare;`
      )
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
        ${board}
        // World-space grain: the posed (skinned) position is used, so it rides along with the surface.
        vec3 gp = vPaintWorld;
        float g1 = fbm(gp * uGrainScale);
        float g2 = fbm(gp * uGrainScale * 7.0);
        diffuseColor.rgb *= 1.0 + ((g1 - 0.5) * 0.55 + (g2 - 0.5) * 0.45) * uGrain;`
      );
  };
  mat.customProgramCacheKey = () => (opts.board ? "painterly-board" : "painterly");
  return mat;
}
