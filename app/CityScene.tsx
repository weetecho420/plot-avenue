"use client";

import Link from "next/link";
import { Fragment, useRef, useState } from "react";
import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";

type Plot = {
  id: string;
  slot_index: number;
  tier: string;
  price_cents: number;
  status: string;
  owner_name: string | null;
  website_url: string | null;
  logo_url: string | null;
  color: string | null;
};

const TIER: Record<string, { size: number; height: number }> = {
  kiosk: { size: 40, height: 60 },
  shop: { size: 48, height: 100 },
  tower: { size: 54, height: 150 },
  skyscraper: { size: 62, height: 210 },
};

const TILE = 70; // depth spacing between rows
const COL_SPACING = 62; // spacing between building columns within a side
const ROAD_OFFSET = 44; // distance from the road spine to the first column
const COLS_PER_SIDE = 3; // how many buildings deep each side of the road runs
const TAG_GAP = 26; // constant clearance above a roof for the price/name tag
const AVAILABLE_COLOR = "#163244";

// Screen-space projection for the fixed camera `rotateX(45deg) rotateY(45deg)`
// with no perspective (orthographic). A 3D point (x, y, z) in .scene-world's
// local space projects to a flat 2D offset from the world's own anchor:
//   screenX = SQ * (x + z)
//   screenY = 0.5 * (x - z) + SQ * y
// This lets price/name tags be rendered as plain flat HTML (outside the
// preserve-3d world, so they can't get lost to 3D depth-sorting) while still
// lining up exactly with the 3D building underneath.
const SQ = Math.SQRT1_2;
function projectToScreen(x: number, y: number, z: number) {
  return { sx: SQ * (x + z), sy: 0.5 * (x - z) + SQ * y };
}

function faceStyle(
  transform: string,
  w: number,
  h: number,
  color: string,
  brightness: number,
  windows: boolean
): CSSProperties {
  const base: CSSProperties = {
    position: "absolute",
    width: w,
    height: h,
    transform,
    filter: `brightness(${brightness})`,
    boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.25)",
  };
  if (windows) {
    return {
      ...base,
      backgroundColor: color,
      backgroundImage:
        "repeating-linear-gradient(0deg, rgba(255,255,255,0.32) 0 3px, transparent 3px 11px), repeating-linear-gradient(90deg, rgba(255,255,255,0.32) 0 3px, transparent 3px 13px)",
    };
  }
  return { ...base, background: color };
}

function boxFaces(w: number, d: number, h: number, color: string, windows = false) {
  return (
    <>
      <div style={faceStyle(`translate3d(${-w / 2}px, 0px, ${d / 2}px)`, w, h, color, 0.9, windows)} />
      <div style={faceStyle(`translate3d(${-w / 2}px, 0px, ${-d / 2}px) rotateY(180deg)`, w, h, color, 0.9, windows)} />
      <div style={faceStyle(`translate3d(${-d / 2}px, 0px, ${w / 2}px) rotateY(90deg)`, d, h, color, 0.6, windows)} />
      <div style={faceStyle(`translate3d(${-d / 2}px, 0px, ${-w / 2}px) rotateY(-90deg)`, d, h, color, 0.65, windows)} />
      <div style={faceStyle(`translate3d(${-w / 2}px, 0px, ${-d / 2}px) rotateX(90deg)`, w, d, color, 1.3, false)} />
    </>
  );
}

function RoadTile({ x, z }: { x: number; z: number }) {
  return (
    <div
      style={{
        position: "absolute",
        width: 38,
        height: TILE - 6,
        background: "linear-gradient(180deg, #2f353e, #1b1e23)",
        boxShadow: "inset 0 0 0 1px rgba(77,217,255,0.15)",
        transform: `translate3d(${x}px, 0px, ${z}px) rotateX(90deg)`,
      }}
    />
  );
}

function Tree({ x, z }: { x: number; z: number }) {
  return (
    <div style={{ position: "absolute", transformStyle: "preserve-3d", transform: `translate3d(${x}px, 0px, ${z}px)` }}>
      {boxFaces(7, 7, 14, "#8a5a2b")}
      <div style={{ position: "absolute", transformStyle: "preserve-3d", transform: "translate3d(0px, -14px, 0px)" }}>
        {boxFaces(22, 22, 20, "#2f9e5e")}
      </div>
    </div>
  );
}

