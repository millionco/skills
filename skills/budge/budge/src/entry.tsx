import { createIsolet } from "isolet-js";
import { react } from "isolet-js/react";
import { Budge, setAssetBase } from "./budge";
import type { BudgeSlide } from "./budge";

const budgeScript = typeof document !== "undefined"
  ? document.currentScript as HTMLScriptElement | null
  : null;

const scriptBase = (() => {
  if (typeof document === "undefined") return "";
  const src = budgeScript?.getAttribute("src");
  if (!src) return "";
  try {
    return new URL(src, location.href).href.replace(/\/[^/]+$/, "");
  } catch {
    return "";
  }
})();

if (scriptBase) setAssetBase(scriptBase);

export const widget = createIsolet({
  name: "budge-widget",
  mount: react(Budge),
  isolation: "none",
});

type BudgeRuntimeConfig = { slides?: BudgeSlide[]; autoFocus?: boolean };

const AUTO_DETECT_ATTR = "data-budge-autodetect";
const BUDGE_TARGET_ATTR = "data-budge-target";
const BUDGE_UI_SELECTOR = "[data-budge-ui]";
const BUDGE_CONFIG_SELECTOR = "[data-budge]";

let explicitConfigFingerprint = "";
let autoConfig: BudgeRuntimeConfig | null = null;
let autoConfigFingerprint = "";
let autoTarget: HTMLElement | null = null;
let autoTargetHadMarker = false;

function readConfig(): BudgeRuntimeConfig | null {
  const el = document.querySelector("[data-budge]");
  if (!el) return null;
  try {
    return JSON.parse(el.getAttribute("data-budge") || "{}") as BudgeRuntimeConfig;
  } catch {
    return null;
  }
}

function hasSlides(config: BudgeRuntimeConfig | null): config is Required<Pick<BudgeRuntimeConfig, "slides">> & BudgeRuntimeConfig {
  return !!config?.slides && Array.isArray(config.slides) && config.slides.length > 0;
}

function configFingerprint(config: BudgeRuntimeConfig | null) {
  if (!config) return "";
  try {
    return JSON.stringify(config);
  } catch {
    return "";
  }
}

function sync() {
  const explicitConfig = readConfig();
  const explicitFingerprint = configFingerprint(explicitConfig);
  const config = explicitConfig ? explicitConfig : autoConfig;
  const fingerprint = explicitConfig ? explicitFingerprint : autoConfigFingerprint;

  if (hasSlides(config) && !widget.mounted) {
    widget.mount(document.body, { slides: config.slides, autoFocus: config.autoFocus ?? true });
  } else if (hasSlides(config) && widget.mounted && fingerprint !== explicitConfigFingerprint) {
    widget.update({ slides: config.slides, autoFocus: config.autoFocus ?? true });
  } else if (!hasSlides(config) && widget.mounted) {
    widget.unmount();
  }

  explicitConfigFingerprint = fingerprint;
}

function isLocalDevHost() {
  const host = location.hostname;
  return host === "localhost" ||
    host === "127.0.0.1" ||
    host === "::1" ||
    host.endsWith(".local") ||
    /^192\.168\./.test(host) ||
    /^10\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(host);
}

function readAutoDetectSetting() {
  const attr =
    budgeScript?.getAttribute(AUTO_DETECT_ATTR) ??
    budgeScript?.getAttribute("data-budge-auto") ??
    document.documentElement.getAttribute(AUTO_DETECT_ATTR);

  if (attr === "false" || attr === "off" || attr === "0") return false;
  if (attr === "true" || attr === "on" || attr === "1") return true;
  return isLocalDevHost();
}

const TRACKED_PROPERTIES = [
  "padding-top",
  "padding-right",
  "padding-bottom",
  "padding-left",
  "margin-top",
  "margin-right",
  "margin-bottom",
  "margin-left",
  "gap",
  "row-gap",
  "column-gap",
  "font-size",
  "line-height",
  "letter-spacing",
  "border-radius",
  "border-top-left-radius",
  "border-top-right-radius",
  "border-bottom-right-radius",
  "border-bottom-left-radius",
  "border-width",
  "opacity",
  "width",
  "height",
  "max-width",
  "max-height",
] as const;

