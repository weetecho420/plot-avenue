"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";

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
  kiosk: { size: 46, height: 70 },
  shop: { size: 54, height: 105 },
  tower: { size: 60, height: 145 },
  skyscraper: { size: 68, height: 195 },
};

const AVAILABLE_COLOR = "#163244";

function Building({
  size,
  height,
  color,
  href,
  external,
  label,
  logoUrl,
}: {
  size: number;
  height: number;
  color: string;
  href: string;
  external: boolean;
  label: string;
  logoUrl?: string | null;
}) {
  const style: CSSProperties = {
    width: size,
    height,
    backgroundColor: color,
  };

  const tag = logoUrl ? (
    <img src={logoUrl} alt={label} className="plot-logo" />
  ) : (
    <span className={external ? "plot-sign" : "plot-price"}>{label}</span>
  );

  const inner = (
    <>
      <div className="tag">{tag}</div>
      <div className="building" style={style} />
    </>
  );

  const linkProps = { className: "building-col", "aria-label": label };

  if (external) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" {...linkProps}>
        {inner}
      </a>
    );
  }

  return (
    <Link href={href} {...linkProps}>
      {inner}
    </Link>
  );
}

export default function CityScene({ plots }: { plots: Plot[] }) {
  const [zoom, setZoom] = useState(1);
  const rowRef = useRef<HTMLDivElement | null>(null);
  const sidewalkRef = useRef<HTMLDivElement | null>(null);
  const roadRef = useRef<HTMLDivElement | null>(null);
  const [streetWidth, setStreetWidth] = useState(0);

  useEffect(() => {
    function measure() {
      if (rowRef.current) setStreetWidth(rowRef.current.getBoundingClientRect().width / zoom);
    }
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [plots, zoom]);

  function zoomIn() {
    setZoom((z) => Math.min(1.6, +(z + 0.15).toFixed(2)));
  }

  function zoomOut() {
    setZoom((z) => Math.max(0.5, +(z - 0.15).toFixed(2)));
  }

  function resetView() {
    setZoom(1);
  }

  return (
    <div className="scene">
      <div className="scene-controls">
        <button type="button" onClick={zoomIn} aria-label="Zoom in">+</button>
        <button type="button" onClick={zoomOut} aria-label="Zoom out">&minus;</button>
        <button type="button" onClick={resetView} aria-label="Reset view" className="reset">Reset</button>
      </div>

      <div className="scene-viewport">
        <div className="plane-rig" aria-hidden="true">
          <span className="banner">PLOT AVENUE</span>
          <span className="tow-line" />
          <svg className="plane-icon" viewBox="0 0 24 24" aria-hidden="true">
            <path
              fill="#eef2f6"
              d="M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z"
            />
          </svg>
        </div>

        <div className="stage" style={{ transform: `scale(${zoom})` }}>
          <div className="building-row" ref={rowRef}>
            {plots.map((p) => {
              const dims = TIER[p.tier] ?? TIER.shop;
              const claimed = p.status === "claimed";
              const color = claimed ? p.color ?? "#2f6f8c" : AVAILABLE_COLOR;
              const label = claimed ? p.owner_name ?? "Claimed" : `$${(p.price_cents / 100).toFixed(0)}`;
              return (
                <Building
                  key={p.id}
                  size={dims.size}
                  height={dims.height}
                  color={color}
                  href={claimed ? p.website_url ?? "#" : `/claim?slot=${p.slot_index}`}
                  external={claimed}
                  label={label}
                  logoUrl={claimed ? p.logo_url : null}
                />
              );
            })}
          </div>

          <div className="street">
            <div className="sidewalk" ref={sidewalkRef} style={{ width: streetWidth || "100%" }}>
              <Pedestrian left={20} span={streetWidth * 0.5} duration={9} delay={0} />
              <Pedestrian left={streetWidth * 0.55} span={streetWidth * 0.35} duration={8} delay={-1} />
            </div>
            <div className="road" ref={roadRef} style={{ width: streetWidth || "100%" }}>
              <Car color="#4dd9ff" span={streetWidth - 30} duration={6} delay={0} top={6} />
              <Car color="#f2c230" span={streetWidth - 30} duration={7} delay={-3} top={6} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Car({ color, span, duration, delay, top }: { color: string; span: number; duration: number; delay: number; top: number }) {
  return (
    <div
      className="car"
      style={
        {
          top,
          animationDuration: `${duration}s`,
          animationDelay: `${delay}s`,
          "--span": `${span}px`,
        } as CSSProperties
      }
    >
      <div className="body" style={{ background: color }} />
      <div className="cabin" style={{ background: color }} />
      <div className="wheel front" />
      <div className="wheel back" />
      <div className="light front" />
      <div className="light back" />
    </div>
  );
}

function Pedestrian({ left, span, duration, delay }: { left: number; span: number; duration: number; delay: number }) {
  return (
    <div
      className="ped"
      style={
        {
          left,
          animationDuration: `${duration}s`,
          animationDelay: `${delay}s`,
          "--span": `${span}px`,
        } as CSSProperties
      }
    >
      <div className="head" />
      <div className="body" />
    </div>
  );
}
