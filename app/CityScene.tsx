"use client";

import Link from "next/link";
import { Fragment, useRef, useState } from "react";
import type { CSSProperties, ReactNode, PointerEvent as ReactPointerEvent } from "react";

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
  kiosk: { size: 32, height: 50 },
  shop: { size: 38, height: 80 },
  tower: { size: 42, height: 120 },
  skyscraper: { size: 48, height: 170 },
};

const TILE = 60; // depth spacing between rows
const COL_SPACING = 56; // spacing between building columns within a side
const ROAD_OFFSET = 40; // distance from the road spine to the first column
const COLS_PER_SIDE = 3; // how many buildings deep each side of the road runs
const TAG_GAP = 24; // constant clearance above a roof for the price/name billboard
const AVAILABLE_COLOR = "#163244";

function faceStyle(transform: string, w: number, h: number, background: string, brightness: number): CSSProperties {
  return {
    position: "absolute",
    width: w,
    height: h,
    transform,
    background,
    filter: `brightness(${brightness})`,
    boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.25)",
  };
}

function boxFaces(w: number, d: number, h: number, color: string) {
  return (
    <>
      <div style={faceStyle(`translate3d(${-w / 2}px, 0px, ${d / 2}px)`, w, h, color, 0.9)} />
      <div style={faceStyle(`translate3d(${-w / 2}px, 0px, ${-d / 2}px) rotateY(180deg)`, w, h, color, 0.9)} />
      <div style={faceStyle(`translate3d(${-d / 2}px, 0px, ${w / 2}px) rotateY(90deg)`, d, h, color, 0.6)} />
      <div style={faceStyle(`translate3d(${-d / 2}px, 0px, ${-w / 2}px) rotateY(-90deg)`, d, h, color, 0.65)} />
      <div style={faceStyle(`translate3d(${-w / 2}px, 0px, ${-d / 2}px) rotateX(90deg)`, w, d, color, 1.3)} />
    </>
  );
}

function Billboard({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        position: "absolute",
        transformStyle: "preserve-3d",
        transform: `translate3d(0px, ${-TAG_GAP}px, 0px)`,
      }}
    >
      <div style={{ transform: "rotateY(-45deg) rotateX(-45deg)" }}>{children}</div>
    </div>
  );
}

function RoadTile({ x, z }: { x: number; z: number }) {
  return (
    <div
      style={{
        position: "absolute",
        width: 34,
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
      {boxFaces(6, 6, 12, "#8a5a2b")}
      <div style={{ position: "absolute", transformStyle: "preserve-3d", transform: "translate3d(0px, -12px, 0px)" }}>
        {boxFaces(18, 18, 16, "#2f9e5e")}
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
  logoUrl,
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
  logoUrl?: string | null;
}) {
  const style: CSSProperties = {
    position: "absolute",
    display: "block",
    transformStyle: "preserve-3d",
    transform: `translate3d(${x}px, ${-h}px, ${z}px)`,
    textDecoration: "none",
  };

  const content = (
    <>
      {boxFaces(w, d, h, color)}
      <Billboard>
        {logoUrl ? (
          <img src={logoUrl} alt={label} className="plot-logo" />
        ) : (
          <span className={external ? "plot-sign" : "plot-price"}>{label}</span>
        )}
      </Billboard>
    </>
  );

  if (external) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" style={style}>
        {content}
      </a>
    );
  }

  return (
    <Link href={href} style={style}>
      {content}
    </Link>
  );
}

const DEFAULT_ZOOM = 0.75;
const DEFAULT_PAN = { x: -125, y: 311 };

export default function CityScene({ plots }: { plots: Plot[] }) {
  const [zoom, setZoom] = useState(DEFAULT_ZOOM);
  const [pan, setPan] = useState(DEFAULT_PAN);
  const dragRef = useRef<{ startX: number; startY: number; panX: number; panY: number } | null>(null);

  const perRow = COLS_PER_SIDE * 2;
  const rows = Math.max(1, Math.ceil(plots.length / perRow));

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
    setZoom((z) => Math.min(1.4, +(z + 0.12).toFixed(2)));
  }

  function zoomOut() {
    setZoom((z) => Math.max(0.15, +(z - 0.12).toFixed(2)));
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
        <div className="scene-pan" style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}>
          <div className="scene-world">
            {Array.from({ length: rows }).map((_, row) => (
              <RoadTile key={`road-${row}`} x={0} z={row * TILE} />
            ))}

            {Array.from({ length: rows }).map((_, row) => {
              if (row % 2 !== 0) return null;
              const edge = ROAD_OFFSET + COLS_PER_SIDE * COL_SPACING + 30;
              return (
                <Fragment key={`tree-${row}`}>
                  <Tree x={-edge} z={row * TILE} />
                  <Tree x={edge} z={row * TILE} />
                </Fragment>
              );
            })}

            {plots.map((p, i) => {
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

              return (
                <PlotBuilding
                  key={p.id}
                  x={x}
                  z={z}
                  w={dims.size}
                  d={dims.size}
                  h={dims.height}
                  color={color}
                  href={claimed ? p.website_url ?? "#" : `/claim?slot=${p.slot_index}`}
                  external={claimed}
                  label={label}
                  logoUrl={claimed ? p.logo_url : null}
                />
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
