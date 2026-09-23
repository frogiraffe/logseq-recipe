// Vitest 4's happy-dom environment no longer exposes the native dialog
// functions on window. The app calls window.confirm (the unsaved-changes
// guard), and tests spy on it, so give it the browser's shape here; each
// test still decides the answer through its own spy.
if (typeof window.confirm !== "function") {
  window.confirm = () => true;
}
