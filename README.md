# Explorer · painterly chess

A WebGL study of the "Explorer on the chessboard" illustration: the Blender
scene rendered live in the browser with a painterly look, adjustable light and
colour, and exports.

## Run it

```bash
npm install
npm run dev        # http://localhost:3000
```

- **Studio** (default): control panel on the right for palette, light, paint and
  motion, plus PNG still and one-loop WebM export.
- **Embed** (`/?embed`): no panel; the cursor drives the sun. This is the mode to
  drop into a page.

## Updating the scene from Blender

Export from `Lowpolypeeps.blend` to `public/models/chess_scene.glb`
(glTF binary; selection = the man, his rig, the props, the pieces, `Chess_Cam`;
animations **off**, "Use Rest Position" **off** so the current pose is baked;
shape keys **on**). The board, sky and sun are built in code.

Material names in the GLB map to palette slots in `lib/palette.ts`. A new
material just needs an entry there.

## How the look is built

| Layer | Where |
| --- | --- |
| Soft ramp light, surface grain, checkerboard | `lib/painterlyMaterial.ts` (MeshToonMaterial + shader patches; skinning, morphs and shadows still work) |
| Lens bend, Kuwahara paint filter, paper tooth, vignette | `lib/PaintEffect.ts` (one post pass) |
| Camera from Blender, sun, sky fill, idle loop | `components/ChessScene.tsx` |
| Panel, presets, exports, embed mode | `components/Studio.tsx` |

## Share with the team (GitHub Pages)

1. Push to `main` (the workflow lives in `.github/workflows/pages.yml`).
2. Repo **Settings → Pages → Source: GitHub Actions**.
3. Every push builds and publishes to `https://spyderuwu.github.io/Vitally/`.

Pages sites on a free plan are public to anyone with the link.

For production, the same code deploys to Vercel unchanged (leave
`NEXT_PUBLIC_BASE_PATH` unset).