type TrackedProperty = typeof TRACKED_PROPERTIES[number];
type StyleSnapshot = Record<TrackedProperty, string>;

interface NumericValue {
  value: number;
  unit: string;
}

interface PropertyChange {
  property: TrackedProperty;
  before: NumericValue;
  after: NumericValue;
}

const snapshots = new WeakMap<Element, StyleSnapshot>();

function shouldIgnoreElement(el: Element) {
  return el === document.documentElement ||
    el === document.body ||
    el.closest(BUDGE_UI_SELECTOR) ||
    el.closest(BUDGE_CONFIG_SELECTOR);
}

function isRecentBudgePreview() {
  const lastPreviewAt = (window as any).__BUDGE_LAST_PREVIEW_AT__;
  return typeof lastPreviewAt === "number" && performance.now() - lastPreviewAt < 250;
}

function snapshotElement(el: Element): StyleSnapshot {
  const cs = getComputedStyle(el);
  const out = {} as StyleSnapshot;
  for (const prop of TRACKED_PROPERTIES) {
    out[prop] = cs.getPropertyValue(prop);
  }
  return out;
}

function parseNumeric(value: string): NumericValue | null {
  const raw = value.trim();
  if (!raw || raw === "auto" || raw === "normal" || raw === "none") return null;

  const numeric = Number.parseFloat(raw);
  if (!Number.isFinite(numeric)) return null;

  if (raw.endsWith("%")) return { value: numeric, unit: "%" };
  if (raw.endsWith("rem")) return { value: numeric * 16, unit: "px" };
  if (raw.endsWith("em")) return { value: numeric * 16, unit: "px" };
  if (raw.endsWith("px")) return { value: numeric, unit: "px" };
  return { value: numeric, unit: "" };
}

function valuesChanged(before: NumericValue, after: NumericValue) {
  const epsilon = before.unit === "%" || after.unit === "%" ? 0.05 : 0.5;
  return Math.abs(before.value - after.value) >= epsilon;
}

function diffSnapshots(before: StyleSnapshot, after: StyleSnapshot): PropertyChange[] {
  const changes: PropertyChange[] = [];
  for (const property of TRACKED_PROPERTIES) {
    if (before[property] === after[property]) continue;
    const beforeValue = parseNumeric(before[property]);
    const afterValue = parseNumeric(after[property]);
    if (!beforeValue || !afterValue) continue;
    if (!valuesChanged(beforeValue, afterValue)) continue;
    changes.push({ property, before: beforeValue, after: afterValue });
  }
  return changes;
}

function relatedProperties(property: string) {
  if (property.startsWith("padding")) return ["padding-top", "padding-bottom", "padding-left", "padding-right"];
  if (property.startsWith("margin")) return ["margin-top", "margin-bottom", "margin-left", "margin-right"];
  if (property.includes("gap")) return ["gap", "row-gap", "column-gap"];
  if (property === "font-size") return ["line-height", "letter-spacing"];
  if (property.startsWith("border-radius")) {
    return [
      "border-top-left-radius",
      "border-top-right-radius",
      "border-bottom-right-radius",
      "border-bottom-left-radius",
    ];
  }
  if (property === "width" || property === "max-width") return ["height", "max-width"];
  if (property === "height" || property === "max-height") return ["width", "max-height"];
  return [];
}

function slideBounds(property: string, value: number, unit: string) {
  if (property === "opacity") return { min: 0, max: 100 };
  if (property === "letter-spacing") return { min: -10, max: 20 };
  if (property === "font-size") return { min: 8, max: 96 };
  if (property === "line-height") return { min: 0, max: 120 };
  if (property.includes("radius")) return { min: 0, max: 96 };
  if (property === "width" || property === "height" || property.startsWith("max-")) {
    return { min: 0, max: Math.max(512, Math.ceil(value * 2)) };
  }
  if (unit === "%") return { min: 0, max: 100 };
  return { min: property.startsWith("margin") ? -128 : 0, max: 128 };
}

