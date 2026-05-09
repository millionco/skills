"use client";

import { useEffect } from "react";

function budgeActivationKey() {
  const platform = navigator.platform || "";
  const isApple = /Mac|iPhone|iPad|iPod/.test(platform);
  return isApple ? "Meta+Shift+B" : "Control+Shift+B";
}

export function ReactGrab() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;
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
      });
    });
  }, []);

  return null;
}
