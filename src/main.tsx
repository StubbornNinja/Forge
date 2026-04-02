import React from "react";
import ReactDOM from "react-dom/client";
import "@fontsource-variable/inter";
import App from "./App";
import "./styles/globals.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

// Debug: check drag region elements
setTimeout(() => {
  const dragEls = document.querySelectorAll('[data-tauri-drag-region]');
  console.log(`[drag-debug] Found ${dragEls.length} drag region elements`);
  dragEls.forEach((el, i) => {
    const styles = window.getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    console.log(`[drag-debug] Element ${i}:`, {
      tag: el.tagName,
      classes: el.className.substring(0, 80),
      webkitAppRegion: styles.getPropertyValue('-webkit-app-region') || styles.getPropertyValue('app-region') || '(not set)',
      rect: `${rect.width}x${rect.height} at (${rect.x}, ${rect.y})`,
      zIndex: styles.zIndex,
      pointerEvents: styles.pointerEvents,
      display: styles.display,
    });
  });
}, 1000);
