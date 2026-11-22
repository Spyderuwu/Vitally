"use client";

import dynamic from "next/dynamic";

// WebGL only runs in the browser, so the studio skips server rendering.
const Studio = dynamic(() => import("@/components/Studio"), { ssr: false });

export default function Page() {
  return <Studio />;
}
