"use client";

import { CamelotKey } from "@/lib/camelot";
import { cn } from "@/lib/utils";

interface CamelotWheelProps {
  keyA?: CamelotKey | null;
  keyB?: CamelotKey | null;
  className?: string;
}

interface WheelSegment {
  number: number;
  musicalB: string;
  musicalA: string;
}

// Segments arranged clockwise starting from 8B at top
const SEGMENTS: WheelSegment[] = [
  { number: 8,  musicalB: "C",   musicalA: "Am"  },
  { number: 9,  musicalB: "G",   musicalA: "Em"  },
  { number: 10, musicalB: "D",   musicalA: "Bm"  },
  { number: 11, musicalB: "A",   musicalA: "F#m" },
  { number: 12, musicalB: "E",   musicalA: "C#m" },
  { number: 1,  musicalB: "B",   musicalA: "G#m" },
  { number: 2,  musicalB: "F#",  musicalA: "Ebm" },
  { number: 3,  musicalB: "Db",  musicalA: "Bbm" },
  { number: 4,  musicalB: "Ab",  musicalA: "Fm"  },
  { number: 5,  musicalB: "Eb",  musicalA: "Cm"  },
  { number: 6,  musicalB: "Bb",  musicalA: "Gm"  },
  { number: 7,  musicalB: "F",   musicalA: "Dm"  },
];

// One hue per segment for a subtle rainbow tint
const SEGMENT_COLORS = [
  "#7c3aed",
  "#6d28d9",
  "#4f46e5",
  "#3b82f6",
  "#0ea5e9",
  "#06b6d4",
  "#14b8a6",
  "#10b981",
  "#22c55e",
  "#eab308",
  "#f97316",
  "#ef4444",
];

