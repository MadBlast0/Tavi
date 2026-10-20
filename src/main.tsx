import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { restoreFontFamily, warmInstalledFonts } from "./lib/fonts";
import { restorePalette } from "./lib/palette";
import "./index.css";

// Before the first render, so the app is never painted in the default face and
// then swapped to the chosen one.
restoreFontFamily();
// Same for the palette, and for the same reason: the stylesheet selects tokens
// on an attribute, so setting it after the first paint would mean being drawn
// in one palette and then repainted in another. The inline script in
// index.html normally gets here first; this is the fallback for any host that
// serves the bundle without that page.
restorePalette();
// Started here rather than when the settings card opens: the scan reads a
// system database and takes long enough to be felt, and the result is cached
// for the session. Fire-and-forget so nothing waits on it.
warmInstalledFonts();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
