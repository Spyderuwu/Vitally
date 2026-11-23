// Colour slots sampled from the "Explorador en el tablero de ajedrez" reference.
// Every material in the GLB maps to one of these keys, so a palette swap
// recolours the whole scene without touching geometry.

export type PaletteKey =
  | "sky"
  | "haze"
  | "boardLight"
  | "boardDark"
  | "piece"
  | "suit"
  | "skin"
  | "hair"
  | "shoes"
  | "pants"
  | "briefcase"
  | "binoculars"
  | "shadow"
  | "bounce";

export type Palette = Record<PaletteKey, string>;

export const DEFAULT_PALETTE: Palette = {
  sky: "#a6cdf5",
  haze: "#f8f1e8",
  boardLight: "#f6ede3",
  boardDark: "#dcd4cd",
  piece: "#ece5de",
  suit: "#f7eee5",
  skin: "#7a5139",
  hair: "#a8a19c",
  shoes: "#efe6de",
  pants: "#f1e8df",
  briefcase: "#4e2e1e",
  binoculars: "#2a2624",
  shadow: "#e2ecfb",
  bounce: "#ebe6e1",
};

// A few alternates so the palette can be swapped like weather.
export const PRESETS: Record<string, Palette> = {
  Reference: DEFAULT_PALETTE,
  Dusk: {
    ...DEFAULT_PALETTE,
    sky: "#e9b9a6",
    haze: "#f4ddd2",
    boardLight: "#f4e6da",
    boardDark: "#d8c3b8",
    piece: "#f1e3d6",
    suit: "#f6e9dc",
    shadow: "#8b7fa8",
  },
  Overcast: {
    ...DEFAULT_PALETTE,
    sky: "#c9d0d6",
    haze: "#e3e6e8",
    boardLight: "#ecebe8",
    boardDark: "#cfcfcd",
    piece: "#e4e3df",
    shadow: "#9aa3ad",
  },
  Chartreuse: {
    ...DEFAULT_PALETTE,
    sky: "#a8cbf3",
    boardLight: "#eef3d2",
    boardDark: "#d4e86b",
    shadow: "#7f9bb8",
  },
};

// GLB material name -> palette slot.
export const MATERIAL_SLOTS: Record<string, PaletteKey> = {
  MAT_Man_Suit: "suit",
  MAT_Shirt: "suit",
  MAT_Pants: "pants",
  MAT_Skin: "skin",
  MAT_Hair: "hair",
  MAT_Shoes: "shoes",
  MAT_Man_Skin: "skin",
  MAT_Man_Hair: "hair",
  MAT_Man_Shoes: "shoes",
  MAT_Briefcase: "briefcase",
  MAT_Binoculars: "binoculars",
  MAT_Chess_Piece: "piece",
};
