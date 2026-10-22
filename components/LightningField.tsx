/**
 * Gold lightning crackling on the JouleOps wordmark — the speed-force look
 * from "The Flash": tiny jagged sparks that cling to the edges of the letters,
 * re-jitter while they live, and die. It builds up: the first sparks are few,
 * short and faint, and over `rampMs` they grow in number, reach and
 * brightness until small strikes start firing with a gold flash behind the
 * logo.
 *
 * Drawn behind the logo by SplashOverlay and LogoLoader. Sparks come from
 * midpoint displacement and are redrawn on a ~14 fps JS tick (a handful of
 * SVG paths), which is also what makes them flicker like real arcs. Renders
 * nothing while inactive or when the user has asked for reduced motion.
 */
import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { useReducedMotion } from "react-native-reanimated";
import Svg, { Defs, Ellipse, G, Path, RadialGradient, Stop } from "react-native-svg";

/** Canvas around the logo, in dp; the wordmark sits at its centre. */
const W = 300;
const H = 160;
const CX = W / 2;
const CY = H / 2;
/** The wordmark's ink: a wide, short band (180dp splash image, ~165×44 of ink). */
const BAND_HALF_W = 82;
const BAND_HALF_H = 21;
const TICK_MS = 70;

type Pt = [number, number];
interface Spark {
  id: number;
  from: Pt;
  to: Pt;
  life: number; // ticks left
  path: string;
  branches: string[];
  width: number;
  /** This tick's brightness, already scaled by the build-up. */
  opacity: number;
}

const PALETTE = {
  dark: { bloom: "#FFB800", glow: "#FFC21A", mid: "#FFD84A", core: "#FFFDF2", flash: "#FFB800" },
  light: { bloom: "#F59E0B", glow: "#F5A300", mid: "#F2B705", core: "#FFF1B8", flash: "#FBBF24" },
} as const;

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const smooth = (k: number) => k * k * (3 - 2 * k);
const EDGE = 8;
const inCanvas = (p: Pt): Pt => [
  Math.min(W - EDGE, Math.max(EDGE, p[0])),
  Math.min(H - EDGE, Math.max(EDGE, p[1])),
];

/** Jagged polyline between two points (recursive midpoint displacement). */
function jag(a: Pt, b: Pt, displace: number, out: Pt[]) {
  if (displace < 1.5) {
    out.push(b);
    return;
  }
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len = Math.hypot(dx, dy) || 1;
  // Wide offsets give the sharp, kinked zig-zag of electric arcs.
  const off = rand(-0.8, 0.8) * displace;
  const mid: Pt = [(a[0] + b[0]) / 2 + (-dy / len) * off, (a[1] + b[1]) / 2 + (dx / len) * off];
  jag(a, mid, displace / 2, out);
  jag(mid, b, displace / 2, out);
}

const toPath = (pts: Pt[]) => pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(" ");

function drawSpark(from: Pt, to: Pt): { path: string; branches: string[] } {
  const len = Math.hypot(to[0] - from[0], to[1] - from[1]);
  const pts: Pt[] = [from];
  jag(from, to, len * 0.5, pts);
  const branches: string[] = [];
  if (len > 14 && Math.random() < 0.45) {
    const start = pts[Math.floor(rand(0.3, 0.7) * pts.length)] ?? from;
    const ang = Math.atan2(to[1] - from[1], to[0] - from[0]) + rand(0.5, 1) * (Math.random() < 0.5 ? -1 : 1);
    const bl = len * rand(0.3, 0.55);
    const end: Pt = [start[0] + Math.cos(ang) * bl, start[1] + Math.sin(ang) * bl];
    const bp: Pt[] = [start];
    jag(start, end, bl * 0.45, bp);
    branches.push(toPath(bp));
  }
  return { path: toPath(pts), branches };
}

let nextId = 1;
const flicker = (life: number, level: number) => Math.min(1, 0.4 + life * 0.2) * rand(0.7, 1) * level;

/**
 * A tiny spark on the wordmark's edge. Most leap a short way off the top or
 * bottom of the letters; some crawl along the edge; a few jump off the ends.
 * `level` (0–1) is the build-up: it lengthens them.
 */
