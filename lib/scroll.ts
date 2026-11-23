// One page-scroll value shared by both scenes, plus the story beats on it.
//   0.00 – 0.30  chess: pieces fall, camera settles
//   0.30 – 0.46  hold: the finished chess scene stays put (you earn the next one)
//   0.46 – 0.55  chess camera tilts up into the sky
//   0.55 – 0.67  paper plane: camera descends out of the same sky
//   0.67 – 1.00  paper plane holds
export const scrollState = { raw: 0, eased: 0, override: -1 };

if (typeof window !== "undefined") {
  const onScroll = () => {
    const max = document.documentElement.scrollHeight - window.innerHeight;
    scrollState.raw = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
  };
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onScroll);
  setTimeout(onScroll, 0);
}

export const SPLIT = 0.55;
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
export const smooth = (x: number) => {
  const t = clamp01(x);
  return t * t * (3 - 2 * t);
};

/** Advance the eased value once per frame (call from exactly one place). */
export function tickScroll(dt: number) {
  const target = scrollState.override >= 0 ? scrollState.override : scrollState.raw;
  scrollState.eased += (target - scrollState.eased) * (1 - Math.exp(-dt * 8));
  return scrollState.eased;
}

export function beats(g: number) {
  return {
    chessActive: g < SPLIT,
    chessDrop: clamp01(g / 0.3),
    chessTiltUp: smooth((g - 0.46) / 0.09),
    planeIn: smooth((g - SPLIT) / 0.12), // 0 = still up in the sky, 1 = settled
  };
}
