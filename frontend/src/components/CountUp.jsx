"use client";

import { Fragment, useEffect, useRef, useState } from "react";
export function CountUp(e) {
  let { value: t, durationMs: n = 600 } = e;
  let [a, l] = useState(t);
  let i = useRef();
  useEffect(() => {
    var e;
    var r;
    if (
      ((e = (r = window).matchMedia) === null || e === undefined
        ? undefined
        : e.call(r, "(prefers-reduced-motion: reduce)").matches) ||
      t === 0
    ) {
      l(t);
      return;
    }
    let s = performance.now();
    let a = (e) => {
      let r = Math.min(1, (e - s) / n);
      l(Math.round(t * (1 - Math.pow(1 - r, 3))));
      if (r < 1) {
        i.current = requestAnimationFrame(a);
      }
    };
    i.current = requestAnimationFrame(a);
    return () => {
      if (i.current) {
        cancelAnimationFrame(i.current);
      }
    };
  }, [t, n]);
  return <Fragment>{a.toLocaleString("en-IN")}</Fragment>;
}