function polarToCart(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function describeSegment(
  cx: number,
  cy: number,
  innerR: number,
  outerR: number,
  startAngle: number,
  endAngle: number
): string {
  const s1 = polarToCart(cx, cy, outerR, startAngle);
  const e1 = polarToCart(cx, cy, outerR, endAngle);
  const s2 = polarToCart(cx, cy, innerR, endAngle);
  const e2 = polarToCart(cx, cy, innerR, startAngle);
  const large = endAngle - startAngle > 180 ? 1 : 0;
  return `M ${s1.x} ${s1.y} A ${outerR} ${outerR} 0 ${large} 1 ${e1.x} ${e1.y} L ${s2.x} ${s2.y} A ${innerR} ${innerR} 0 ${large} 0 ${e2.x} ${e2.y} Z`;
}

export function CamelotWheel({ keyA, keyB, className }: CamelotWheelProps) {
  const cx = 200;
  const cy = 200;
  // Outer B ring (major)
  const outerB = 168;
  const innerB = 118;
  // Inner A ring (minor)
  const outerA = 113;
  const innerA = 63;

  const segAngle = 360 / 12;
  const gap = 1.8;

  return (
    <div className={cn("flex flex-col items-center gap-3", className)}>
      <svg
        viewBox="0 0 400 400"
        className="w-full max-w-[280px]"
        aria-label="Camelot wheel showing harmonic key relationships"
        role="img"
      >
        <defs>
          <filter id="cw-glow">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <radialGradient id="cw-center" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#1e1b4b" />
            <stop offset="100%" stopColor="#0a0a14" />
          </radialGradient>
        </defs>

        {/* Center */}
        <circle
          cx={cx} cy={cy} r={innerA - 2}
          fill="url(#cw-center)"
          stroke="rgba(255,255,255,0.05)"
          strokeWidth="1"
        />
        <text x={cx} y={cy - 7} textAnchor="middle" fontSize="10" fill="rgba(255,255,255,0.35)" fontFamily="sans-serif" fontWeight="600">CAMELOT</text>
        <text x={cx} y={cy + 7} textAnchor="middle" fontSize="10" fill="rgba(255,255,255,0.35)" fontFamily="sans-serif" fontWeight="600">WHEEL</text>

        {/* Divider ring between A and B */}
        <circle cx={cx} cy={cy} r={innerB + 2} fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth="1" />

        {SEGMENTS.map((seg, i) => {
          const start = i * segAngle + gap / 2;
          const end = (i + 1) * segAngle - gap / 2;
          const mid = i * segAngle + segAngle / 2;
          const base = SEGMENT_COLORS[i];

          // Which track (if any) highlights this segment
          const highlightB: "A" | "B" | null =
            keyA?.letter === "B" && keyA.number === seg.number ? "A" :
            keyB?.letter === "B" && keyB.number === seg.number ? "B" : null;

          const highlightA: "A" | "B" | null =
            keyA?.letter === "A" && keyA.number === seg.number ? "A" :
            keyB?.letter === "A" && keyB.number === seg.number ? "B" : null;

          const bPath = describeSegment(cx, cy, innerB, outerB, start, end);
          const aPath = describeSegment(cx, cy, innerA, outerA, start, end);

          const bMid = polarToCart(cx, cy, (innerB + outerB) / 2, mid);
          const aMid = polarToCart(cx, cy, (innerA + outerA) / 2, mid);

          const highlightColorA = "#a855f7";
          const highlightColorB = "#3b82f6";

          return (
            <g key={seg.number}>
              {/* Major (B) outer ring segment */}
              <path
                d={bPath}
                fill={
                  highlightB === "A" ? `${highlightColorA}55` :
                  highlightB === "B" ? `${highlightColorB}55` :
                  `${base}28`
                }
                stroke={
                  highlightB === "A" ? highlightColorA :
                  highlightB === "B" ? highlightColorB :
                  "rgba(255,255,255,0.07)"
                }
                strokeWidth={highlightB ? 1.5 : 0.5}
                filter={highlightB ? "url(#cw-glow)" : undefined}
                style={{ transition: "fill 0.35s, stroke 0.35s" }}
              />

              {/* Minor (A) inner ring segment */}
              <path
                d={aPath}
                fill={
                  highlightA === "A" ? `${highlightColorA}45` :
                  highlightA === "B" ? `${highlightColorB}45` :
                  `${base}1a`
                }
                stroke={
                  highlightA === "A" ? highlightColorA :
                  highlightA === "B" ? highlightColorB :
                  "rgba(255,255,255,0.05)"
                }
                strokeWidth={highlightA ? 1.5 : 0.5}
                filter={highlightA ? "url(#cw-glow)" : undefined}
                style={{ transition: "fill 0.35s, stroke 0.35s" }}
              />

              {/* B label (number + key name) */}
              <text
                x={bMid.x}
                y={bMid.y - 6}
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize="9.5"
                fontWeight="700"
                fill={highlightB ? "#fff" : "rgba(255,255,255,0.65)"}
                fontFamily="sans-serif"
              >
                {seg.number}B
              </text>
              <text
                x={bMid.x}
                y={bMid.y + 6}
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize="7.5"
                fill={highlightB ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.38)"}
                fontFamily="sans-serif"
              >
                {seg.musicalB}
              </text>

              {/* A label (number + key name) */}
              <text
                x={aMid.x}
                y={aMid.y - 6}
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize="9.5"
                fontWeight="700"
                fill={highlightA ? "#fff" : "rgba(255,255,255,0.55)"}
                fontFamily="sans-serif"
              >
                {seg.number}A
              </text>
              <text
                x={aMid.x}
                y={aMid.y + 6}
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize="7"
                fill={highlightA ? "rgba(255,255,255,0.85)" : "rgba(255,255,255,0.28)"}
                fontFamily="sans-serif"
              >
                {seg.musicalA}
              </text>
            </g>
          );
        })}
      </svg>

      {/* Legend */}
      {(keyA || keyB) && (
        <div className="flex flex-wrap justify-center gap-4 text-xs">
          {keyA && (
            <div className="flex items-center gap-1.5">
              <div
                className="size-2.5 rounded-full flex-shrink-0"
                style={{ background: "#a855f7", boxShadow: "0 0 6px #a855f7" }}
              />
              <span className="text-muted-foreground">
                Track 1:{" "}
                <span className="text-foreground font-semibold">{keyA.label}</span>{" "}
                <span className="text-muted-foreground/60">({keyA.musicalKey})</span>
              </span>
            </div>
          )}
          {keyB && (
            <div className="flex items-center gap-1.5">
              <div
                className="size-2.5 rounded-full flex-shrink-0"
                style={{ background: "#3b82f6", boxShadow: "0 0 6px #3b82f6" }}
              />
              <span className="text-muted-foreground">
                Track 2:{" "}
                <span className="text-foreground font-semibold">{keyB.label}</span>{" "}
                <span className="text-muted-foreground/60">({keyB.musicalKey})</span>
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
