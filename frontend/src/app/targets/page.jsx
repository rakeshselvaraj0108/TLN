"use client";

import { useCallback, useEffect, useState } from "react";
import { Crosshair, LoaderCircle, Plus, RefreshCw, Sparkles, Trash2 } from "lucide-react";
import { RiskBadge } from "@/components/RiskBadge";
import { DataTable, TableCell, TableRow, TableSkeleton } from "@/components/ui/DataTable";
import {
  EmptyState,
  ErrorAlert,
  PageHeader,
  buttonClass,
  primaryButtonClass,
} from "@/components/ui/primitives";
import { createTarget, deleteTarget, getSuggestedTargets, getTargets } from "@/lib/api";
let _Component = Sparkles;
let m = [
  {
    id: "phone",
    label: "Phone",
    placeholder: "+919xxxxxxxxx",
  },
  {
    id: "imei",
    label: "IMEI",
    placeholder: "15 digits",
  },
  {
    id: "imsi",
    label: "IMSI",
    placeholder: "15 digits",
  },
  {
    id: "account",
    label: "Account",
    placeholder: "HDFC…",
  },
  {
    id: "upi",
    label: "UPI",
    placeholder: "name@bank",
  },
  {
    id: "ip",
    label: "IP",
    placeholder: "203.0.113.4",
  },
  {
    id: "handle",
    label: "Handle",
    placeholder: "@handle",
  },
];
export default function TargetsPage() {
  let [n, d] = useState([]);
  let [f, g] = useState(true);
  let [v, y] = useState(false);
  let [k, j] = useState(null);
  let [w, N] = useState("phone");
  let [Z, T] = useState("");
  let [A, L] = useState("");
  let [M, S] = useState([]);
  let [C, E] = useState(null);
  let I = useCallback(async () => {
    g(true);
    j(null);
    try {
      let e = await getTargets();
      d(e.targets);
    } catch (e) {
      j(String(e));
    } finally {
      g(false);
    }
    try {
      S((await getSuggestedTargets()).suggestions);
    } catch (e) {
      S([]);
    }
  }, []);
  useEffect(() => {
    I();
  }, [I]);
  let _ = async () => {
    let e = Z.trim();
    if (e) {
      y(true);
      j(null);
      try {
        await createTarget({
          kind: w,
          value: e,
          label: A.trim() || undefined,
        });
        T("");
        L("");
        await I();
      } catch (e) {
        j(String(e));
      } finally {
        y(false);
      }
    }
  };
  let D = m.find((e) => e.id === w)?.placeholder ?? "identifier";
  return (
    <div className="space-y-4">
      <PageHeader
        title="Targets"
        description="Identifiers flagged as being of investigative interest. A target is a marker, not a judgement — it changes nothing about how anything is scored."
        actions={
          <button onClick={I} className={buttonClass}>
            <RefreshCw className={"h-3.5 w-3.5 " + (f ? "animate-spin" : "")} />
            Refresh
          </button>
        }
      />
      <section className="rounded border border-canvas-border bg-canvas-panel/50 p-3">
        <h2 className="mb-2 text-[0.6875rem] uppercase tracking-wider text-ink-faint">
          Add a target
        </h2>
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1">
            <span className="text-[0.6875rem] uppercase tracking-wider text-ink-faint">Type</span>
            <select
              value={w}
              onChange={(e) => N(e.target.value)}
              className="focus-ring rounded border border-canvas-border bg-canvas-panel px-2 py-1.5 text-[0.8125rem] text-ink"
            >
              {m.map((e) => (
                <option value={e.id} key={e.id}>
                  {e.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[0.6875rem] uppercase tracking-wider text-ink-faint">
              Identifier
            </span>
            <input
              value={Z}
              onChange={(e) => T(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  _();
                }
              }}
              placeholder={D}
              className="focus-ring mono w-56 rounded border border-canvas-border bg-canvas-panel px-2 py-1.5 text-[0.8125rem] text-ink placeholder:text-ink-faint/70"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[0.6875rem] uppercase tracking-wider text-ink-faint">
              Label <span className="normal-case tracking-normal">(optional)</span>
            </span>
            <input
              value={A}
              onChange={(e) => L(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  _();
                }
              }}
              placeholder="why this is watched"
              className="focus-ring w-64 rounded border border-canvas-border bg-canvas-panel px-2 py-1.5 text-[0.8125rem] text-ink placeholder:text-ink-faint/70"
            />
          </label>
          <button onClick={_} disabled={v || !Z.trim()} className={primaryButtonClass}>
            {v ? (
              <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Plus className="h-3.5 w-3.5" />
            )}
            Add target
          </button>
        </div>
      </section>
      {k ? <ErrorAlert>{k}</ErrorAlert> : null}
      {M.length > 0 ? (
        <section className="rounded border border-canvas-border bg-canvas-panel/50 p-3">
          <h2 className="flex items-center gap-2 text-[0.6875rem] uppercase tracking-wider text-ink-faint">
            <_Component className="h-3.5 w-3.5" aria-hidden={true} />
            Suggested from your data
          </h2>
          <p className="mb-2.5 mt-1 max-w-2xl text-[0.75rem] leading-relaxed text-ink-faint">
            Identifiers controlled by the entities this deployment has scored highest. These are
            candidates, not targets — adding one is still your call, and a score is not a reason on
            its own.
          </p>
          <ul className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
            {M.map((e) => {
              let t = `${e.kind}:${e.value}`;
              let a = n.some((t) => t.kind === e.kind && t.value === e.value);
              return (
                <li
                  className="flex items-start justify-between gap-2 rounded border border-canvas-border bg-canvas-panel px-2.5 py-2"
                  key={t}
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="rounded border border-canvas-border bg-canvas-hover px-1.5 py-0.5 text-[0.625rem] uppercase tracking-wider text-ink-faint">
                        {e.kind}
                      </span>
                      <span className="mono truncate text-[0.8125rem] text-ink">{e.value}</span>
                    </div>
                    <p className="mt-1 flex items-center gap-1.5 text-[0.6875rem] text-ink-faint">
                      <span className="mono text-accent-bright">{e.entity_id}</span>
                      <RiskBadge band={e.band} score={e.risk_score / 100} />
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={a || C === t}
                    onClick={async () => {
                      E(t);
                      j(null);
                      try {
                        await createTarget({
                          kind: e.kind,
                          value: e.value,
                          label: e.reason,
                        });
                        await I();
                      } catch (e) {
                        j(String(e));
                      } finally {
                        E(null);
                      }
                    }}
                    title={a ? "Already watchlisted" : `Watch ${e.value}`}
                    className="focus-ring shrink-0 rounded border border-accent/40 bg-accent/10 px-1.5 py-1 text-accent-bright transition hover:bg-accent/20 disabled:cursor-not-allowed disabled:border-canvas-border disabled:bg-transparent disabled:text-ink-faint"
                  >
                    {C === t ? (
                      <LoaderCircle className="h-3.5 w-3.5 animate-spin" aria-hidden={true} />
                    ) : (
                      <Plus className="h-3.5 w-3.5" aria-hidden={true} />
                    )}
                    <span className="sr-only">
                      {a ? "Already watchlisted" : "Add to watchlist"}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}
      {f ? (
        <TableSkeleton cols={5} rows={4} />
      ) : n.length === 0 ? (
        <EmptyState title="Nothing is watchlisted yet" icon={Crosshair}>
          Add an identifier above, or take one of the suggestions drawn from your own data. Targets
          are highlighted wherever they appear across the graph, records and search.
        </EmptyState>
      ) : (
        <DataTable head={["Type", "Identifier", "Label", "Added by", "Added", ""]}>
          {n.map((e, t) => {
            return (
              <TableRow
                style={{
                  animationDelay: `${Math.min(t, 12) * 20}ms`,
                }}
                className="animate-fade-in"
                key={e.id}
              >
                <TableCell className="whitespace-nowrap">
                  <span className="rounded border border-canvas-border bg-canvas-hover px-1.5 py-0.5 text-[0.6875rem] uppercase tracking-wider text-ink-faint">
                    {e.kind}
                  </span>
                </TableCell>
                <TableCell className="mono whitespace-nowrap text-ink">{e.value}</TableCell>
                <TableCell className="text-ink-muted">
                  {e.label ?? <span className="text-ink-faint/50">—</span>}
                </TableCell>
                <TableCell className="whitespace-nowrap text-[0.75rem] text-ink-faint">
                  {e.added_by}
                </TableCell>
                <TableCell className="whitespace-nowrap text-[0.75rem] tabular-nums text-ink-faint">
                  {e.added_at ? new Date(e.added_at).toLocaleString() : "—"}
                </TableCell>
                <TableCell>
                  <_Component2 id={e.id} value={e.value} onDone={I} onError={j} />
                </TableCell>
              </TableRow>
            );
          })}
        </DataTable>
      )}
    </div>
  );
}
function _Component2(e) {
  let { id: t, value: n, onDone: s, onError: i } = e;
  let [l, c] = useState(false);
  let [o, h] = useState(false);
  if (l) {
    return (
      <span className="inline-flex items-center gap-1">
        <button
          disabled={o}
          onClick={async () => {
            h(true);
            try {
              await deleteTarget(t);
              s();
            } catch (e) {
              i(String(e));
              h(false);
              c(false);
            }
          }}
          className="focus-ring rounded border border-risk-border bg-risk-bg px-1.5 py-0.5 text-[0.6875rem] text-risk"
        >
          {o ? "Removing…" : "Remove"}
        </button>
        <button
          onClick={() => c(false)}
          className="focus-ring rounded px-1.5 py-0.5 text-[0.6875rem] text-ink-faint hover:text-ink-muted"
        >
          Cancel
        </button>
      </span>
    );
  } else {
    return (
      <button
        onClick={() => c(true)}
        aria-label={`Remove target ${n}`}
        className="focus-ring rounded p-1 text-ink-faint transition hover:bg-canvas-hover hover:text-risk"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    );
  }
}
