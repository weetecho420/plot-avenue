"use client";

import Link from "next/link";
import { useRef, useState } from "react";
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
  kiosk: { size: 34, height: 55 },
  shop: { size: 44, height: 90 },
  tower: { size: 50, height: 140 },
  skyscraper: { size: 58, height: 200 },
};

const TILE = 90; // depth spacing between rows
const COL = 70; // distance from the road spine to a building's center
const TAG_GAP = 28; // constant clearance above a roof for the price/name billboard
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
        width: 40,
        height: TILE - 8,
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
      {boxFaces(7, 7, 16, "#8a5a2b")}
      <div style={{ position: "absolute", transformStyle: "preserve-3d", transform: "translate3d(0px, -16px, 0px)" }}>
        {boxFaces(24, 24, 22, "#2f9e5e")}
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

export default function CityScene({ plots }: { plots: Plot[] }) {
  const [zoom, setZoom] = useState(0.3);
  const [pan, setPan] = useState({ x: -227, y: 390 });
  const dragRef = useRef<{ startX: number; startY: number; panX: number; panY: number } | null>(null);

  const rows = Math.max(1, Math.ceil(plots.length / 2));

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
    setZoom(0.3);
    setPan({ x: -227, y: 390 });
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
              if (row % 3 !== 1) return null;
              const side = row % 2 === 0 ? -1 : 1;
              return <Tree key={`tree-${row}`} x={side * (COL + 46)} z={row * TILE} />;
            })}

            {plots.map((p, i) => {
              const row = Math.floor(i / 2);
              const side = i % 2 === 0 ? -1 : 1;
              const dims = TIER[p.tier] ?? TIER.shop;
              const claimed = p.status === "claimed";
              const color = claimed ? p.color ?? "#2f6f8c" : AVAILABLE_COLOR;
              const label = claimed ? p.owner_name ?? "Claimed" : `$${(p.price_cents / 100).toFixed(0)}`;

              return (
                <PlotBuilding
                  key={p.id}
                  x={side * COL}
                  z={row * TILE}
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
