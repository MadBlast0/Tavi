import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { readyChats } from "./lib/chats";
import { restoreFontFamily, warmInstalledFonts } from "./lib/fonts";
import { runMigrations } from "./lib/migrations";
import { restorePalette } from "./lib/palette";
import { readySessions } from "./lib/sessions";
import "./index.css";

// The changes made to what is on disk, once. Before the first render, so the
// app never sees the old shape of its own data.
runMigrations();
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

/**
 * The conversations are read before the first paint.
 *
 * On the desktop they are in the app's own file, which takes a round trip to
 * read, and the rail would otherwise show an empty list for the moment it
 * takes. The wait is bounded: a store that cannot be read must not stop the
 * app from opening, and an app that does not open cannot say why.
 */
const PAINT_WAIT_MS = 2000;

const root = ReactDOM.createRoot(document.getElementById("root") as HTMLElement);
let painted = false;
const paint = () => {
  if (painted) return;
  painted = true;
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
};

void Promise.all([readyChats(), readySessions()]).then(paint, paint);
setTimeout(paint, PAINT_WAIT_MS);

