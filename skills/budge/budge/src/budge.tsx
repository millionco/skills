import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Calligraph as CalligraphImport } from "calligraph";

const Calligraph: any = typeof CalligraphImport === "function"
  ? CalligraphImport
  : ({ children, style }: { children?: ReactNode; style?: React.CSSProperties }) => (
      <span style={style}>{children}</span>
    );

let assetBase = "";

export const setAssetBase = (base: string) => {
  assetBase = base;
};

const resolveAsset = (path: string) =>
  assetBase ? `${assetBase}${path}` : path;

const FONT = "'Open Runde', system-ui, sans-serif";
const SHAKE_KEYFRAMES = `@keyframes __budge-shake{0%,100%{translate:0}25%{translate:-2px}50%{translate:2px}75%{translate:-1px}}@keyframes budge-copied-in{0%{opacity:0;transform:scale(0.85)}100%{opacity:1;transform:scale(1)}}`;
let shakeInjected = false;
const ARROW_D =
  "M13.415 2.5C12.634 1.719 11.367 1.719 10.586 2.5L3.427 9.659C2.01 11.076 3.014 13.5 5.018 13.5H7V20C7 21.104 7.895 22 9 22H15C16.105 22 17 21.104 17 20V13.5H18.983C20.987 13.5 21.991 11.076 20.574 9.659L13.415 2.5Z";
export type BudgeScale = "spacing" | "color" | "text" | "radius";

export interface BudgeToken {
  name: string;
  value: string;
  numeric?: number;
}

export interface BudgeSlide {
  label: string;
  property: string;
  min: number;
  max: number;
  value: number;
  original: number;
  unit: string;
  type?: "numeric" | "color";
  scale?: BudgeScale | null;
  tokens?: BudgeToken[];
}

type TokenBuckets = Record<BudgeScale, BudgeToken[]>;

const EMPTY_BUCKETS: TokenBuckets = { spacing: [], color: [], text: [], radius: [] };

function defaultScaleForProperty(property: string): BudgeScale | null {
  if (/^(padding|margin|gap)(-|$)/.test(property)) return "spacing";
  if (property === "color" || /-color$/.test(property)) return "color";
  if (property === "font-size") return "text";
  if (/^border-radius/.test(property)) return "radius";
  return null;
}

function parseLengthToPx(value: string): number | undefined {
  const m = value.trim().match(/^(-?[\d.]+)(px|rem|em)?$/);
  if (!m) return undefined;
  const n = parseFloat(m[1]);
  const unit = m[2] || "px";
  if (unit === "rem" || unit === "em") return n * 16;
  return n;
}

function discoverTokens(): TokenBuckets {
  if (typeof document === "undefined") return { spacing: [], color: [], text: [], radius: [] };
  const cs = getComputedStyle(document.documentElement);
  const out: TokenBuckets = { spacing: [], color: [], text: [], radius: [] };
  const prefixes: [string, BudgeScale][] = [
    ["--spacing-", "spacing"],
    ["--color-", "color"],
    ["--text-", "text"],
    ["--radius-", "radius"],
  ];
  for (let i = 0; i < cs.length; i++) {
    const prop = cs.item(i);
    if (!prop.startsWith("--")) continue;
    for (const [prefix, scale] of prefixes) {
      if (!prop.startsWith(prefix)) continue;
      const name = prop.slice(prefix.length);
      const raw = cs.getPropertyValue(prop).trim();
      if (!raw) break;
      if (scale === "color") {
        out.color.push({ name, value: raw });
      } else {
        const numeric = parseLengthToPx(raw);
        if (numeric === undefined || isNaN(numeric)) break;
        out[scale].push({ name, value: raw, numeric });
      }
      break;
    }
  }
  for (const k of ["spacing", "text", "radius"] as const) {
    out[k].sort((a, b) => (a.numeric ?? 0) - (b.numeric ?? 0));
  }
  return out;
}

function resolveScale(slide: BudgeSlide): BudgeScale | null {
  return slide.scale !== undefined ? slide.scale : defaultScaleForProperty(slide.property);
}

