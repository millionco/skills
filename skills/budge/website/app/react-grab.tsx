"use client";

import { useEffect } from "react";

interface HighlightBounds {
  x: number;
  y: number;
  width: number;
  height: number;
  borderRadius: string;
  transform: string;
}

const BUDGE_HIGHLIGHT_BORDER = "#F59E0B";
const BUDGE_HIGHLIGHT_FILL = "rgba(245, 158, 11, 0.14)";

function budgeActivationKey() {
  const platform = navigator.platform || "";
  const isApple = /Mac|iPhone|iPad|iPod/.test(platform);
  return isApple ? "Meta+Shift+B" : "Control+Shift+B";
}

function createHighlight() {
  const el = document.createElement("div");
  el.setAttribute("data-budge-ui", "");
  el.setAttribute("data-budge-react-grab-highlight", "");
  el.style.cssText = [
    "position:fixed",
    "pointer-events:none",
    "box-sizing:border-box",
    "z-index:2147483645",
    "border:2px solid " + BUDGE_HIGHLIGHT_BORDER,
    "background:" + BUDGE_HIGHLIGHT_FILL,
    "box-shadow:none",
    "transition:left 80ms ease,top 80ms ease,width 80ms ease,height 80ms ease,opacity 80ms ease",
  ].join(";");
  document.body.appendChild(el);
  return el;
}

export function ReactGrab() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;
    let highlightEl: HTMLDivElement | null = null;

    const removeHighlight = () => {
      highlightEl?.remove();
      highlightEl = null;
    };

    import("react-grab/core").then(({ init }) => {
      const api = init({
        activationMode: "hold",
        activationKey: budgeActivationKey(),
        allowActivationInsideInput: false,
        freezeReactUpdates: false,
      });

      api.registerPlugin({
        name: "budge-hide-react-grab-ui",
        theme: {
          selectionBox: { enabled: false },
          dragBox: { enabled: false },
          grabbedBoxes: { enabled: false },
          elementLabel: { enabled: false },
          toolbar: { enabled: false },
        },
        hooks: {
          onDeactivate: removeHighlight,
          onSelectionBox(visible, bounds) {
            if (!visible || !bounds) {
              removeHighlight();
              return;
            }

            const box = (highlightEl ??= createHighlight());
            const b = bounds as HighlightBounds;
            box.style.left = `${b.x}px`;
            box.style.top = `${b.y}px`;
            box.style.width = `${b.width}px`;
            box.style.height = `${b.height}px`;
            box.style.borderRadius = b.borderRadius || "6px";
            box.style.transform = b.transform || "";
            box.style.opacity = "1";
          },
        },
      });
    });

    return removeHighlight;
  }, []);

  return null;
}
