import { Effect, EffectAttribute, BlendFunction } from "postprocessing";
import { Uniform } from "three";

// One full-screen pass that does three things in order:
//  1. lens: barrel distortion for the reference's super-wide, slightly bent board
//  2. paint: a Kuwahara filter, which flattens surfaces into brushy patches while
//     keeping edges crisp
//  3. paper: a fine screen grain and a soft vignette
const frag = /* glsl */ `
uniform float uRadius;
uniform float uLens;
uniform float uPaper;
uniform float uVignette;
uniform float uAspect;

vec2 lensUv(vec2 uv){
  vec2 c = uv - 0.5;
  c.x *= uAspect;
  float r2 = dot(c, c);
  float rmax2 = 0.25 * (uAspect * uAspect + 1.0);
  c *= (1.0 + uLens * r2) / (1.0 + uLens * rmax2);
  c.x /= uAspect;
  return c + 0.5;
}

float h12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }

void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor){
  vec2 st = lensUv(uv);
  int R = int(uRadius);
  vec3 col;
  if (R < 1) {
    col = texture2D(inputBuffer, st).rgb;
  } else {
    vec3 m[4]; vec3 s[4];
    for (int k = 0; k < 4; k++){ m[k] = vec3(0.0); s[k] = vec3(0.0); }
    float n = float((R + 1) * (R + 1));
    for (int j = 0; j <= 6; j++){
      if (j > R) break;
      for (int i = 0; i <= 6; i++){
        if (i > R) break;
        vec3 c0 = texture2D(inputBuffer, st + vec2(-i, -j) * texelSize).rgb;
        vec3 c1 = texture2D(inputBuffer, st + vec2( i, -j) * texelSize).rgb;
        vec3 c2 = texture2D(inputBuffer, st + vec2(-i,  j) * texelSize).rgb;
        vec3 c3 = texture2D(inputBuffer, st + vec2( i,  j) * texelSize).rgb;
        m[0] += c0; s[0] += c0 * c0;
        m[1] += c1; s[1] += c1 * c1;
        m[2] += c2; s[2] += c2 * c2;
        m[3] += c3; s[3] += c3 * c3;
      }
    }
    float best = 1e9;
    col = m[0] / n;
    for (int k = 0; k < 4; k++){
      vec3 mu = m[k] / n;
      vec3 var = abs(s[k] / n - mu * mu);
      float v = var.r + var.g + var.b;
      if (v < best){ best = v; col = mu; }
    }
  }
  // paper tooth
  float g = h12(floor(uv / texelSize * 0.75)) - 0.5;
  float g2 = h12(floor(uv / texelSize * 0.18) + 13.0) - 0.5;
  col *= 1.0 + (g * 0.6 + g2 * 0.4) * uPaper;
  // soft vignette
  vec2 d = uv - 0.5; d.x *= uAspect;
  col *= mix(1.0, 1.0 - dot(d, d) * 0.55, uVignette);
  outputColor = vec4(col, inputColor.a);
}
`;

export class PaintEffect extends Effect {
  constructor() {
    super("PaintEffect", frag, {
      blendFunction: BlendFunction.NORMAL,
      attributes: EffectAttribute.CONVOLUTION,
      uniforms: new Map<string, Uniform>([
        ["uRadius", new Uniform(4)],
        ["uLens", new Uniform(0.22)],
        ["uPaper", new Uniform(0.06)],
        ["uVignette", new Uniform(0.12)],
        ["uAspect", new Uniform(1.0)],
      ]),
    });
  }
  setSize(width: number, height: number) {
    (this.uniforms.get("uAspect") as Uniform).value = width / Math.max(1, height);
  }
}
