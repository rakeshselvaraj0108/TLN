"use client";

import { useCallback, useEffect, useState } from "react";
function r() {
  if (typeof document == "undefined") {
    return "night";
  } else if (document.documentElement.getAttribute("data-theme") === "day") {
    return "day";
  } else {
    return "night";
  }
}
export function useThemeMode() {
  let [e, t] = useState("night");
  let [n, i] = useState(false);
  useEffect(() => {
    let e = document.documentElement;
    let n = () => t(r());
    n();
    i(true);
    let a = new MutationObserver(n);
    a.observe(e, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    return () => a.disconnect();
  }, []);
  return {
    mode: e,
    mounted: n,
    toggle: useCallback(() => {
      (function (e) {
        let t = document.documentElement;
        if (e === "day") {
          t.setAttribute("data-theme", "day");
        } else {
          t.removeAttribute("data-theme");
        }
        try {
          window.localStorage.setItem("tracex.theme", e);
        } catch (e) {}
      })(r() === "day" ? "night" : "day");
      t(r());
    }, []),
    isDay: e === "day",
  };
}