function tokensForSlide(slide: BudgeSlide, discovered: TokenBuckets): BudgeToken[] | null {
  const scale = resolveScale(slide);
  if (!scale) return null;
  const tokens = slide.tokens ?? discovered[scale];
  return tokens.length > 0 ? tokens : null;
}

function matchToken(tokens: BudgeToken[], value: number, epsilon = 0.5): BudgeToken | null {
  for (const t of tokens) {
    if (t.numeric !== undefined && Math.abs(t.numeric - value) < epsilon) return t;
  }
  return null;
}

function nextTokenIndex(tokens: BudgeToken[], value: number, direction: number, shift: boolean): number {
  let curIdx = 0, bestDist = Infinity;
  for (let i = 0; i < tokens.length; i++) {
    const d = Math.abs((tokens[i].numeric ?? 0) - value);
    if (d < bestDist) { bestDist = d; curIdx = i; }
  }
  const onToken = Math.abs((tokens[curIdx].numeric ?? 0) - value) < 0.5;
  const mult = shift ? 10 : 1;
  if (onToken) return curIdx + direction * mult;
  if (direction > 0) {
    for (let i = 0; i < tokens.length; i++) if ((tokens[i].numeric ?? 0) > value) return i;
    return tokens.length;
  } else {
    for (let i = tokens.length - 1; i >= 0; i--) if ((tokens[i].numeric ?? 0) < value) return i;
    return -1;
  }
}

// Wrap v into [min, max] so overshoots loop around. Assumes unit step — the
// period is (max - min + 1) so max+1 → min and min-1 → max.
function wrapValue(v: number, min: number, max: number): number {
  const period = max - min + 1;
  const offset = ((v - min) % period + period) % period;
  return min + offset;
}

const DEFAULT_SLIDES: BudgeSlide[] = [
  { label: "font size", property: "font-size", min: 32, max: 86, value: 61, original: 61, unit: "px" },
  { label: "opacity", property: "opacity", min: 0, max: 100, value: 100, original: 100, unit: "%" },
  { label: "padding", property: "padding", min: 6, max: 48, value: 16, original: 16, unit: "px" },
  { label: "color", property: "color", min: 0, max: 360, value: 220, original: 220, unit: "°", type: "color" },
];

// ---------------------------------------------------------------------------
// Audio — subtle haptic tick via Web Audio API
// ---------------------------------------------------------------------------

let audioCtx: AudioContext | null = null;
let lastTickTime = 0;

function getAudioCtx() {
  if (!audioCtx) audioCtx = new AudioContext();
  if (audioCtx.state === "suspended") audioCtx.resume();
  return audioCtx;
}

let oreoBuffer: AudioBuffer | null = null;
let oreoLoading = false;

const OREO_SPRITES_UP: [number, number][] = [
  [22000, 103], [12000, 109], [0, 120],
];
const OREO_SPRITES_DOWN: [number, number][] = [
  [2000, 110], [4000, 105], [6000, 115],
];
let lastOreoIdxUp = 0;
let lastOreoIdxDown = 0;

function loadOreoBuffer() {
  if (oreoBuffer || oreoLoading) return;
  oreoLoading = true;
  const ctx = getAudioCtx();
  fetch(resolveAsset("/oreo.mp3"))
    .then(response => {
      if (!response.ok) throw new Error(`${response.status}`);
      return response.arrayBuffer();
    })
    .then(arrayBuffer => ctx.decodeAudioData(arrayBuffer))
    .then(buffer => { oreoBuffer = buffer; })
    .catch(() => { oreoLoading = false; });
}

function scheduleTick(time: number, volume: number, up = true) {
  const ctx = getAudioCtx();
  loadOreoBuffer();
  if (!oreoBuffer) return;
  const sprites = up ? OREO_SPRITES_UP : OREO_SPRITES_DOWN;
  if (up) {
    lastOreoIdxUp = (lastOreoIdxUp + 1) % sprites.length;
  } else {
    lastOreoIdxDown = (lastOreoIdxDown + 1) % sprites.length;
  }
  const sprite = sprites[up ? lastOreoIdxUp : lastOreoIdxDown];
  const offset = sprite[0] / 1000;
  const halfDur = sprite[1] / 1000 / 2;
  const src = ctx.createBufferSource();
  src.buffer = oreoBuffer;
  const gain = ctx.createGain();
  gain.gain.value = volume * (0.85 + Math.random() * 0.3);
  src.connect(gain);
  gain.connect(ctx.destination);
  src.start(time, offset, halfDur);
}

