// Vitest 4's happy-dom environment no longer exposes the native dialog
// functions on window. The app calls window.confirm (the unsaved-changes
// guard), and tests spy on it, so give it the browser's shape here; each
// test still decides the answer through its own spy.
if (typeof window !== "undefined" && typeof window.confirm !== "function") {
  window.confirm = () => true;
}

// A narrow window by default, as most tests assume (Cooking Mode opens its
// ingredients beside the step only on a wide one); a test that needs a wide
// window sets its own viewport.
type HappyWindow = Window & {
  happyDOM?: { setViewport(viewport: { width: number; height: number }): void };
};
beforeEach(() => {
  if (typeof window === "undefined") return;
  (window as HappyWindow).happyDOM?.setViewport({ width: 800, height: 900 });
});
