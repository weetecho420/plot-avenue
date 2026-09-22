"use client";

import Link from "next/link";
import { useRef, useState } from "react";
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

const TIER_HEIGHT_SCALE: Record<string, number> = {
  kiosk: 0.7,
  shop: 1,
  tower: 1.5,
  skyscraper: 2.1,
};

const TIER_WIDTH_SCALE: Record<string, number> = {
  kiosk: 0.75,
  shop: 0.95,
  tower: 1.05,
  skyscraper: 1.15,
};

const TILE_W = 96;
const TILE_H = 48;

export default function CityScene({ plots }: { plots: Plot[] }) {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
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
    setZoom((z) => Math.min(1.6, +(z + 0.15).toFixed(2)));
  }

  function zoomOut() {
    setZoom((z) => Math.max(0.5, +(z - 0.15).toFixed(2)));
  }

  function resetView() {
    setZoom(1);
    setPan({ x: 0, y: 0 });
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
        <div
          className="scene-world"
          style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}
        >
          {Array.from({ length: rows + 1 }).map((_, row) => {
            const isoX = -row * (TILE_W / 2);
            const isoY = row * (TILE_H / 2);
            return (
              <div
                key={`road-${row}`}
                className="tile road"
                style={{ left: isoX, top: isoY }}
              />
            );
          })}

          {Array.from({ length: rows + 1 }).map((_, row) => {
            if (row % 3 !== 1) return null;
            const side = row % 2 === 0 ? -2 : 2;
            const isoX = (side - row) * (TILE_W / 2);
            const isoY = (side + row) * (TILE_H / 2);
            return <div key={`tree-${row}`} className="tile tree" style={{ left: isoX, top: isoY }} />;
          })}

          {plots.map((p, i) => {
            const row = Math.floor(i / 2);
            const col = i % 2 === 0 ? -1 : 1;
            const isoX = (col - row) * (TILE_W / 2);
            const isoY = (col + row) * (TILE_H / 2);
            const hScale = TIER_HEIGHT_SCALE[p.tier] ?? 1;
            const wScale = TIER_WIDTH_SCALE[p.tier] ?? 1;
            const claimed = p.status === "claimed";

            const cubeStyle: CSSProperties | undefined =
              claimed && p.color ? ({ "--wall": p.color } as CSSProperties) : undefined;

            const building = (
              <div className="cube-group" style={{ transform: `scale(${wScale}, ${hScale})` }}>
                <div className="cube" style={cubeStyle}>
                  <div className="face top" />
                  <div className="face left" />
                  <div className="face right" />
                </div>
              </div>
            );

            return (
              <div
                key={p.id}
                className={`tile plot ${claimed ? "claimed" : "available"}`}
                style={{ left: isoX, top: isoY }}
              >
                {claimed ? (
                  <a
                    href={p.website_url ?? "#"}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="plot-link"
                  >
                    {building}
                    {p.logo_url ? (
                      <img src={p.logo_url} alt={p.owner_name ?? "logo"} className="plot-logo" />
                    ) : (
                      <span className="plot-sign">{p.owner_name}</span>
                    )}
                  </a>
                ) : (
                  <Link href={`/claim?slot=${p.slot_index}`} className="plot-link">
                    {building}
                    <span className="plot-price">${(p.price_cents / 100).toFixed(0)}</span>
                  </Link>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
