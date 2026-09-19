"use client";

import { useEffect, useRef } from "react";
import { mulberry32, usePrefersReducedMotion } from "@/lib/motion";
import { useThemeMode } from "@/lib/theme";
let n = [
  "X",
  "01",
  "02",
  "07",
  "FRAUD",
  "CASE",
  "TRACE",
  "ID",
  "TX",
  "ACT",
  "CYBER",
  "EVIDENCE",
  "NODE",
  "LINK",
  "₹",
  "IP",
  "DEVICE",
  "ACCOUNT",
  "USER",
  "ALERT",
  "[ ]",
  "//",
  "30.73N",
  "76.77E",
  "04:12",
  "TX-2026",
];
let c = ["X", "01", "IP", "ID", "TX", "CASE", "LINK", "NODE", "₹", "07", "ACT"];
let o = "255, 103, 0";
function d(e, t, a) {
  let s = [];
  for (let i = 0; i < 8; i += 1) {
    let l = (Math.PI / 4) * i + Math.PI / 8;
    s.push({
      x: e + Math.cos(l) * a,
      y: t + Math.sin(l) * a,
    });
  }
  return s;
}
export function SignalField(e) {
  let { mode: t, progressRef: a, tone: x = "ink", density: h = 1, className: m } = e;
  let g = useRef(null);
  let p = usePrefersReducedMotion();
  let { mode: u } = useThemeMode();
  useEffect(() => {
    let e = g.current;
    let s = e == null ? undefined : e.parentElement;
    if (!e || !s) {
      return;
    }
    let i = e.getContext("2d");
    if (!i) {
      return;
    }
    let r = 0;
    let m = 0;
    let u = [];
    let f = [];
    let v = {
      radius: 0,
      cx: 0,
      cy: 0,
    };
    let y = 0;
    let b = 0;
    let j = (function () {
      let e = getComputedStyle(document.documentElement).getPropertyValue("--tx-ink-rgb").trim();
      if (e) {
        return e.replace(/\s+/g, ", ");
      } else {
        return "0, 0, 0";
      }
    })();
    let N = getComputedStyle(document.documentElement)
      .getPropertyValue("--font-jetbrains-mono")
      .trim();
    let k = `${N ? `${N}, ` : ""}ui-monospace, SFMono-Regular, Menlo, monospace`;
    let w = () => {
      let a = s.getBoundingClientRect();
      r = Math.max(1, Math.round(a.width));
      m = Math.max(1, Math.round(a.height));
      let o = Math.min(window.devicePixelRatio || 1, 2);
      e.width = Math.round(r * o);
      e.height = Math.round(m * o);
      e.style.width = `${r}px`;
      e.style.height = `${m}px`;
      i.setTransform(o, 0, 0, o, 0, 0);
      let x = mulberry32(31438);
      let g = r < 720;
      if (t === "shield") {
        let {
          targets: e,
          radius: t,
          cx: a,
          cy: s,
        } = (function (e, t, a, s) {
          let i = e / 2;
          let l = t * 0.44;
          let r = Math.min(e, t) * 0.33 * a;
          let n = [];
          let c = Math.max(7, Math.round(r / 12));
          let o = d(i, l, r);
          for (let e = 0; e < 8; e += 1) {
            let t = o[e];
            let a = o[(e + 1) % 8];
            for (let e = 0; e < c; e += 1) {
              let s = e / c;
              n.push({
                x: t.x + (a.x - t.x) * s,
                y: t.y + (a.y - t.y) * s,
                role: "border",
              });
            }
          }
          let x = d(i, l, r * 0.72);
          let h = Math.max(4, Math.round(r / 20));
          for (let e = 0; e < 8; e += 1) {
            let t = x[e];
            let a = x[(e + 1) % 8];
            for (let e = 0; e < h; e += 1) {
              let s = e / h;
              n.push({
                x: t.x + (a.x - t.x) * s,
                y: t.y + (a.y - t.y) * s,
                role: "ring",
              });
            }
          }
          let m = Math.max(24, Math.round(r / 4.1));
          let g = r * 0.62;
          for (let e = 0; e < m; e += 1) {
            let e = s() * Math.PI * 2;
            let t = Math.sqrt(s()) * g;
            n.push({
              x: i + Math.cos(e) * t,
              y: l + Math.sin(e) * t,
              role: "inner",
            });
          }
          let p = r * 0.42;
          let u = Math.max(7, Math.round(r / 13));
          for (let [e, t] of [
            [1, 1],
            [1, -1],
          ]) {
            for (let a = -u; a <= u; a += 1) {
              let s = a / u;
              n.push({
                x: i + e * s * p,
                y: l + t * s * p,
                role: "cross",
              });
            }
          }
          return {
            targets: n,
            radius: r,
            cx: i,
            cy: l,
          };
        })(r, m, g ? 0.82 : 1, x);
        v = {
          radius: t,
          cx: a,
          cy: s,
        };
        let i = (u = e.map((e) => {
          let i = e.role === "inner" ? x() > 0.18 : e.role === "border" && x() > 0.72;
          return {
            scatterX: a + (x() - 0.5) * r * 1.05,
            scatterY: s + (x() - 0.5) * m * 1.3,
            x: 0,
            y: 0,
            targetX: e.x,
            targetY: e.y,
            vx: (x() - 0.5) * 0.22,
            vy: (x() - 0.5) * 0.22,
            glyph: c[Math.floor(x() * c.length)] ?? "X",
            opacity: e.role === "cross" ? 0.8 + x() * 0.2 : 0.28 + x() * 0.5,
            size: e.role === "cross" ? 2.9 : 1.4 + x() * 1,
            rotation: (x() - 0.5) * 0.5,
            phase: x() * Math.PI * 2,
            type: i ? "evidence" : "dot",
            role: e.role,
            warm: e.role === "border" || e.role === "cross",
          };
        }))
          .map((e, t) => ({
            particle: e,
            index: t,
          }))
          .filter((e) => e.particle.role === "inner");
        f = [];
        for (let e of i) {
          let a = -1;
          let s = Infinity;
          for (let t of i) {
            if (t.index === e.index) {
              continue;
            }
            let i = t.particle.targetX - e.particle.targetX;
            let l = t.particle.targetY - e.particle.targetY;
            let r = i * i + l * l;
            if (r < s) {
              s = r;
              a = t.index;
            }
          }
          let l = t * 0.34;
          if (a >= 0 && e.index < a && Math.sqrt(s) < l) {
            f.push([e.index, a]);
          }
        }
      } else {
        u = Array.from(
          {
            length: Math.min(170, Math.max(28, Math.round(((r * m) / (g ? 11000 : 8200)) * h))),
          },
          () => {
            let t = x();
            let a =
              t < 0.42
                ? "dot"
                : t < 0.58
                  ? "number"
                  : t < 0.74
                    ? "letter"
                    : t < 0.88
                      ? "symbol"
                      : "evidence";
            return {
              x: x() * r,
              y: x() * m,
              scatterX: 0,
              scatterY: 0,
              targetX: 0,
              targetY: 0,
              vx: (x() - 0.5) * 0.16,
              vy: (x() - 0.5) * 0.16,
              glyph: n[Math.floor(x() * n.length)] ?? "X",
              opacity: a === "dot" ? 0.22 + x() * 0.4 : 0.07 + x() * 0.14,
              size: a === "dot" ? 1 + x() * 1.2 : 8 + x() * 3,
              rotation: 0,
              phase: x() * Math.PI * 2,
              type: a,
              role: "inner",
              warm: a === "dot" ? x() > 0.35 : x() > 0.78,
            };
          },
        );
        f = [];
      }
    };
    let M = () => {
      i.clearRect(0, 0, r, m);
      let e = x === "warm";
      let t = r < 720 ? 92 : 132;
      i.lineWidth = 1;
      for (let a = 0; a < u.length; a += 1) {
        let s = u[a];
        if (s.type === "dot") {
          for (let l = a + 1; l < u.length; l += 1) {
            let a = u[l];
            if (a.type !== "dot") {
              continue;
            }
            let r = Math.hypot(s.x - a.x, s.y - a.y);
            if (r > t) {
              continue;
            }
            let n = (1 - r / t) * (e ? 0.12 : 0.07);
            i.strokeStyle = `rgba(${e ? o : j}, ${n})`;
            i.beginPath();
            i.moveTo(s.x, s.y);
            i.lineTo(a.x, a.y);
            i.stroke();
          }
        }
      }
      for (let t of u) {
        let a = t.warm || e ? o : j;
        let s = 0.82 + Math.sin(b * 0.012 + t.phase) * 0.18;
        let l = t.opacity * s * (e ? 1.35 : 1);
        if (t.type === "dot") {
          i.fillStyle = `rgba(${a}, ${l})`;
          i.beginPath();
          i.arc(t.x, t.y, t.size, 0, Math.PI * 2);
          i.fill();
        } else {
          i.fillStyle = `rgba(${a}, ${l})`;
          i.font = `${t.size}px ${k}`;
          i.fillText(t.glyph, t.x, t.y);
        }
      }
    };
    let C = () => {
      for (let e of u) {
        e.x += e.vx;
        e.y += e.vy;
        if (e.x < -60) {
          e.x = r + 60;
        }
        if (e.x > r + 60) {
          e.x = -60;
        }
        if (e.y < -30) {
          e.y = m + 30;
        }
        if (e.y > m + 30) {
          e.y = -30;
        }
      }
      if (b % 7 == 0) {
        for (let t = 0; t < 3; t += 1) {
          let t = u[Math.floor(Math.random() * u.length)];
          if (t && t.type !== "dot") {
            t.glyph = n[Math.floor(Math.random() * n.length)] ?? t.glyph;
          }
        }
      }
    };
    let A = (e) => {
      i.clearRect(0, 0, r, m);
      let t = e < 0.5 ? e * 4 * e * e : 1 - Math.pow(e * -2 + 2, 3) / 2;
      let a = 1 - t;
      for (let e of u) {
        let s = p ? 0 : Math.sin(b * 0.02 + e.phase) * 9 * a;
        let i = p ? 0 : Math.cos(b * 0.017 + e.phase) * 9 * a;
        e.x = e.scatterX + (e.targetX - e.scatterX) * t + s;
        e.y = e.scatterY + (e.targetY - e.scatterY) * t + i;
      }
      let s = Math.max(0, (t - 0.62) / 0.38);
      if (s > 0) {
        i.lineWidth = 1;
        i.strokeStyle = `rgba(${j}, ${s * 0.2})`;
        i.beginPath();
        for (let [e, t] of f) {
          let a = u[e];
          let s = u[t];
          if (a && s) {
            i.moveTo(a.x, a.y);
            i.lineTo(s.x, s.y);
          }
        }
        i.stroke();
      }
      let l = Math.max(0, (t - 0.5) / 0.5);
      if (l > 0) {
        let e = d(v.cx, v.cy, v.radius);
        i.lineWidth = 1;
        i.lineWidth = 1.2;
        i.strokeStyle = `rgba(${o}, ${l * 0.62})`;
        i.beginPath();
        e.forEach((e, t) => {
          if (t === 0) {
            i.moveTo(e.x, e.y);
          } else {
            i.lineTo(e.x, e.y);
          }
        });
        i.closePath();
        i.stroke();
      }
      for (let e of u) {
        let a = e.warm ? o : j;
        let s = 0.35 + t * 0.65;
        let l = e.opacity * s;
        if (e.type === "dot") {
          i.fillStyle = `rgba(${a}, ${l})`;
          i.beginPath();
          i.arc(e.x, e.y, e.size, 0, Math.PI * 2);
          i.fill();
        } else {
          i.fillStyle = `rgba(${a}, ${l * 0.72})`;
          i.font = `9px ${k}`;
          i.fillText(e.glyph, e.x + 3, e.y - 3);
        }
      }
    };
    let E = () => {
      if (b % 9 == 0) {
        for (let t = 0; t < 2; t += 1) {
          let t = u[Math.floor(Math.random() * u.length)];
          if (t && t.type !== "dot") {
            t.glyph = c[Math.floor(Math.random() * c.length)] ?? t.glyph;
          }
        }
      }
    };
    let T = () => {
      b += 1;
      if (t === "shield") {
        E();
        A((a == null ? undefined : a.current) ?? 0);
      } else {
        C();
        M();
      }
      y = requestAnimationFrame(T);
    };
    w();
    if (p) {
      if (t === "shield") {
        A(1);
      } else {
        M();
      }
    } else {
      y = requestAnimationFrame(T);
    }
    let I = new ResizeObserver(() => {
      w();
      if (p) {
        if (t === "shield") {
          A(1);
        } else {
          M();
        }
      }
    });
    I.observe(s);
    return () => {
      if (y) {
        cancelAnimationFrame(y);
      }
      I.disconnect();
    };
  }, [t, a, x, h, p, u]);
  return <canvas ref={g} className={m} aria-hidden="true" />;
}