const OREO_CONFIRM: [number, number] = [8000, 112];

function playConfirm() {
  const ctx = getAudioCtx();
  loadOreoBuffer();
  if (!oreoBuffer) return;
  const offset = OREO_CONFIRM[0] / 1000;
  const halfDur = OREO_CONFIRM[1] / 1000 / 2;
  const src = ctx.createBufferSource();
  src.buffer = oreoBuffer;
  const gain = ctx.createGain();
  gain.gain.value = 0.6;
  src.connect(gain);
  gain.connect(ctx.destination);
  src.start(ctx.currentTime, offset, halfDur);
}

function playTick(held = false, up = true) {
  const now = performance.now();
  if (held && now - lastTickTime < 50) return;
  lastTickTime = now;

  const ctx = getAudioCtx();
  scheduleTick(ctx.currentTime, held ? 0.3 : 0.55, up);
}

function playDoubleTick(up = true) {
  const ctx = getAudioCtx();
  scheduleTick(ctx.currentTime, 0.25, up);
  scheduleTick(ctx.currentTime + 0.055, 0.15, up);
}

function Arrow({
  active,
  down,
  disabled,
  onPointerDown,
  onPointerUp,
  onPointerLeave,
  activeColor,
}: {
  active: boolean;
  down?: boolean;
  disabled?: boolean;
  onPointerDown?: () => void;
  onPointerUp?: () => void;
  onPointerLeave?: () => void;
  activeColor?: string;
}) {
  const fill = disabled ? "#A7A7A7" : active ? (activeColor ?? "#FFFFFF") : "#A7A7A7";
  return (
    <svg
      width="1em"
      height="1em"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      onPointerDown={disabled ? undefined : onPointerDown}
      onPointerUp={onPointerUp}
      onPointerLeave={onPointerLeave}
      style={{
        width: 19,
        height: "auto",
        flexShrink: 0,
        cursor: disabled ? "default" : "pointer",
        transform: `rotate(${down ? 180 : 0}deg) translateY(${active && !disabled ? -2.5 : 0}px) scale(${active && !disabled ? 1.08 : 1})`,
        transition: active
          ? "transform 0.03s cubic-bezier(0, 0, 0.2, 1)"
          : "transform 0.45s cubic-bezier(0.34, 1.8, 0.64, 1)",
      }}
    >
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d={ARROW_D}
        fill={fill}
        style={{
          transition: disabled
            ? "fill 0.2s ease"
            : active ? "fill 0.05s ease" : "fill 0.3s ease",
        }}
      />
    </svg>
  );
}