function Car({
  laneX,
  totalDepth,
  duration,
  delay,
  color,
}: {
  laneX: number;
  totalDepth: number;
  duration: number;
  delay: number;
  color: string;
}) {
  return (
    <div style={{ position: "absolute", transformStyle: "preserve-3d", transform: `translate3d(${laneX}px, 0px, 0px)` }}>
      <div
        className="car-drive"
        style={
          {
            position: "absolute",
            transformStyle: "preserve-3d",
            animationDuration: `${duration}s`,
            animationDelay: `${delay}s`,
            "--drive-depth": `${totalDepth}px`,
          } as CSSProperties
        }
      >
        {boxFaces(14, 22, 12, color)}
      </div>
    </div>
  );
}

function Pedestrian({
  x,
  z0,
  walkDepth,
  duration,
  delay,
}: {
  x: number;
  z0: number;
  walkDepth: number;
  duration: number;
  delay: number;
}) {
  return (
    <div style={{ position: "absolute", transformStyle: "preserve-3d", transform: `translate3d(${x}px, 0px, ${z0}px)` }}>
      <div
        className="ped-walk"
        style={
          {
            position: "absolute",
            transformStyle: "preserve-3d",
            animationDuration: `${duration}s`,
            animationDelay: `${delay}s`,
            "--walk-depth": `${walkDepth}px`,
          } as CSSProperties
        }
      >
        {boxFaces(6, 6, 12, "#e0a86a")}
        <div style={{ position: "absolute", transformStyle: "preserve-3d", transform: "translate3d(0px, -12px, 0px)" }}>
          {boxFaces(6, 6, 6, "#3a3f47")}
        </div>
      </div>
    </div>
  );
}

function PlotBuilding({
  x,
  z,
  w,
  d,
  h,
  color,
  href,
  external,
  label,
}: {
  x: number;
  z: number;
  w: number;
  d: number;
  h: number;
  color: string;
  href: string;
  external: boolean;
  label: string;
}) {
  const style: CSSProperties = {
    position: "absolute",
    display: "block",
    transformStyle: "preserve-3d",
    transform: `translate3d(${x}px, ${-h}px, ${z}px)`,
    textDecoration: "none",
  };

  const content = boxFaces(w, d, h, color, true);

  if (external) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" style={style} aria-label={label}>
        {content}
      </a>
    );
  }

  return (
    <Link href={href} style={style} aria-label={label}>
      {content}
    </Link>
  );
}

function PlotTag({
  x,
  z,
  h,
  href,
  external,
  label,
  logoUrl,
}: {
  x: number;
  z: number;
  h: number;
  href: string;
  external: boolean;
  label: string;
  logoUrl?: string | null;
}) {
  const { sx, sy } = projectToScreen(x, -(h + TAG_GAP), z);
  const style: CSSProperties = {
    position: "absolute",
    transform: `translate(${sx}px, ${sy}px) translate(-50%, -100%)`,
    textDecoration: "none",
  };

  const content = logoUrl ? (
    <img src={logoUrl} alt={label} className="plot-logo" />
  ) : (
    <span className={external ? "plot-sign" : "plot-price"}>{label}</span>
  );

  if (external) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" style={style} className="tag-anchor">
        {content}
      </a>
    );
  }

  return (
    <Link href={href} style={style} className="tag-anchor">
      {content}
    </Link>
  );
}

const DEFAULT_ZOOM = 0.79;
const DEFAULT_PAN = { x: -36, y: 281 };

