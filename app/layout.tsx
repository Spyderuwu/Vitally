import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Explorer · painterly chess",
  description: "Painterly WebGL study of the Explorer on the chessboard illustration.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, overflow: "hidden", background: "#a8cbf3" }}>{children}</body>
    </html>
  );
}
