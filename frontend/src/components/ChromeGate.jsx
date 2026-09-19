"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  ArrowUpRight,
  BadgeCheck,
  Bot,
  BotMessageSquare,
  Brain,
  ChevronRight,
  Clock,
  Crosshair,
  Database,
  Earth,
  FileCheck2,
  FileText,
  FolderKanban,
  Gauge,
  Gavel,
  GitCompareArrows,
  LayoutGrid,
  ListChecks,
  MapPin,
  MessagesSquare,
  Moon,
  Network,
  Route,
  ScanEye,
  ScrollText,
  Search,
  Settings,
  Share2,
  ShieldCheck,
  Siren,
  SquareDashedMousePointer,
  Sun,
  Table2,
  UserCog,
  XIcon,
} from "lucide-react";
import {
  EvidenceSelectionProvider,
  useEvidenceSelection,
} from "@/components/evidence/EvidenceSelection";
import { CrossMark } from "@/components/landing/primitives";
import { RiskBadge } from "@/components/RiskBadge";
import { ShapFactors } from "@/components/ShapFactors";
import { ApiError, getCases, getMe, getUsers } from "@/lib/api";
import { getEntityIntelCached } from "@/lib/entity-cache";
import { DEFAULT_USER, getActiveUser, setActiveUser } from "@/lib/identity";
import { useThemeMode } from "@/lib/theme";
import { cn } from "@/lib/utils";
function _Component7() {
  let [t, n] = useState(null);
  let [r, i] = useState([]);
  let [d, u] = useState(DEFAULT_USER);
  let h = useCallback(() => {
    u(getActiveUser());
    getMe()
      .then(n)
      .catch(() => n(null));
  }, []);
  useEffect(() => {
    h();
    getUsers()
      .then((e) => i(e.users))
      .catch(() => i([]));
    let e = () => h();
    window.addEventListener("tracex:user-changed", e);
    return () => window.removeEventListener("tracex:user-changed", e);
  }, [h]);
  return (
    <div className="flex items-center gap-2 text-[0.8125rem]">
      <UserCog className="h-3.5 w-3.5 text-ink-faint" />
      <select
        value={d}
        onChange={(e) => setActiveUser(e.target.value)}
        className="rounded border border-canvas-border bg-canvas-raised px-1.5 py-0.5 text-[0.8125rem] text-ink"
        title="Acting as (demo stand-in for department SSO)"
      >
        {(r.length
          ? r
          : [
              {
                username: d,
                role: "",
              },
            ]
        ).map((e) => (
          <option value={e.username} key={e.username}>
            {e.username}
          </option>
        ))}
      </select>
      <span
        className={
          "rounded px-1.5 py-0.5 text-[0.6875rem] uppercase tracking-wider " +
          ((t == null ? undefined : t.is_supervisor)
            ? "bg-accent/15 text-accent-bright"
            : "bg-canvas-panel text-ink-faint")
        }
      >
        {(t == null ? undefined : t.role) ?? "unknown"}
      </span>
    </div>
  );
}
let B = [
  {
    label: "Investigate",
    items: [
      {
        href: "/overview",
        label: "Overview",
        icon: LayoutGrid,
      },
      {
        href: "/eye",
        label: "Investigation Eye",
        icon: ScanEye,
      },
      {
        href: "/chat",
        label: "Agent chat",
        icon: MessagesSquare,
      },
      {
        href: "/search",
        label: "Search",
        icon: Search,
      },
      {
        href: "/queue",
        label: "Risk queue",
        icon: ListChecks,
      },
      {
        href: "/targets",
        label: "Targets",
        icon: Crosshair,
      },
    ],
  },
  {
    label: "Data",
    items: [
      {
        href: "/ingest",
        label: "Data ingestion",
        icon: Database,
      },
      {
        href: "/records",
        label: "Source records",
        icon: Table2,
      },
      {
        href: "/graph",
        label: "Knowledge graph",
        icon: Share2,
      },
      {
        href: "/timeline",
        label: "Timeline",
        icon: Clock,
      },
      {
        href: "/geo",
        label: "Geography",
        icon: MapPin,
      },
      {
        href: "/gods-eye",
        label: "God’s Eye View",
        icon: Earth,
      },
    ],
  },
  {
    label: "Analysis",
    items: [
      {
        href: "/correlations",
        label: "Correlations",
        icon: GitCompareArrows,
      },
      {
        href: "/pattern",
        label: "Pattern of life",
        icon: Route,
      },
      {
        href: "/anomalies",
        label: "Anomaly sweep",
        icon: Siren,
      },
      {
        href: "/hunt",
        label: "Campaign hunt",
        icon: Network,
      },
      {
        href: "/response-agent",
        label: "Response agent",
        icon: BotMessageSquare,
      },
    ],
  },
  {
    label: "Casework",
    items: [
      {
        href: "/cases",
        label: "Cases",
        icon: FolderKanban,
      },
      {
        href: "/dispositions",
        label: "Dispositions",
        icon: Gavel,
      },
      {
        href: "/evidence",
        label: "Evidence",
        icon: ShieldCheck,
      },
      {
        href: "/agents",
        label: "Agent pipeline",
        icon: Bot,
      },
      {
        href: "/reasoning",
        label: "Reasoning state",
        icon: Brain,
      },
      {
        href: "/audit",
        label: "Audit log",
        icon: FileText,
      },
    ],
  },
  {
    label: "Assurance",
    items: [
      {
        href: "/verification",
        label: "Answer verification",
        icon: BadgeCheck,
      },
      {
        href: "/integrity",
        label: "Integrity",
        icon: FileCheck2,
      },
      {
        href: "/compliance",
        label: "Compliance",
        icon: ScrollText,
      },
      {
        href: "/model",
        label: "Model monitor",
        icon: Activity,
      },
      {
        href: "/benchmark",
        label: "Benchmark",
        icon: Gauge,
      },
      {
        href: "/settings",
        label: "Settings",
        icon: Settings,
      },
    ],
  },
];
function z(e, t) {
  if (t === "/") {
    return e === "/";
  } else {
    return e === t || e.startsWith(t + "/");
  }
}
let H = "tracex:nav-open";
function U() {
  let e = usePathname() || "/";
  let t = (function (e) {
    for (let t of B) {
      if (t.items.some((t) => z(e, t.href))) {
        return t.label;
      }
    }
    return null;
  })(e);
  let [n, l] = useState([]);
  let [c, o] = useState(false);
  useEffect(() => {
    let e = [];
    try {
      let t = window.localStorage.getItem(H);
      if (t) {
        e = JSON.parse(t);
      }
    } catch (t) {
      e = [];
    }
    let n = t && !e.includes(t) ? [...e, t] : e;
    l(n.length ? n : t ? [t] : [B[0].label]);
    o(true);
  }, [t]);
  useEffect(() => {
    if (c) {
      try {
        window.localStorage.setItem(H, JSON.stringify(n));
      } catch (e) {}
    }
  }, [n, c]);
  let d = (e) => l((t) => (t.includes(e) ? t.filter((t) => t !== e) : [...t, e]));
  return (
    <nav className="flex-1 overflow-y-auto px-2 py-1.5">
      {B.map((r) => {
        let s = n.includes(r.label);
        let l = t === r.label;
        let c = `nav-${r.label.toLowerCase()}`;
        return (
          <div className="mb-0.5 last:mb-0" key={r.label}>
            <button
              type="button"
              onClick={() => d(r.label)}
              aria-expanded={s}
              aria-controls={c}
              className={cn(
                "focus-ring group flex w-full items-center gap-2 rounded px-2.5 py-2 text-[0.6875rem] font-semibold uppercase tracking-[0.08em] transition",
                s || l
                  ? "text-ink-muted"
                  : "text-ink-faint/80 hover:bg-canvas-hover hover:text-ink-muted",
              )}
            >
              <ChevronRight
                className={cn(
                  "h-3 w-3 shrink-0 transition-transform duration-200",
                  s && "rotate-90",
                )}
                strokeWidth={2.5}
                aria-hidden={true}
              />
              {r.label}
              {l && !s ? (
                <span
                  className="ml-auto h-1.5 w-1.5 shrink-0 rounded-full bg-accent-bright"
                  aria-label="contains the current page"
                />
              ) : null}
            </button>
            {s ? (
              <div id={c} className="animate-fade-in space-y-px pb-1 pl-2">
                {r.items.map((t) => {
                  let { href: n, label: r, icon: _Component } = t;
                  let l = z(e, n);
                  return (
                    <Link
                      href={n}
                      aria-current={l ? "page" : undefined}
                      className={cn(
                        "group relative flex items-center gap-2.5 rounded px-2.5 py-1.5 text-[0.8125rem] transition",
                        l
                          ? "bg-accent/12 font-medium text-ink"
                          : "text-ink-muted hover:bg-canvas-hover hover:text-ink",
                      )}
                      key={n}
                    >
                      <span
                        className={cn(
                          "absolute inset-y-1 left-0 w-0.5 rounded-full bg-accent-bright transition-opacity",
                          l ? "opacity-100" : "opacity-0",
                        )}
                      />
                      <_Component
                        className={cn(
                          "h-4 w-4 shrink-0 transition-colors",
                          l ? "text-accent-bright" : "text-ink-faint group-hover:text-ink-muted",
                        )}
                        strokeWidth={1.75}
                      />
                      {r}
                    </Link>
                  );
                })}
              </div>
            ) : null}
          </div>
        );
      })}
    </nav>
  );
}
let G = {
  open: "border-canvas-border text-ink-muted",
  review: "border-accent/40 bg-accent/10 text-accent-bright",
  closed: "border-ok/40 bg-ok/15 text-ok",
};
function V() {
  let [r, l] = useState(null);
  useEffect(() => {
    let e = false;
    getCases()
      .then((t) => {
        if (!e) {
          l(t);
        }
      })
      .catch(() => {
        if (!e) {
          l([]);
        }
      });
    let t = () => {
      getCases()
        .then((t) => !e && l(t))
        .catch(() => {});
    };
    window.addEventListener("tracex:user-changed", t);
    return () => {
      e = true;
      window.removeEventListener("tracex:user-changed", t);
    };
  }, []);
  if (r === null) {
    return (
      <div className="flex items-center gap-2" aria-hidden={true}>
        <div className="skeleton h-3 w-10 rounded-sm" />
        <div className="skeleton h-3 w-24 rounded-sm" />
      </div>
    );
  }
  let o = r.find((e) => e.status !== "closed") ?? r[0] ?? null;
  if (o) {
    return (
      <Link
        href={`/cases/${o.id}`}
        title={o.title}
        className="flex items-center gap-2 rounded px-1.5 py-1 text-sm transition hover:bg-canvas-hover"
      >
        <FolderKanban className="h-3.5 w-3.5 text-ink-faint" />
        <span className="mono text-ink">{o.case_code}</span>
        <span className="hidden max-w-[22ch] truncate text-[0.8125rem] text-ink-faint lg:inline">
          {o.title}
        </span>
        <span
          className={cn(
            "rounded border px-1.5 py-0.5 text-[0.6875rem] uppercase tracking-wider",
            G[o.status] ?? G.open,
          )}
        >
          {o.status}
        </span>
        {r.length > 1 ? (
          <span className="text-[0.6875rem] text-ink-faint">+{r.length - 1}</span>
        ) : null}
      </Link>
    );
  } else {
    return (
      <Link
        href="/cases"
        className="flex items-center gap-2 rounded px-1.5 py-1 text-[0.8125rem] text-ink-faint transition hover:bg-canvas-hover hover:text-ink-muted"
      >
        <FolderKanban className="h-3.5 w-3.5" />
        No active case
      </Link>
    );
  }
}
function et(e) {
  let t = Math.sin(e * 12.9898) * 43758.5453;
  return t - Math.floor(t);
}
function _Component5(e) {
  let { metrics: t, seedKey: n } = e;
  let r = useRef(null);
  let i = useMemo(
    () =>
      (function (e) {
        let t = (e, t, n) => Math.max(t, Math.min(n, e));
        return [
          {
            key: "calls",
            label: "Call records",
            varName: "--series-1",
            rate: t(0.35 + e.calls * 0.22, 0.35, 2.6),
            amp: t(0.4 + e.calls * 0.06, 0.4, 1),
          },
          {
            key: "banking",
            label: "Banking",
            varName: "--series-2",
            rate: t(0.3 + e.banking * 0.18, 0.3, 2.2),
            amp: t(0.45 + e.banking * 0.05, 0.45, 1),
          },
          {
            key: "social",
            label: "Social · OSINT",
            varName: "--series-4",
            rate: t(0.2 + e.social * 0.25, 0.2, 1.6),
            amp: t(0.35 + e.social * 0.07, 0.35, 0.9),
          },
        ];
      })(t),
    [t],
  );
  let l = useMemo(() => {
    let e = 0;
    for (let t = 0; t < n.length; t++) {
      e = (e * 31 + n.charCodeAt(t)) | 0;
    }
    return Math.abs(e) % 9973;
  }, [n]);
  useEffect(() => {
    let e;
    let t = r.current;
    if (!t) {
      return;
    }
    let n = t.getContext("2d");
    if (!n) {
      return;
    }
    let a = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let s = i.length * 34 + (i.length - 1) * 8;
    let c = 0;
    let o = 0;
    let d = 1;
    let u = 0;
    let h = i.map(() => []);
    let m = i.map((e, t) => 0.4 + et(l + t * 7) * (1 / e.rate));
    let x = [];
    function f() {
      let e = t.parentElement;
      o = e ? e.clientWidth : 280;
      d = Math.min(window.devicePixelRatio || 1, 2);
      t.width = Math.max(1, Math.floor(o * d));
      t.height = Math.floor(s * d);
      t.style.width = "100%";
      t.style.height = `${s}px`;
      n.setTransform(d, 0, 0, d, 0, 0);
    }
    function p(t, n) {
      return (e == null ? undefined : e.getPropertyValue(t).trim()) || n;
    }
    let b = performance.now();
    function v(r) {
      let d = (r - b) / 1000;
      if (r - u > 500) {
        e = getComputedStyle(t);
        u = r;
      }
      i.forEach((e, t) => {
        while (m[t] <= d) {
          h[t].push(m[t]);
          let n = 0.75 + et(l + t * 13 + h[t].length) * 0.6;
          m[t] += n / e.rate;
        }
        let n = d - 6 - 1;
        while (h[t].length && h[t][0] < n) {
          h[t].shift();
        }
      });
      let f = h[0][h[0].length - 1];
      let g = h[1][h[1].length - 1];
      for (
        f != null &&
        g != null &&
        Math.abs(f - g) < 0.09 &&
        (x.length === 0 || d - x[x.length - 1] > 0.3) &&
        x.push(Math.max(f, g));
        x.length && x[0] < d - 6 - 1;
      ) {
        x.shift();
      }
      n.clearRect(0, 0, o, s);
      let j = p("--chart-grid", "rgba(255,255,255,0.08)");
      let k = p("--text-faint", "#847f76");
      i.forEach((e, t) => {
        let a = t * 42;
        let r = a + 17;
        n.strokeStyle = j;
        n.lineWidth = 1;
        n.beginPath();
        n.moveTo(0, r + 0.5);
        n.lineTo(o, r + 0.5);
        n.stroke();
        let i = p(e.varName, "#3987e5");
        n.strokeStyle = i;
        n.lineWidth = 1.4;
        n.lineJoin = "round";
        n.beginPath();
        for (let a = 0; a <= o; a += 2) {
          let i = d - (o - a) / 46;
          let s = (et(Math.floor(i * 40) + l + t * 101) - 0.5) * 0.12;
          for (let n = h[t].length - 1; n >= 0; n--) {
            let a = i - h[t][n];
            if (!(a < 0)) {
              if (a > 0.5) {
                break;
              }
              s +=
                (a < 0 || a > 0.5
                  ? 0
                  : a < 0.06
                    ? Math.sin((a / 0.06) * Math.PI) * -0.18
                    : a < 0.16
                      ? Math.sin(((a - 0.06) / 0.1) * Math.PI)
                      : a < 0.32
                        ? Math.sin(((a - 0.16) / 0.16) * Math.PI) * -0.32
                        : 0) * e.amp;
            }
          }
          let c = r - s * 14;
          if (a === 0) {
            n.moveTo(a, c);
          } else {
            n.lineTo(a, c);
          }
        }
        n.stroke();
        n.fillStyle = i;
        n.beginPath();
        n.arc(o - 1, r, 1.6, 0, Math.PI * 2);
        n.fill();
        n.fillStyle = k;
        n.font = '600 8px ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif';
        n.textBaseline = "top";
        n.fillText(e.label.toUpperCase(), 2, a + 1);
      });
      let w = p("--accent-brand", "#ff6700");
      for (let e of x) {
        let t = d - e;
        let a = o - t * 46;
        if (a < 0 || a > o) {
          continue;
        }
        let r = Math.max(0, 1 - t / 6);
        n.strokeStyle = w;
        n.globalAlpha = 0.28 + r * 0.5;
        n.lineWidth = 1.2;
        n.setLineDash([2, 2]);
        n.beginPath();
        n.moveTo(a, 2);
        n.lineTo(a, s - 2);
        n.stroke();
        n.setLineDash([]);
        n.fillStyle = w;
        n.globalAlpha = 0.5 + r * 0.5;
        n.beginPath();
        n.arc(a, s / 2, 2.2, 0, Math.PI * 2);
        n.fill();
        n.globalAlpha = 1;
      }
      if (!a) {
        c = requestAnimationFrame(v);
      }
    }
    e = getComputedStyle(t);
    f();
    let g = new ResizeObserver(f);
    if (t.parentElement) {
      g.observe(t.parentElement);
    }
    if (a) {
      b = performance.now() - 4000;
      performance.now();
      i.forEach((e, t) => {
        for (let e = 0; e < 6; e++) {
          h[t].push(0.5 + e * 0.9);
        }
      });
      v(performance.now());
    } else {
      c = requestAnimationFrame(v);
    }
    return () => {
      cancelAnimationFrame(c);
      g.disconnect();
    };
  }, [i, l]);
  return (
    <div className="rounded border border-canvas-border bg-canvas p-1.5">
      <canvas ref={r} aria-hidden={true} className="block" />
      <div className="mt-1 flex items-center gap-2 px-1 text-[0.5625rem] uppercase tracking-wider text-ink-faint">
        <span className="inline-flex items-center gap-1">
          <span
            className="h-1.5 w-1.5 rounded-full"
            style={{
              background: "var(--accent-brand)",
            }}
          />
          call↔debit join
        </span>
        <span className="ml-auto text-ink-faint/70">live · rate ∝ activity</span>
      </div>
    </div>
  );
}
function _Component9() {
  var e;
  let { selection: r, clear: l } = useEvidenceSelection();
  let o = (r == null ? undefined : r.entityId) ?? null;
  let [d, u] = useState(null);
  let [h, m] = useState(false);
  let [x, f] = useState(false);
  useEffect(() => {
    if (!o) {
      u(null);
      return;
    }
    let e = false;
    m(true);
    u(null);
    f(false);
    getEntityIntelCached(o)
      .then((t) => {
        if (!e) {
          u(t);
        }
      })
      .catch((t) => {
        if (!e && t instanceof ApiError && t.isServiceDown) {
          f(true);
        }
      })
      .finally(() => {
        if (!e) {
          m(false);
        }
      });
    return () => {
      e = true;
    };
  }, [o]);
  let p = useMemo(() => {
    var e;
    var t;
    var n;
    let c;
    if (d) {
      let e = d.fanout_links.reduce(
        (e, t) => e + (t.hop_count || t.outbound_rec_ids.length || 1),
        0,
      );
      let t = d.identifiers.filter((e) => /social|handle/i.test(e.kind)).length;
      return {
        calls: d.call_to_debit_links.length,
        banking: e || d.fanout_links.length,
        social: t || Math.max(0, d.identifiers.length - 2),
      };
    }
    let o = (r == null ? undefined : r.props) ?? {};
    let u = typeof o[(c = "member_count")] == "number" ? o[c] : 0;
    return {
      calls: /phone|sim/i.test(
        (r == null
          ? undefined
          : (e = r.labels) === null || e === undefined
            ? undefined
            : e.join(" ")) ?? "",
      )
        ? 3
        : u || 1,
      banking: /account|upi/i.test(
        (r == null
          ? undefined
          : (t = r.labels) === null || t === undefined
            ? undefined
            : t.join(" ")) ?? "",
      )
        ? 3
        : 1,
      social: /social|handle/i.test(
        (r == null
          ? undefined
          : (n = r.labels) === null || n === undefined
            ? undefined
            : n.join(" ")) ?? "",
      )
        ? 4
        : 1,
    };
  }, [d, r]);
  return (
    <aside className="flex h-full flex-col overflow-hidden border-l border-canvas-border bg-canvas-raised">
      <div className="flex h-[38px] shrink-0 items-center justify-between border-b border-canvas-border px-4">
        <h2 className="text-[0.6875rem] font-semibold uppercase tracking-wider text-ink-faint">
          Inspector
        </h2>
        {r ? (
          <button
            onClick={l}
            aria-label="Clear selection"
            className="rounded p-0.5 text-ink-faint transition hover:bg-canvas-hover hover:text-ink"
          >
            <XIcon className="h-3.5 w-3.5" />
          </button>
        ) : null}
      </div>
      <div className="flex-1 overflow-auto p-4">
        {r ? null : <_Component2 />}
        {r ? (
          <div className="animate-fade-in space-y-4" key={o ?? "sel"}>
            <_Component3 selection={r} detail={d} />
            {r.props && Object.keys(r.props).length > 0 ? (
              <_Component4 title="Properties">
                <dl className="space-y-1">
                  {Object.entries(r.props).map((e) => {
                    let [t, n] = e;
                    return (
                      <div className="flex justify-between gap-3 text-[0.75rem]" key={t}>
                        <dt className="shrink-0 text-ink-faint">{t}</dt>
                        <dd className="mono truncate text-right">{String(n)}</dd>
                      </div>
                    );
                  })}
                </dl>
              </_Component4>
            ) : null}
            <_Component4 title="Live signal">
              <_Component5
                metrics={p}
                seedKey={
                  o ??
                  ((e = r.labels) === null || e === undefined ? undefined : e.join(":")) ??
                  "sel"
                }
              />
              <p className="mt-1.5 text-[0.6875rem] leading-relaxed text-ink-faint">
                Call records, banking and social/OSINT for this entity, drawn as they arrive. The
                accent line marks a call and a debit landing in the same window — the cross-source
                coincidence.
              </p>
            </_Component4>
            {h ? <_Component6 /> : null}
            {d ? (
              <Fragment>
                <_Component4 title="Why it scored">
                  <ShapFactors factors={d.top_factors.slice(0, 5)} compact={true} />
                </_Component4>
                {d.identifiers.length > 0 ? (
                  <_Component4 title="Identities merged (OSINT)">
                    <ul className="space-y-1 text-[0.75rem]">
                      {Object.entries(
                        d.identifiers.reduce((e, t) => {
                          e[t.kind] = (e[t.kind] ?? 0) + 1;
                          return e;
                        }, {}),
                      ).map((e) => {
                        let [t, n] = e;
                        return (
                          <li className="flex justify-between gap-2" key={t}>
                            <span className="text-ink-muted">{t}</span>
                            <span className="mono text-ink-faint">{n}</span>
                          </li>
                        );
                      })}
                    </ul>
                  </_Component4>
                ) : null}
                {d.call_to_debit_links.length > 0 || d.fanout_links.length > 0 ? (
                  <_Component4 title="Cross-domain">
                    <ul className="space-y-1 text-[0.75rem] text-ink-muted">
                      {d.call_to_debit_links.length > 0 ? (
                        <li className="flex justify-between gap-2">
                          <span>call→debit links</span>
                          <span className="mono text-risk">{d.call_to_debit_links.length}</span>
                        </li>
                      ) : null}
                      {d.fanout_links.length > 0 ? (
                        <li className="flex justify-between gap-2">
                          <span>fan-out patterns</span>
                          <span className="mono text-risk">{d.fanout_links.length}</span>
                        </li>
                      ) : null}
                    </ul>
                  </_Component4>
                ) : null}
                <Link
                  href={`/queue/${encodeURIComponent(d.entity_id)}`}
                  className="focus-ring flex items-center justify-between rounded border border-accent/40 bg-accent/10 px-2.5 py-2 text-[0.8125rem] text-accent-bright transition hover:bg-accent/20"
                >
                  Full assessment
                  <ArrowUpRight className="h-3.5 w-3.5" />
                </Link>
                <p className="text-[0.6875rem] leading-relaxed text-ink-faint">
                  A score ranks this queue. It is not a finding — this entity requires human review
                  before any action.
                </p>
              </Fragment>
            ) : null}
            {h || d || !o ? null : x ? (
              <p className="text-[0.75rem] leading-relaxed text-ink-faint">
                The attribution for this entity is built from the knowledge graph, which is
                unreachable. The score above still stands — only the explanation of it is
                unavailable. Start the graph service to see the full assessment.
              </p>
            ) : (
              <p className="text-[0.75rem] leading-relaxed text-ink-faint">
                No assessment for this entity yet. Run an analysis pass from the risk queue.
              </p>
            )}
          </div>
        ) : null}
      </div>
    </aside>
  );
}
function _Component3(e) {
  var t;
  let { selection: d, detail: u } = e;
  let h = (u == null ? undefined : u.band) ?? d.band ?? null;
  let m = (u == null ? undefined : u.risk_score) ?? d.riskScore ?? undefined;
  let x =
    d.entityId ??
    ((t = d.labels) === null || t === undefined ? undefined : t.join(" · ")) ??
    "Selection";
  return (
    <div>
      {d.labels?.length ? (
        <div className="mb-1 text-[0.6875rem] uppercase tracking-wider text-ink-faint">
          {d.labels.join(" · ")}
        </div>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <span className="mono text-sm font-semibold text-ink">{x}</span>
        {h ? <RiskBadge band={h} score={m ?? undefined} /> : null}
      </div>
      {d.origin ? <p className="mt-1 text-[0.6875rem] text-ink-faint">{d.origin}</p> : null}
    </div>
  );
}
function _Component4(e) {
  let { title: t, children: n } = e;
  return (
    <section>
      <h3 className="mb-1.5 text-[0.6875rem] font-semibold uppercase tracking-wider text-ink-faint">
        {t}
      </h3>
      {n}
    </section>
  );
}
function _Component6() {
  return (
    <div className="space-y-2" aria-hidden={true}>
      {[0, 1, 2, 3].map((e) => (
        <div className="flex items-center gap-2" key={e}>
          <div className="skeleton h-2.5 flex-1 rounded-sm" />
          <div className="skeleton h-2.5 w-8 rounded-sm" />
        </div>
      ))}
    </div>
  );
}
function _Component2() {
  return (
    <div className="flex flex-col items-center gap-2 pt-6 text-center">
      <SquareDashedMousePointer className="h-6 w-6 text-ink-faint/50" strokeWidth={1.5} />
      <p className="text-[0.75rem] leading-relaxed text-ink-faint">
        Select a node in the knowledge graph or a row in the risk queue to inspect it here —
        attribution, cross-domain links, and a route into the full assessment.
      </p>
    </div>
  );
}
function _Component8() {
  let { isDay: e, mounted: t, toggle: n } = useThemeMode();
  let r = e ? "Switch to night mode" : "Switch to day mode";
  return (
    <button
      type="button"
      onClick={n}
      className="focus-ring ml-3 inline-flex items-center gap-1.5 rounded border border-canvas-border px-2 py-1 text-[0.6875rem] uppercase tracking-wider text-ink-muted transition hover:bg-canvas-hover hover:text-ink"
      aria-label={r}
      title={r}
    >
      <span suppressHydrationWarning={true}>
        {t && e ? <Moon className="h-3.5 w-3.5" /> : <Sun className="h-3.5 w-3.5" />}
      </span>
      <span suppressHydrationWarning={true}>{t && e ? "Night" : "Day"}</span>
    </button>
  );
}
function _Component0(e) {
  let { children: t } = e;
  return (
    <EvidenceSelectionProvider>
      <div className="grid h-screen grid-cols-[212px_1fr] grid-rows-[48px_1fr] bg-transparent">
        <aside className="row-span-2 flex flex-col overflow-hidden border-r border-canvas-border bg-canvas-raised">
          <Link
            href="/overview"
            className="flex h-12 shrink-0 items-center gap-2.5 border-b border-canvas-border px-4 text-ink transition hover:bg-canvas-hover"
          >
            <CrossMark size={20} className="shrink-0 text-accent-brand" />
            <span className="text-[0.8125rem] tracking-[0.16em] text-ink">TRACE X</span>
          </Link>
          <U />
        </aside>
        <header className="col-start-2 flex items-center justify-between gap-4 border-b border-canvas-border bg-canvas-raised px-4">
          <V />
          <div className="flex items-center">
            <_Component7 />
            <_Component8 />
          </div>
        </header>
        <main className="col-start-2 grid min-h-0 grid-cols-1 overflow-hidden xl:grid-cols-[1fr_310px]">
          <section
            id="main-content"
            tabIndex={-1}
            className="min-w-0 overflow-auto p-6 focus:outline-none"
          >
            {t}
          </section>
          <div className="hidden min-h-0 xl:block">
            <_Component9 />
          </div>
        </main>
      </div>
    </EvidenceSelectionProvider>
  );
}
let ex = ["/landing"];
export function ChromeGate(e) {
  let { children: n } = e;
  let i = usePathname() ?? "/";
  if (ex.some((e) => i === e || i.startsWith(`${e}/`))) {
    return <Fragment>{n}</Fragment>;
  } else {
    return (
      <Fragment>
        <a href="#main-content" className="skip-link">
          Skip to main content
        </a>
        <div className="visual-spine" aria-hidden="true" />
        <div className="bg-wordmark font-serif italic" aria-hidden="true">
          TRACE-X
        </div>
        <div className="bg-scrim" aria-hidden="true" />
        <_Component0>{n}</_Component0>
      </Fragment>
    );
  }
}