export default function CityScene({ plots }: { plots: Plot[] }) {
  const [zoom, setZoom] = useState(DEFAULT_ZOOM);
  const [pan, setPan] = useState(DEFAULT_PAN);
  const dragRef = useRef<{ startX: number; startY: number; panX: number; panY: number } | null>(null);

  const perRow = COLS_PER_SIDE * 2;
  const rows = Math.max(1, Math.ceil(plots.length / perRow));
  const totalDepth = rows * TILE;
  const edge = ROAD_OFFSET + COLS_PER_SIDE * COL_SPACING + 34;
  const pedEdge = ROAD_OFFSET + COLS_PER_SIDE * COL_SPACING + 14;

  const layout = plots.map((p, i) => {
    const row = Math.floor(i / perRow);
    const within = i % perRow;
    const side = within < COLS_PER_SIDE ? -1 : 1;
    const col = within < COLS_PER_SIDE ? within : within - COLS_PER_SIDE;
    const x = side * (ROAD_OFFSET + col * COL_SPACING);
    const z = row * TILE;
    const dims = TIER[p.tier] ?? TIER.shop;
    const claimed = p.status === "claimed";
    const color = claimed ? p.color ?? "#2f6f8c" : AVAILABLE_COLOR;
    const label = claimed ? p.owner_name ?? "Claimed" : `$${(p.price_cents / 100).toFixed(0)}`;
    return {
      id: p.id,
      x,
      z,
      w: dims.size,
      d: dims.size,
      h: dims.height,
      color,
      href: claimed ? p.website_url ?? "#" : `/claim?slot=${p.slot_index}`,
      external: claimed,
      label,
      logoUrl: claimed ? p.logo_url : null,
    };
  });

  function onPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    dragRef.current = { startX: e.clientX, startY: e.clientY, panX: pan.x, panY: pan.y };
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    setPan({ x: dragRef.current.panX + dx, y: dragRef.current.panY + dy });
  }

  function onPointerUp() {
    dragRef.current = null;
  }

  function zoomIn() {
    setZoom((z) => Math.min(1.6, +(z + 0.12).toFixed(2)));
  }

  function zoomOut() {
    setZoom((z) => Math.max(0.25, +(z - 0.12).toFixed(2)));
  }

  function resetView() {
    setZoom(DEFAULT_ZOOM);
    setPan(DEFAULT_PAN);
  }

  return (
    <div className="scene">
      <div className="scene-controls">
        <button type="button" onClick={zoomIn} aria-label="Zoom in">+</button>
        <button type="button" onClick={zoomOut} aria-label="Zoom out">&minus;</button>
        <button type="button" onClick={resetView} aria-label="Reset view" className="reset">Reset</button>
      </div>

      <div
        className="scene-viewport"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
      >
        <div className="plane-rig" aria-hidden="true">
          <span className="banner">PLOT AVENUE</span>
          <span className="tow-line" />
          <span className="plane-body" />
        </div>

        <div className="scene-pan" style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}>
          <div className="scene-world">
            <Car laneX={-9} totalDepth={totalDepth} duration={5} delay={0} color="#4dd9ff" />
            <Car laneX={9} totalDepth={totalDepth} duration={6} delay={-2} color="#f2c230" />
            <Pedestrian x={-pedEdge} z0={0} walkDepth={totalDepth * 0.6} duration={8} delay={0} />
            <Pedestrian x={pedEdge} z0={totalDepth * 0.3} walkDepth={totalDepth * 0.5} duration={7} delay={-1} />

            {Array.from({ length: rows }).map((_, row) => (
              <RoadTile key={`road-${row}`} x={0} z={row * TILE} />
            ))}

            {Array.from({ length: rows }).map((_, row) => (
              <Fragment key={`tree-${row}`}>
                <Tree x={-edge} z={row * TILE} />
                <Tree x={edge} z={row * TILE} />
              </Fragment>
            ))}

            {layout.map((p) => (
              <PlotBuilding
                key={p.id}
                x={p.x}
                z={p.z}
                w={p.w}
                d={p.d}
                h={p.h}
                color={p.color}
                href={p.href}
                external={p.external}
                label={p.label}
              />
            ))}
          </div>

          <div className="scene-labels">
            {layout.map((p) => (
              <PlotTag
                key={p.id}
                x={p.x}
                z={p.z}
                h={p.h}
                href={p.href}
                external={p.external}
                label={p.label}
                logoUrl={p.logoUrl}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
