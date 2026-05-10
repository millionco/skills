"use client";

import { useEffect } from "react";
import type { ReactGrabAPI } from "react-grab/core";

type ReactGrabRuntimeState = ReturnType<ReactGrabAPI["getState"]>;

const BUDGE_HIGHLIGHT_BORDER = "#F59E0B";
const BUDGE_HIGHLIGHT_FILL = "rgba(245, 158, 11, 0.14)";
const REACT_GRAB_SUPPRESS_STYLE_ATTR = "data-budge-react-grab-suppress";
const REACT_GRAB_DOCUMENT_SUPPRESS_CSS = `
  canvas[data-react-grab-overlay-canvas] {
    display: none !important;
    opacity: 0 !important;
  }

  [data-react-grab-frozen] {
    box-shadow: none !important;
    filter: none !important;
  }
`;
const REACT_GRAB_SHADOW_SUPPRESS_CSS = `
  ${REACT_GRAB_DOCUMENT_SUPPRESS_CSS}

  div[style*="box-shadow"][style*="inset"] {
    box-shadow: none !important;
    opacity: 0 !important;
  }
`;

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
    "z-index:2147483646",
    "border:2px solid " + BUDGE_HIGHLIGHT_BORDER,
    "background:" + BUDGE_HIGHLIGHT_FILL,
    "box-shadow:none",
    "transition:left 80ms ease,top 80ms ease,width 80ms ease,height 80ms ease,opacity 80ms ease",
  ].join(";");
  document.body.appendChild(el);
  return el;
}

function injectSuppressStyle(root: Document | ShadowRoot) {
  if (root.querySelector(`style[${REACT_GRAB_SUPPRESS_STYLE_ATTR}]`)) return null;

  const style = document.createElement("style");
  style.setAttribute("data-budge-ui", "");
  style.setAttribute(REACT_GRAB_SUPPRESS_STYLE_ATTR, "");
  style.textContent = root instanceof Document
    ? REACT_GRAB_DOCUMENT_SUPPRESS_CSS
    : REACT_GRAB_SHADOW_SUPPRESS_CSS;

  if (root instanceof Document) {
    root.head.appendChild(style);
  } else {
    root.appendChild(style);
  }

  return style;
}

function injectShadowSuppressStyles() {
  for (const host of document.querySelectorAll<HTMLElement>("[data-react-grab]")) {
    if (host.shadowRoot) injectSuppressStyle(host.shadowRoot);
  }
}

export function ReactGrab() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;
    let highlightEl: HTMLDivElement | null = null;
    const suppressStyle = injectSuppressStyle(document);
    injectShadowSuppressStyles();
    const suppressObserver = new MutationObserver(injectShadowSuppressStyles);
    suppressObserver.observe(document.documentElement, {
      childList: true,
      subtree: true,
    });

    const removeHighlight = () => {
      highlightEl?.remove();
      highlightEl = null;
    };

    const updateHighlight = (state: ReactGrabRuntimeState) => {
      const target = state.isActive && !state.isDragging && !state.isCopying
        ? state.targetElement
        : null;

      if (!target) {
        removeHighlight();
        return;
      }

      const bounds = target.getBoundingClientRect();
      if (bounds.width <= 0 || bounds.height <= 0) {
        removeHighlight();
        return;
      }

      const box = (highlightEl ??= createHighlight());
      const computed = getComputedStyle(target);
      box.style.left = `${bounds.left}px`;
      box.style.top = `${bounds.top}px`;
      box.style.width = `${bounds.width}px`;
      box.style.height = `${bounds.height}px`;
      box.style.borderRadius = computed.borderRadius || "6px";
      box.style.transform = "";
      box.style.opacity = "1";
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
          onStateChange: updateHighlight,
        },
      });
    });

    return () => {
      removeHighlight();
      suppressStyle?.remove();
      suppressObserver.disconnect();
    };
  }, []);

  return null;
}
