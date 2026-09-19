"use client";

import { useEffect, useRef, useState } from "react";
export function usePrefersReducedMotion() {
  let [e, t] = useState(false);
  useEffect(() => {
    let e = window.matchMedia("(prefers-reduced-motion: reduce)");
    let n = () => t(e.matches);
    n();
    e.addEventListener("change", n);
    return () => e.removeEventListener("change", n);
  }, []);
  return e;
}
export function useScrollStage(e) {
  let t = useRef(0);
  let [n, r] = useState(0);
  useEffect(() => {
    let n = e.current;
    if (!n) {
      return;
    }
    let a = false;
    let i = 0;
    let s = () => {
      i = 0;
      let e = n.getBoundingClientRect();
      let a = e.height - window.innerHeight;
      let s = Math.min(1, Math.max(0, a <= 0 ? (e.top <= 0 ? 1 : 0) : -e.top / a));
      t.current = s;
      r((e) => {
        let t = Math.min(4, Math.floor(s * 4.999));
        if (t === e) {
          return e;
        } else {
          return t;
        }
      });
    };
    let l = () => {
      if (a && !i) {
        i = requestAnimationFrame(s);
      }
    };
    let c = new IntersectionObserver(
      (e) => {
        var n;
        if ((a = (n = e[0]?.isIntersecting) !== null && n !== undefined && n)) {
          s();
        }
      },
      {
        threshold: 0,
      },
    );
    c.observe(n);
    window.addEventListener("scroll", l, {
      passive: true,
    });
    window.addEventListener("resize", l);
    s();
    return () => {
      c.disconnect();
      window.removeEventListener("scroll", l);
      window.removeEventListener("resize", l);
      if (i) {
        cancelAnimationFrame(i);
      }
    };
  }, [e]);
  return {
    progressRef: t,
    stage: n,
  };
}
export function useInView(e = "0px 0px -12% 0px") {
  let t = useRef(null);
  let [n, r] = useState(false);
  useEffect(() => {
    let n = t.current;
    if (!n) {
      return;
    }
    if (typeof IntersectionObserver == "undefined") {
      r(true);
      return;
    }
    let a = new IntersectionObserver(
      (e) => {
        if (e[0]?.isIntersecting) {
          r(true);
          a.disconnect();
        }
      },
      {
        rootMargin: e,
        threshold: 0.05,
      },
    );
    a.observe(n);
    return () => a.disconnect();
  }, [e]);
  return [t, n];
}
export function mulberry32(e) {
  let t = e >>> 0;
  return () => {
    let e = Math.imul((t = (t + 1831565813) >>> 0) ^ (t >>> 15), t | 1);
    return (((e = (e + Math.imul(e ^ (e >>> 7), e | 61)) ^ e) ^ (e >>> 14)) >>> 0) / 4294967296;
  };
}