function normalizeSlideValue(property: string, value: NumericValue): NumericValue {
  if (property === "opacity") return { value: Math.round(value.value * 100), unit: "%" };
  return { value: Math.round(value.value * 100) / 100, unit: value.unit || "px" };
}

function valuesAreAligned(changes: PropertyChange[]) {
  if (changes.length === 0) return false;
  const first = changes[0];
  return changes.every((change) => {
    const sameValue = Math.abs(change.after.value - first.after.value) < 0.5;
    const sameDelta = Math.abs((change.after.value - change.before.value) - (first.after.value - first.before.value)) < 0.5;
    return sameValue || sameDelta;
  });
}

function choosePrimaryChange(changes: PropertyChange[]): PropertyChange | null {
  const byProperty = new Map(changes.map((change) => [change.property, change]));
  const grouped: Array<{ properties: TrackedProperty[]; change: PropertyChange; label: string; property: string }> = [
    {
      properties: ["padding-top", "padding-right", "padding-bottom", "padding-left"],
      change: byProperty.get("padding-top")!,
      label: "padding",
      property: "padding",
    },
    {
      properties: ["padding-top", "padding-bottom"],
      change: byProperty.get("padding-top")!,
      label: "padding-y",
      property: "padding-top,padding-bottom",
    },
    {
      properties: ["padding-left", "padding-right"],
      change: byProperty.get("padding-left")!,
      label: "padding-x",
      property: "padding-left,padding-right",
    },
    {
      properties: ["margin-top", "margin-right", "margin-bottom", "margin-left"],
      change: byProperty.get("margin-top")!,
      label: "margin",
      property: "margin",
    },
    {
      properties: ["margin-top", "margin-bottom"],
      change: byProperty.get("margin-top")!,
      label: "margin-y",
      property: "margin-top,margin-bottom",
    },
    {
      properties: ["margin-left", "margin-right"],
      change: byProperty.get("margin-left")!,
      label: "margin-x",
      property: "margin-left,margin-right",
    },
    {
      properties: [
        "border-top-left-radius",
        "border-top-right-radius",
        "border-bottom-right-radius",
        "border-bottom-left-radius",
      ],
      change: byProperty.get("border-top-left-radius")!,
      label: "border-radius",
      property: "border-radius",
    },
  ];

  for (const group of grouped) {
    if (!group.change) continue;
    const groupChanges = group.properties.map((property) => byProperty.get(property)).filter(Boolean) as PropertyChange[];
    if (groupChanges.length !== group.properties.length || !valuesAreAligned(groupChanges)) continue;
    return { ...group.change, property: group.property as TrackedProperty };
  }

  const priority = [
    "padding-top",
    "padding-right",
    "padding-bottom",
    "padding-left",
    "margin-top",
    "margin-right",
    "margin-bottom",
    "margin-left",
    "gap",
    "row-gap",
    "column-gap",
    "font-size",
    "line-height",
    "letter-spacing",
    "border-radius",
    "border-width",
    "opacity",
    "width",
    "height",
    "max-width",
    "max-height",
  ];

  for (const property of priority) {
    const change = byProperty.get(property as TrackedProperty);
    if (change) return change;
  }
  return null;
}

function buildSlide(property: string, label: string, before: NumericValue, after: NumericValue): BudgeSlide {
  const normalizedBefore = normalizeSlideValue(property, before);
  const normalizedAfter = normalizeSlideValue(property, after);
  const bounds = slideBounds(property, normalizedAfter.value, normalizedAfter.unit);
  return {
    label,
    property,
    min: bounds.min,
    max: bounds.max,
    value: normalizedAfter.value,
    original: normalizedBefore.value,
    unit: normalizedAfter.unit,
  };
}