function spawn(level: number): Spark {
  const reach = rand(6, 12 + 22 * level);
  const roll = Math.random();
  let from: Pt;
  let to: Pt;
  if (roll < 0.3) {
    // Crawl along the top or bottom edge.
    const top = Math.random() < 0.5;
    const y = CY + (top ? -1 : 1) * BAND_HALF_H * rand(0.85, 1.15);
    const x = CX + rand(-BAND_HALF_W, BAND_HALF_W - reach);
    from = [x, y];
    to = [x + reach * 1.3, y + rand(-4, 4)];
  } else if (roll < 0.85) {
    // Leap off the top or bottom edge, tilted.
    const top = Math.random() < 0.5;
    from = [CX + rand(-BAND_HALF_W, BAND_HALF_W), CY + (top ? -1 : 1) * BAND_HALF_H * rand(0.7, 1)];
    const ang = (top ? -Math.PI / 2 : Math.PI / 2) + rand(-0.9, 0.9);
    to = [from[0] + Math.cos(ang) * reach, from[1] + Math.sin(ang) * reach];
  } else {
    // Jump off the left or right end.
    const right = Math.random() < 0.5;
    from = [CX + (right ? 1 : -1) * BAND_HALF_W, CY + rand(-BAND_HALF_H, BAND_HALF_H)];
    const ang = (right ? 0 : Math.PI) + rand(-0.8, 0.8);
    to = [from[0] + Math.cos(ang) * reach, from[1] + Math.sin(ang) * reach];
  }
  to = inCanvas(to);
  const life = Math.round(rand(2, 4));
  return {
    id: nextId++,
    from,
    to,
    life,
    width: rand(0.7, 1.15),
    opacity: flicker(life, level),
    ...drawSpark(from, to),
  };
}

export default function LightningField({
  active,
  scheme,
  rampMs = 1600,
}: {
  active: boolean;
  scheme: "dark" | "light";
  /** How long the build-up from faint sparks to full crackle takes. */
  rampMs?: number;
}) {
  const reduceMotion = useReducedMotion();
  const [sparks, setSparks] = useState<Spark[]>([]);
  const [flash, setFlash] = useState(0);
  const running = active && !reduceMotion;

  useEffect(() => {
    if (!running) return;
    let ticks = 0;
    let nextStrike = Infinity;
    const id = setInterval(() => {
      ticks++;
      const level = smooth(Math.min(1, (ticks * TICK_MS) / rampMs));
      // Strikes only once the build-up is nearly complete, then every ~1.2–2 s.
      if (level > 0.85 && nextStrike === Infinity) nextStrike = ticks + 2;
      const strike = ticks >= nextStrike;
      if (strike) nextStrike = ticks + Math.round(rand(17, 28));
      const cap = 1 + Math.round(6 * level);
      setSparks((prev) => {
        // Survivors crackle: same ends, freshly jittered path.
        const next = prev
          .map((s) => ({ ...s, life: s.life - 1 }))
          .filter((s) => s.life > 0)
          .map((s) => ({ ...s, opacity: flicker(s.life, Math.max(level, 0.25)), ...drawSpark(s.from, s.to) }));
        if (strike) {
          for (let i = 0, n = Math.round(rand(5, 8)); i < n; i++) next.push(spawn(1));
        } else {
          const want = Math.random() < 0.35 + 0.5 * level ? (Math.random() < level * 0.6 ? 2 : 1) : 0;
          for (let i = 0; i < want && next.length < cap; i++) next.push(spawn(level));
        }
        return next;
      });
      setFlash((f) => (strike ? 1 : f * 0.6));
    }, TICK_MS);
    return () => {
      clearInterval(id);
      // Start clean next time (nothing is drawn while inactive anyway).
      setSparks([]);
      setFlash(0);
    };
  }, [running, rampMs]);

  if (!running) return null;
  const c = PALETTE[scheme];

  return (
    <View pointerEvents="none" style={styles.wrap} importantForAccessibility="no-hide-descendants">
      <Svg width={W} height={H}>
        <Defs>
          {/* Bounding-box units: the gradient stretches exactly over the ellipse it fills. */}
          <RadialGradient id="flash" cx="50%" cy="50%" r="50%" fx="50%" fy="50%">
            <Stop offset="0" stopColor={c.flash} stopOpacity={0.4} />
            <Stop offset="0.5" stopColor={c.flash} stopOpacity={0.12} />
            <Stop offset="1" stopColor={c.flash} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        {flash > 0.03 ? (
          <Ellipse cx={CX} cy={CY} rx={BAND_HALF_W * 1.6} ry={BAND_HALF_H * 3.2} fill="url(#flash)" opacity={flash} />
        ) : null}
        {sparks.map((s) => {
          const all = [s.path, ...s.branches];
          return (
            <G key={s.id} opacity={s.opacity} fill="none" strokeLinecap="round" strokeLinejoin="round">
              {/* bloom → glow → hot gold → near-white core */}
              {all.map((d, i) => (
                <Path key={`b${i}`} d={d} stroke={c.bloom} strokeOpacity={0.12} strokeWidth={(i ? 4 : 7) * s.width} />
              ))}
              {all.map((d, i) => (
                <Path key={`g${i}`} d={d} stroke={c.glow} strokeOpacity={0.35} strokeWidth={(i ? 2 : 3.2) * s.width} />
              ))}
              {all.map((d, i) => (
                <Path key={`m${i}`} d={d} stroke={c.mid} strokeWidth={(i ? 0.8 : 1.3) * s.width} />
              ))}
              {all.map((d, i) => (
                <Path key={`c${i}`} d={d} stroke={c.core} strokeWidth={(i ? 0.35 : 0.6) * s.width} />
              ))}
            </G>
          );
        })}
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    top: "50%",
    left: "50%",
    width: W,
    height: H,
    marginLeft: -W / 2,
    marginTop: -H / 2,
  },
});
