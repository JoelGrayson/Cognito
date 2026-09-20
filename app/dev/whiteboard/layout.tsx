import type { Viewport } from "next";

/**
 * Scoped to the whiteboard only. Pinch-zoom is disabled here because on a touch device it
 * fights the drawing surface -- a two-finger gesture meant for the canvas ends up
 * zooming the whole page instead. Deliberately NOT set in the root layout, where
 * disabling zoom app-wide would be an accessibility regression.
 */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#f5eee8",
};

export default function WhiteboardLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