export function Budge({ autoFocus, slides: slidesProp }: { autoFocus?: boolean; slides?: BudgeSlide[] } = {}) {
  const SLIDES = slidesProp && slidesProp.length > 0 ? slidesProp : DEFAULT_SLIDES;
  const f = { keyboard: true, expandValue: true, animatedDigits: true, arrowBounce: true, barPhysics: true, boundaryShake: true, sound: true, buttonFeedback: true, numberInput: true, shiftStep: true, idleOpacity: true, showLabel: true, showButtons: true, showText: true };
  const [value, setValue] = useState(SLIDES[0].value);
  const [typedRaw, setTypedRaw] = useState<string | null>(null);
  const [activeKey, setActiveKey] = useState<"up" | "down" | null>(null);
  const [isBudging, setIsBudging] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [showPrompt, setShowPrompt] = useState(false);
  const [pressedButton, setPressedButton] = useState<"reset" | "copy" | "prev" | "next" | "mute" | null>(null);
  const [muted, setMuted] = useState(false);
  const [resetHovered, setResetHovered] = useState(false);
  const [copyHovered, setCopyHovered] = useState(false);
  const [muteHovered, setMuteHovered] = useState(false);
  const muteRef = useRef<HTMLDivElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [mutePos, setMutePos] = useState<{ top: number; left: number } | null>(null);
  const slideValuesRef = useRef<number[]>(SLIDES.map(s => s.value));
  const containerRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const [slideRangeVisible, setSlideRangeVisible] = useState(false);
  const [slideRangeIdle, setSlideRangeIdle] = useState(true);
  const [barHovered, setBarHovered] = useState(false);
  const slideRangeTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const budgeTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const confirmedTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const digitBufferRef = useRef("");
  const digitTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const valueRef = useRef(SLIDES[0].value);
  const holdIntervalRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const holdTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const discoveredRef = useRef<TokenBuckets>(EMPTY_BUCKETS);
  const [snapEnabled, setSnapEnabled] = useState(true);
  const snapEnabledRef = useRef(true);
  const [toastLabel, setToastLabel] = useState<string | null>(null);
  const toastLabelTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    discoveredRef.current = discoverTokens();
  }, []);

  useEffect(() => {
    if (!shakeInjected) {
      const style = document.createElement("style");
      style.textContent = SHAKE_KEYFRAMES;
      document.head.appendChild(style);
      shakeInjected = true;
    }
  }, []);

  useEffect(() => {
    if (autoFocus) containerRef.current?.focus();
  }, [autoFocus]);



  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    function onWindowFocus() {
      if (el && el.contains(document.activeElement) || document.activeElement === document.body) {
        el?.focus();
      }
    }
    window.addEventListener("focus", onWindowFocus);
    return () => window.removeEventListener("focus", onWindowFocus);
  }, []);

  const [slide, setSlide] = useState(0);
  const slideRef = useRef(0);
  const s = SLIDES[slide];
  const soundOn = f.sound && !muted;

  useEffect(() => {
    const el = document.querySelector("[data-budge-target]") as HTMLElement | null;
    if (!el) return;
    const cs = SLIDES[slide];
    const scale = resolveScale(cs);
    const snapTokens = snapEnabled && scale && scale !== "color"
      ? tokensForSlide(cs, discoveredRef.current)
      : null;
    const matched = snapTokens ? matchToken(snapTokens, value) : null;
    if (matched) el.style.setProperty(cs.property, matched.value);
    else if (cs.type === "color") el.style.setProperty(cs.property, `hsl(${value}, 70%, 55%)`);
    else if (cs.unit === "%") el.style.setProperty(cs.property, String(value / 100));
    else el.style.setProperty(cs.property, `${value}${cs.unit}`);
  }, [value, slide, SLIDES]);

  const goToSlide = useCallback((direction: number) => {
    const N = SLIDES.length;
    const cur = slideRef.current;
    const next = ((cur + direction) % N + N) % N;
    slideValuesRef.current[cur] = valueRef.current;
    slideRef.current = next;
    setSlide(next);
    const restored = slideValuesRef.current[next];
    valueRef.current = restored;
    setValue(restored);
    setTypedRaw(null);
    setIsBudging(false);
    setConfirmed(false);
    setShowPrompt(false);
    setActiveKey(null);
    digitBufferRef.current = "";
    clearTimeout(digitTimeoutRef.current);
    clearTimeout(budgeTimeoutRef.current);
    clearTimeout(confirmedTimeoutRef.current);

    clearTimeout(slideRangeTimeoutRef.current);
    setSlideRangeVisible(true);
    setSlideRangeIdle(false);
    slideRangeTimeoutRef.current = setTimeout(() => {
      setSlideRangeVisible(false);
      setTimeout(() => setSlideRangeIdle(true), 400);
    }, 800);

    containerRef.current?.focus();
  }, []);


  const applyDigitBufferRef = useRef(() => {});
  applyDigitBufferRef.current = () => {
    const num = parseInt(digitBufferRef.current, 10);
    digitBufferRef.current = "";
    if (isNaN(num)) return;
    const cs = SLIDES[slideRef.current];
    const wrapped = wrapValue(num, cs.min, cs.max);
    if (wrapped !== valueRef.current) {
      valueRef.current = wrapped;
      setValue(wrapped);
      setIsBudging(true);
      clearTimeout(budgeTimeoutRef.current);
      budgeTimeoutRef.current = setTimeout(() => setIsBudging(false), 600);
      playTick();
    }
  };

  const step = useCallback((direction: number, shift = false, held = false) => {
    const cs = SLIDES[slideRef.current];
    const scale = resolveScale(cs);
    const snapTokens = snapEnabledRef.current && scale && scale !== "color"
      ? tokensForSlide(cs, discoveredRef.current)
      : null;

    let next: number;
    if (snapTokens) {
      const rawIdx = nextTokenIndex(snapTokens, valueRef.current, direction, shift);
      const len = snapTokens.length;
      const idx = ((rawIdx % len) + len) % len;
      next = snapTokens[idx].numeric ?? valueRef.current;
    } else {
      const mult = (f.shiftStep && shift) ? 10 : 1;
      next = wrapValue(valueRef.current + direction * mult, cs.min, cs.max);
    }

    valueRef.current = next;
    setValue(valueRef.current);
    if (soundOn) playTick(held, direction > 0);
  }, [f.shiftStep, soundOn]);

  const triggerBudge = useCallback(
    (dir: "up" | "down") => {
      step(dir === "up" ? 1 : -1);
      setActiveKey(dir);
      setTimeout(() => setActiveKey(null), 100);
    },
    [step],
  );

  const startHold = useCallback((dir: "up" | "down") => {
    const d = dir === "up" ? 1 : -1;
    step(d);
    setActiveKey(dir);
    clearTimeout(budgeTimeoutRef.current);
    if (isBudging) {
      setIsBudging(true);
    }
    clearTimeout(holdTimeoutRef.current);
    clearInterval(holdIntervalRef.current);
    holdTimeoutRef.current = setTimeout(() => {
      holdIntervalRef.current = setInterval(() => {
        step(d, false, true);
      }, 50);
    }, 300);
  }, [step, isBudging]);

  const stopHold = useCallback(() => {
    clearTimeout(holdTimeoutRef.current);
    clearInterval(holdIntervalRef.current);
    setActiveKey(null);
    if (isBudging) {
      clearTimeout(budgeTimeoutRef.current);
      budgeTimeoutRef.current = setTimeout(() => setIsBudging(false), 600);
    }
  }, [isBudging]);

  const reset = useCallback(() => {
    const cs = SLIDES[slideRef.current];
    const prev = valueRef.current;
    valueRef.current = cs.original;
    setValue(cs.original);
    setIsBudging(true);
    if (f.buttonFeedback) setPressedButton("reset");
    clearTimeout(budgeTimeoutRef.current);
    budgeTimeoutRef.current = setTimeout(() => setIsBudging(false), 600);
    if (f.buttonFeedback) setTimeout(() => setPressedButton(null), 70);
    if (soundOn) {
      if (Math.floor(prev / 10) !== Math.floor(cs.original / 10)) {
        playDoubleTick();
      } else {
        playTick();
      }
    }
  }, [f.buttonFeedback, soundOn]);

  const copy = useCallback(() => {
    const idx = slideRef.current;
    const cs = SLIDES[idx];
    const scale = resolveScale(cs);
    const snapTokens = snapEnabledRef.current && scale && scale !== "color"
      ? tokensForSlide(cs, discoveredRef.current)
      : null;
    const matched = snapTokens ? matchToken(snapTokens, valueRef.current) : null;
    const val = matched && scale
      ? `var(--${scale}-${matched.name})`
      : cs.type === "color" ? `hsl(${valueRef.current}, 70%, 55%)` : `${valueRef.current}${cs.unit}`;
    const prompt = `Set \`${cs.property}\` to \`${val}\``;
    navigator.clipboard?.writeText(prompt);
    setShowPrompt(true);
    setConfirmed(true);
    setIsBudging(true);
    if (f.buttonFeedback) setPressedButton("copy");
    clearTimeout(confirmedTimeoutRef.current);
    confirmedTimeoutRef.current = setTimeout(() => {
      setConfirmed(false);
      setIsBudging(false);
    }, 800);
    if (f.buttonFeedback) setTimeout(() => setPressedButton(null), 70);
    if (soundOn) playConfirm();
  }, [f.buttonFeedback, soundOn]);

  const stepRef = useRef(step);
  stepRef.current = step;
  const resetRef = useRef(reset);
  resetRef.current = reset;
  const copyRef = useRef(copy);
  copyRef.current = copy;

  useEffect(() => {
    if (!f.keyboard) return;

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "ArrowUp") {
        e.preventDefault();
        stepRef.current(1, e.shiftKey, e.repeat);
        setActiveKey("up");
        if (f.expandValue) {
          setIsBudging(true);
          clearTimeout(budgeTimeoutRef.current);
          budgeTimeoutRef.current = setTimeout(() => setIsBudging(false), 600);
        }
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        stepRef.current(-1, e.shiftKey, e.repeat);
        setActiveKey("down");
        if (f.expandValue) {
          setIsBudging(true);
          clearTimeout(budgeTimeoutRef.current);
          budgeTimeoutRef.current = setTimeout(() => setIsBudging(false), 600);
        }
      } else if (f.numberInput && e.key >= "0" && e.key <= "9") {
        e.preventDefault();
        if (digitBufferRef.current.length >= 3) return;
        digitBufferRef.current += e.key;
        const num = parseInt(digitBufferRef.current, 10);
        const ds = SLIDES[slideRef.current];
        if (!isNaN(num)) {
          setTypedRaw(digitBufferRef.current);
          setIsBudging(true);
          playTick();
          if (num >= ds.min && num <= ds.max) {
            valueRef.current = num;
            setValue(num);
          }
        }
        clearTimeout(digitTimeoutRef.current);
        clearTimeout(budgeTimeoutRef.current);
        digitTimeoutRef.current = setTimeout(() => {
          const final = parseInt(digitBufferRef.current, 10);
          digitBufferRef.current = "";
          const ds2 = SLIDES[slideRef.current];
          if (!isNaN(final) && (final < ds2.min || final > ds2.max)) {
            const wrapped = wrapValue(final, ds2.min, ds2.max);
            valueRef.current = wrapped;
            setValue(wrapped);
            setTypedRaw(null);
            budgeTimeoutRef.current = setTimeout(() => setIsBudging(false), 600);
          } else {
            setTypedRaw(null);
            setIsBudging(false);
          }
        }, 500);
      } else if ((e.key === "r" || e.key === "R") && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        resetRef.current();
      } else if ((e.key === "t" || e.key === "T") && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        const next = !snapEnabledRef.current;
        snapEnabledRef.current = next;
        setSnapEnabled(next);
        setToastLabel(next ? "token snap on" : "token snap off");
        clearTimeout(slideRangeTimeoutRef.current);
        clearTimeout(toastLabelTimeoutRef.current);
        setSlideRangeVisible(true);
        setSlideRangeIdle(false);
        toastLabelTimeoutRef.current = setTimeout(() => {
          setToastLabel(null);
          setSlideRangeVisible(false);
          setTimeout(() => setSlideRangeIdle(true), 400);
        }, 1200);
      } else if (e.key === "Enter") {
        e.preventDefault();
        copyRef.current();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        if (f.buttonFeedback) { setPressedButton("prev"); setTimeout(() => setPressedButton(null), 70); }
        goToSlide(-1);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        if (f.buttonFeedback) { setPressedButton("next"); setTimeout(() => setPressedButton(null), 70); }
        goToSlide(1);
      }
    }

    function onKeyUp(e: KeyboardEvent) {
      if (e.key === "ArrowUp" || e.key === "ArrowDown") {
        setActiveKey(null);
      }
    }

    const el = containerRef.current;
    if (!el) return;
    el.addEventListener("keydown", onKeyDown);
    el.addEventListener("keyup", onKeyUp);
    return () => {
      el.removeEventListener("keydown", onKeyDown);
      el.removeEventListener("keyup", onKeyUp);
      clearTimeout(budgeTimeoutRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const displayNum = typedRaw !== null ? typedRaw : `${value}`;
  const displayUnit = s.unit;
  const typedOutOfRange = typedRaw !== null && (() => {
    const n = parseInt(typedRaw, 10);
    return !isNaN(n) && (n < s.min || n > s.max);
  })();
  const activeScale = resolveScale(s);
  const activeSnapTokens = snapEnabled && activeScale && activeScale !== "color"
    ? tokensForSlide(s, discoveredRef.current)
    : null;
  const matchedToken = activeSnapTokens ? matchToken(activeSnapTokens, value) : null;
  const isColorSlide = s.type === "color";
  const targetColor = `hsl(${value}, 70%, 55%)`;
  const budgeY = 0;
  const baseScale = f.barPhysics ? (confirmed ? 1.02 : (isBudging || !slideRangeIdle || barHovered) ? 1 : 0.8) : 1;

  const expandTransition =
    "max-width 0.5s cubic-bezier(0.32, 0.72, 0, 1), " +
    "margin-right 0.5s cubic-bezier(0.32, 0.72, 0, 1), " +
    "opacity 0.35s ease 0.1s";
  const collapseTransition =
    "max-width 0.45s cubic-bezier(0.32, 0.72, 0, 1), " +
    "margin-right 0.45s cubic-bezier(0.32, 0.72, 0, 1), " +
    "opacity 0.15s ease";

  return (
    <>
    <div ref={wrapperRef} className="relative">
    <div
      ref={containerRef}
      tabIndex={0}
      onPointerDown={() => containerRef.current?.focus()}
      style={{ position: "fixed", bottom: 0, left: 0, right: 0, outline: "none", zIndex: 2147483646 }}
    >
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>

        <div
          ref={barRef}
          className="shrink-0"
          onPointerEnter={() => setBarHovered(true)}
          onPointerLeave={() => setBarHovered(false)}
          style={{
            position: "relative",
            display: "flex",
            height: 37,
            alignItems: "center",
            justifyContent: "center",
            borderRadius: 9999,
            padding: "0 16px",
            marginBottom: 24,
            fontSynthesis: "none",
            WebkitFontSmoothing: "antialiased",
            userSelect: "none",
            transform: `translateY(${budgeY}px) scale(${baseScale})`,
            opacity: f.idleOpacity ? (isBudging || confirmed || !slideRangeIdle || barHovered ? 1 : 0.8) : 1,
            transition: f.barPhysics
              ? (confirmed
                  ? "transform 0.3s cubic-bezier(0.2, 0, 0, 1.2), opacity 0.2s ease"
                  : isBudging || barHovered || !slideRangeIdle
                    ? "transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.15s ease"
                    : "transform 0.2s cubic-bezier(0.32, 0.72, 0, 1), opacity 0.2s ease")
              : "opacity 0.3s ease",
          }}
        >
          <div style={{
            position: "absolute",
            bottom: "100%",
            left: "50%",
            pointerEvents: "none",
            transform: `scale(${1 / baseScale}) translateX(-50%) translateY(${slideRangeVisible ? 0 : 8}px)`,
            transformOrigin: "top left",
            paddingBottom: 10,
            opacity: slideRangeVisible ? 1 : 0,
            filter: slideRangeVisible ? "blur(0px)" : "blur(4px)",
            transition: slideRangeVisible
              ? "opacity 0.2s ease, filter 0.2s ease, transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)"
              : "opacity 0.25s ease, filter 0.25s ease, transform 0.3s cubic-bezier(0.32, 0.72, 0, 1)",
          }}>
            <span style={{
              fontFamily: FONT,
              fontSize: 12,
              fontWeight: 500,
              color: toastLabel ? "#888" : "#666",
              letterSpacing: "0.01em",
              whiteSpace: "nowrap",
            }}>
              {toastLabel ?? SLIDES[slide].label}
            </span>
          </div>
          <div style={{
            position: "absolute",
            inset: 0,
            borderRadius: 9999,
            background: "#161616",
            boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
            transformOrigin: activeKey === "up" ? "center bottom" : activeKey === "down" ? "center top" : "center center",
            transform: `scaleY(${activeKey ? 1.012 : 1})`,
            transition: activeKey
              ? "transform 0.03s cubic-bezier(0, 0, 0.2, 1)"
              : "transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)",
          }} />
          <div style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "center", width: "100%", height: "100%" }}>
          {confirmed ? (
            <span
              key="copied"
              style={{
                color: "#fff",
                fontFamily: FONT,
                fontWeight: 500,
                fontSize: 14.5,
                lineHeight: "22px",
                whiteSpace: "nowrap",
                animation: "budge-copied-in 0.35s cubic-bezier(0.34, 1.56, 0.64, 1) both",
              }}
            >
              Copied
            </span>
          ) : (
            <>
              <div
                style={{
                  maxWidth: isBudging && !isColorSlide ? (matchedToken ? 170 : 100) : 0,
                  marginRight: isBudging && !isColorSlide ? (matchedToken ? 9 : 1) : 0,
                  opacity: isBudging && !isColorSlide ? 1 : 0,
                  transition: isBudging
                    ? expandTransition
                    : collapseTransition,
                  display: "flex",
                  alignItems: "center",
                  overflow: "visible",
                }}
              >
{f.animatedDigits ? (
                  <span style={{ display: "inline-flex", alignItems: "baseline", minWidth: 44, textAlign: "left" }}>
                    <Calligraph
                      variant="slots"
                      animation="snappy"
                      stagger={0}
                      style={{
                        color: typedOutOfRange ? "#A7A7A7" : "#fff",
                        fontFamily: FONT,
                        fontWeight: 500,
                        fontSize: 14.5,
                        lineHeight: "22px",
                        whiteSpace: "nowrap",
                        fontVariantNumeric: "tabular-nums",
                        transition: "color 0.2s ease",
                      }}
                    >
                      {displayNum}
                    </Calligraph>
                    <span style={{
                      color: typedOutOfRange ? "#A7A7A7" : "#fff",
                      fontFamily: FONT,
                      fontWeight: 500,
                      fontSize: 11,
                      lineHeight: "22px",
                      transition: "color 0.2s ease",
                      marginLeft: 1,
                    }}>{displayUnit}</span>
                    {matchedToken && (
                      <span style={{
                        color: "#A7A7A7",
                        fontFamily: FONT,
                        fontWeight: 500,
                        fontSize: 11,
                        lineHeight: "22px",
                        marginLeft: 6,
                        whiteSpace: "nowrap",
                        display: "inline-block",
                        minWidth: 32,
                        textAlign: "left",
                      }}>· {matchedToken.name}</span>
                    )}
                  </span>
                ) : (
                  <span style={{ display: "inline-flex", alignItems: "baseline", minWidth: 44, textAlign: "left" }}>
                    <span
                      style={{
                        color: typedOutOfRange ? "#A7A7A7" : "#fff",
                        fontFamily: FONT,
                        fontWeight: 500,
                        fontSize: 14.5,
                        lineHeight: "22px",
                        whiteSpace: "nowrap",
                        fontVariantNumeric: "tabular-nums",
                        transition: "color 0.2s ease",
                      }}
                    >
                      {displayNum}
                    </span>
                    <span style={{
                      color: typedOutOfRange ? "#A7A7A7" : "#fff",
                      fontFamily: FONT,
                      fontWeight: 500,
                      fontSize: 11,
                      lineHeight: "22px",
                      transition: "color 0.2s ease",
                      marginLeft: 1,
                    }}>{displayUnit}</span>
                    {matchedToken && (
                      <span style={{
                        color: "#A7A7A7",
                        fontFamily: FONT,
                        fontWeight: 500,
                        fontSize: 11,
                        lineHeight: "22px",
                        marginLeft: 6,
                        whiteSpace: "nowrap",
                        display: "inline-block",
                        minWidth: 32,
                        textAlign: "left",
                      }}>· {matchedToken.name}</span>
                    )}
                  </span>
                )}
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <Arrow
                  down
                  active={f.arrowBounce ? activeKey === "down" : false}
                  onPointerDown={() => startHold("down")}
                  onPointerUp={stopHold}
                  onPointerLeave={stopHold}
                  activeColor={isColorSlide ? targetColor : undefined}
                />
                <Arrow
                  active={f.arrowBounce ? activeKey === "up" : false}
                  onPointerDown={() => startHold("up")}
                  onPointerUp={stopHold}
                  onPointerLeave={stopHold}
                  activeColor={isColorSlide ? targetColor : undefined}
                />
              </div>
            </>
          )}
          </div>
        </div>
      </div>

    </div>
    </div>
    </>
  );
}
