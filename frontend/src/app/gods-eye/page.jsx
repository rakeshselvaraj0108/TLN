"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import { ArrowUpRight, Earth, LoaderCircle, Maximize2, RotateCcw } from "lucide-react";
import { PageHeader, buttonClass } from "@/components/ui/primitives";
let _Component = Maximize2;
let u = "/gods-eye/index.html";
export default function GodsEyePage() {
  let e = useRef(null);
  let t = useRef(null);
  let [n, h] = useState(true);
  let [m, x] = useState(0);
  useEffect(() => {
    let e = () => {
      window.dispatchEvent(new Event("resize"));
    };
    document.addEventListener("fullscreenchange", e);
    return () => document.removeEventListener("fullscreenchange", e);
  }, []);
  // The iframe's own onLoad should clear this, but an iframe load event can be missed in some
  // embedding contexts — a fallback timer means this outer overlay is never the thing left stuck.
  useEffect(() => {
    let t = setTimeout(() => h(false), 6000);
    return () => clearTimeout(t);
  }, [m]);
  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <PageHeader
        title="God’s Eye View"
        description="The world, live — photorealistic terrain with aircraft, vessels, satellites and public camera feeds. This is context, not evidence: nothing on this globe is hash-chained or resolves to an ingested record, and no finding should rest on it. For the case placed on the ground, with every arc traced to a source row, use the Investigation Eye."
        actions={
          <Fragment>
            <a href={u} target="_blank" rel="noreferrer" className={buttonClass}>
              <ArrowUpRight className="h-3.5 w-3.5" />
              Open in a tab
            </a>
            <button
              onClick={() => {
                var e;
                let n = t.current;
                if (n) {
                  if (document.fullscreenElement) {
                    document.exitFullscreen();
                  } else if ((e = n.requestFullscreen) !== null && e !== undefined) {
                    e.call(n);
                  }
                }
              }}
              className={buttonClass}
            >
              <_Component className="h-3.5 w-3.5" />
              Fullscreen
            </button>
            <button
              onClick={() => {
                h(true);
                x((e) => e + 1);
              }}
              className={buttonClass}
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Reload
            </button>
          </Fragment>
        }
      />
      <div
        ref={t}
        className="relative min-h-[560px] flex-1 overflow-hidden rounded border border-canvas-border bg-black"
      >
        {n ? (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-canvas-panel">
            <Earth className="h-7 w-7 text-ink-faint/60" strokeWidth={1.5} aria-hidden={true} />
            <p className="flex items-center gap-2 text-[0.8125rem] text-ink-muted">
              <LoaderCircle className="h-3.5 w-3.5 animate-spin" aria-hidden={true} />
              Loading terrain and the live feeds…
            </p>
            <p className="max-w-sm text-center text-[0.75rem] leading-relaxed text-ink-faint">
              The globe streams a few megabytes of terrain on first open. It is cached afterwards.
            </p>
          </div>
        ) : null}
        <iframe
          ref={e}
          src={u}
          title="God’s Eye View — live world console"
          onLoad={() => h(false)}
          className="h-full w-full border-0"
          allow="fullscreen; microphone; geolocation; xr-spatial-tracking"
          key={m}
        />
      </div>
      <p className="text-[0.6875rem] leading-relaxed text-ink-faint">
        God’s Eye View is a separate application, vendored into this deployment and served as static
        assets. Its live layers call public data services directly; where a feed needs a key this
        deployment does not hold, that layer stays empty rather than showing something invented.
        Terrain falls back to keyless satellite imagery when no Cesium ion token is configured.
      </p>
    </div>
  );
}
