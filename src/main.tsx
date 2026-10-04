import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import ErrorBoundary from "./components/ErrorBoundary";
import { getLang } from "./lib/i18n";
import { migrateLegacyStorage } from "./lib/migrate";
import "./index.css";
import { audioEngine } from "./lib/audioEngine";
import { parsePattern } from "./lib/parser";

migrateLegacyStorage(); // bombocaja.* → bakaluti.* before anything reads storage

// Dev-only lab hook: render patterns offline from the console / automation
// (window.__bakaluti.audioEngine.renderWav(parsePattern(code).lanes)).
if (import.meta.env.DEV) {
  (window as unknown as { __bakaluti: unknown }).__bakaluti = { audioEngine, parsePattern };
}
document.documentElement.lang = getLang();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);

// Offline support (production only — the SW would fight Vite's dev server).
if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    void navigator.serviceWorker.register("/sw.js");
  });
}