function buildSlides(primary: PropertyChange, after: StyleSnapshot): BudgeSlide[] {
  const property = primary.property;
  const slides = [buildSlide(property, property.replace(/,/g, " + "), primary.before, primary.after)];
  const seen = new Set([property]);

  for (const related of relatedProperties(property)) {
    if (seen.has(related)) continue;
    const value = parseNumeric(after[related as TrackedProperty]);
    if (!value) continue;
    const normalized = normalizeSlideValue(related, value);
    const bounds = slideBounds(related, normalized.value, normalized.unit);
    slides.push({
      label: related,
      property: related,
      min: bounds.min,
      max: bounds.max,
      value: normalized.value,
      original: normalized.value,
      unit: normalized.unit,
    });
    seen.add(related);
    if (slides.length >= 4) break;
  }

  return slides;
}

function updateAutoTarget(el: HTMLElement) {
  if (autoTarget && autoTarget !== el && !autoTargetHadMarker) {
    autoTarget.removeAttribute(BUDGE_TARGET_ATTR);
  }
  autoTarget = el;
  autoTargetHadMarker = el.hasAttribute(BUDGE_TARGET_ATTR);
  if (!autoTargetHadMarker) el.setAttribute(BUDGE_TARGET_ATTR, "");
}

function setAutoConfig(el: HTMLElement, slides: BudgeSlide[]) {
  updateAutoTarget(el);
  autoConfig = { slides, autoFocus: true };
  autoConfigFingerprint = configFingerprint(autoConfig);
  sync();
  attachSourceContext(el, autoConfigFingerprint);
}

async function attachSourceContext(el: HTMLElement, fingerprint: string) {
  const api = (window as any).__REACT_GRAB__;
  if (!api?.getSource || !autoConfig?.slides) return;

  try {
    const source = await api.getSource(el);
    if (!source?.filePath || fingerprint !== autoConfigFingerprint || autoTarget !== el || !autoConfig?.slides) return;
    autoConfig = {
      ...autoConfig,
      slides: autoConfig.slides.map((slide) => ({
        ...slide,
        file: source.filePath,
        line: source.lineNumber ?? undefined,
      })),
    };
    autoConfigFingerprint = configFingerprint(autoConfig);
    sync();
  } catch {
    // Source lookup is opportunistic; Budge still works without React Grab.
  }
}

function rememberSubtree(root: Element) {
  if (shouldIgnoreElement(root)) return;
  snapshots.set(root, snapshotElement(root));
  const elements = root.querySelectorAll("[class],[style]");
  for (const el of elements) {
    if (!shouldIgnoreElement(el)) snapshots.set(el, snapshotElement(el));
  }
}

function startAutoDetect() {
  if (!readAutoDetectSetting()) return;
  if (!document.body) return;

  rememberSubtree(document.body);

  let pending: { el: HTMLElement; slides: BudgeSlide[] } | null = null;
  let pendingTimer: ReturnType<typeof setTimeout> | undefined;

  const queue = (el: HTMLElement, slides: BudgeSlide[]) => {
    pending = { el, slides };
    clearTimeout(pendingTimer);
    pendingTimer = setTimeout(() => {
      if (!pending) return;
      setAutoConfig(pending.el, pending.slides);
      pending = null;
    }, 80);
  };

  const observer = new MutationObserver((records) => {
    if (document.querySelector(BUDGE_CONFIG_SELECTOR)) return;

    for (const record of records) {
      if (record.type === "childList") {
        for (const node of record.addedNodes) {
          if (node instanceof Element) rememberSubtree(node);
        }
        continue;
      }

      if (record.type !== "attributes" || !(record.target instanceof HTMLElement)) continue;
      const el = record.target;
      if (shouldIgnoreElement(el) || isRecentBudgePreview()) {
        snapshots.set(el, snapshotElement(el));
        continue;
      }

      const before = snapshots.get(el);
      const after = snapshotElement(el);
      snapshots.set(el, after);
      if (!before) continue;

      const changes = diffSnapshots(before, after);
      if (changes.length === 0 || changes.length > 8) continue;

      const primary = choosePrimaryChange(changes);
      if (!primary) continue;

      queue(el, buildSlides(primary, after));
    }
  });

  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class", "style"],
    childList: true,
    subtree: true,
  });
}

if (typeof document !== "undefined") {
  const init = () => {
    sync();
    startAutoDetect();

    const observer = new MutationObserver(sync);
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["data-budge"],
      characterData: true,
    });
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
}
