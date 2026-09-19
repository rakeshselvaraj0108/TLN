"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { LoaderCircle, RefreshCw, Trash2, TriangleAlert } from "lucide-react";
import { DataTable, TableCell, TableRow, TableSkeleton } from "@/components/ui/DataTable";
import {
  EmptyState,
  ErrorAlert,
  PageHeader,
  buttonClass,
  primaryButtonClass,
} from "@/components/ui/primitives";
import {
  RECORDS_PAGE_SIZE,
  createAction,
  deleteAction,
  getActions,
  getMe,
  getQueue,
  getSar,
} from "@/lib/api";
let x = [
  {
    id: "escalate",
    label: "Escalate",
    help: "Raise for supervisory review. No external effect.",
    supervisorOnly: false,
  },
  {
    id: "dismiss",
    label: "Dismiss",
    help: "Record that this entity was reviewed and found unremarkable.",
    supervisorOnly: false,
  },
  {
    id: "freeze_request",
    label: "Request freeze",
    help: "Records a request to the bank. TRACE-X freezes nothing itself.",
    supervisorOnly: true,
  },
  {
    id: "sar_draft",
    label: "Draft SAR",
    help: "Place in the suspicious-activity report queue for filing review.",
    supervisorOnly: true,
  },
];
let m = RECORDS_PAGE_SIZE;
export default function DispositionsPage() {
  let [e, t] = useState([]);
  let [n, l] = useState([]);
  let [c, o] = useState([]);
  let [x, m] = useState(null);
  let [p, j] = useState(true);
  let [k, w] = useState(null);
  let N = useCallback(async () => {
    j(true);
    w(null);
    try {
      let [e, n] = await Promise.all([getActions(), getSar()]);
      t(e.actions);
      l(n.drafts);
    } catch (e) {
      w(String(e));
    } finally {
      j(false);
    }
  }, []);
  useEffect(() => {
    N();
  }, [N]);
  useEffect(() => {
    getMe()
      .then(m)
      .catch(() => m(null));
    getQueue()
      .then((e) => o(e.items.map((e) => e.entity_id)))
      .catch(() => o([]));
  }, []);
  useEffect(() => {
    let e = () => {
      getMe()
        .then(m)
        .catch(() => m(null));
      N();
    };
    window.addEventListener("tracex:user-changed", e);
    return () => window.removeEventListener("tracex:user-changed", e);
  }, [N]);
  return (
    <div className="space-y-4">
      <PageHeader
        title="Dispositions"
        description="What was decided about an entity, by whom, and on what basis. Every disposition carries the score it was taken against, so a later re-analysis cannot rewrite the record."
        actions={
          <button onClick={N} className={buttonClass}>
            <RefreshCw className={"h-3.5 w-3.5 " + (p ? "animate-spin" : "")} />
            Refresh
          </button>
        }
      />
      <_Component entities={c} me={x} onDone={N} onError={w} />
      {k ? <ErrorAlert>{k}</ErrorAlert> : null}
      <_Component2 drafts={n} loading={p} />
      <section className="space-y-2">
        <h2 className="text-[0.6875rem] uppercase tracking-wider text-ink-faint">
          All dispositions
        </h2>
        {p ? (
          <TableSkeleton cols={6} rows={5} />
        ) : e.length === 0 ? (
          <EmptyState title="Nothing decided yet">
            Record a disposition above to close the loop on a queued entity.
          </EmptyState>
        ) : (
          <DataTable head={["Action", "Entity", "Score then", "Rationale", "By", "When", ""]}>
            {e.map((e, t) => {
              var n;
              return (
                <TableRow
                  style={{
                    animationDelay: `${Math.min(t, 12) * 18}ms`,
                  }}
                  className="animate-fade-in"
                  key={e.id}
                >
                  <TableCell>
                    <_Component3 action={e.action} />
                  </TableCell>
                  <TableCell className="mono whitespace-nowrap">
                    <Link
                      href={`/profiles/${e.entity_id}`}
                      className="text-accent-bright hover:underline"
                    >
                      {e.entity_id}
                    </Link>
                  </TableCell>
                  <TableCell className="mono tabular-nums text-ink-muted">
                    {((n = e.risk_score_at_action) === null || n === undefined
                      ? undefined
                      : n.toFixed(3)) ?? "—"}
                  </TableCell>
                  <TableCell className="max-w-md text-ink-muted">{e.rationale}</TableCell>
                  <TableCell className="whitespace-nowrap text-[0.75rem] text-ink-faint">
                    {e.actor_username}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-[0.75rem] tabular-nums text-ink-faint">
                    {y(e.created_at)}
                  </TableCell>
                  <TableCell>
                    {(x == null ? undefined : x.is_supervisor) ? (
                      <_Component4 id={e.id} onDone={N} onError={w} />
                    ) : null}
                  </TableCell>
                </TableRow>
              );
            })}
          </DataTable>
        )}
      </section>
    </div>
  );
}
function _Component(e) {
  let { entities: t, me: n, onDone: s, onError: i } = e;
  let [c, o] = useState("");
  let [h, p] = useState("escalate");
  let [f, b] = useState("");
  let [v, g] = useState(false);
  useEffect(() => {
    if (!c && t.length > 0) {
      o(t[0]);
    }
  }, [t, c]);
  let y = x.find((e) => e.id === h);
  let j = !!(y == null ? undefined : y.supervisorOnly) && !!n && !n.is_supervisor;
  let k = f.trim().length < m;
  let w = async () => {
    if (c && !k && !j) {
      g(true);
      try {
        await createAction(c, {
          action: h,
          rationale: f.trim(),
        });
        b("");
        s();
      } catch (e) {
        i(String(e));
      } finally {
        g(false);
      }
    }
  };
  return (
    <section className="space-y-2 rounded border border-canvas-border bg-canvas-panel/50 p-3">
      <h2 className="text-[0.6875rem] uppercase tracking-wider text-ink-faint">
        Record a disposition
      </h2>
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1">
          <span className="text-[0.6875rem] uppercase tracking-wider text-ink-faint">Entity</span>
          <select
            value={c}
            onChange={(e) => o(e.target.value)}
            className="focus-ring mono rounded border border-canvas-border bg-canvas-panel px-2 py-1.5 text-[0.8125rem] text-ink"
          >
            {t.length === 0 ? <option value="">No scored entities</option> : null}
            {t.map((e) => (
              <option value={e} key={e}>
                {e}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[0.6875rem] uppercase tracking-wider text-ink-faint">Action</span>
          <select
            value={h}
            onChange={(e) => p(e.target.value)}
            className="focus-ring rounded border border-canvas-border bg-canvas-panel px-2 py-1.5 text-[0.8125rem] text-ink"
          >
            {x.map((e) => (
              <option value={e.id} key={e.id}>
                {e.label}
                {e.supervisorOnly ? " (supervisor)" : ""}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-1 flex-col gap-1">
          <span className="text-[0.6875rem] uppercase tracking-wider text-ink-faint">
            Rationale <span className="normal-case tracking-normal">(required)</span>
          </span>
          <input
            value={f}
            onChange={(e) => b(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                w();
              }
            }}
            placeholder="Why this decision — the basis a reviewer will read"
            className="focus-ring min-w-64 rounded border border-canvas-border bg-canvas-panel px-2 py-1.5 text-[0.8125rem] text-ink placeholder:text-ink-faint/60"
          />
        </label>
        <button onClick={w} disabled={v || !c || k || j} className={primaryButtonClass}>
          {v ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : null}Record
        </button>
      </div>
      <p className="text-[0.6875rem] leading-relaxed text-ink-faint">
        {y == null ? undefined : y.help}
        {j ? (
          <span className="text-risk">
            {" "}
            This action requires a supervisor; you are signed in as{" "}
            {n == null ? undefined : n.display_name}.
          </span>
        ) : k && f.length > 0 ? (
          <span className="text-risk">
            {" "}
            A rationale of at least {m} characters is required — a decision recorded without a
            reason is not reviewable.
          </span>
        ) : null}
      </p>
    </section>
  );
}
function _Component2(e) {
  let { drafts: t, loading: n } = e;
  if (n || t.length === 0) {
    return null;
  } else {
    return (
      <section className="space-y-2">
        <h2 className="text-[0.6875rem] uppercase tracking-wider text-ink-faint">SAR queue</h2>
        <DataTable
          head={["Entity", "Score at draft", "Score now", "Rationale", "Drafted by", "When"]}
        >
          {t.map((e) => {
            var t;
            var n;
            return (
              <TableRow className={e.score_moved ? "bg-risk-bg/30" : undefined} key={e.id}>
                <TableCell className="mono whitespace-nowrap">
                  <Link
                    href={`/profiles/${e.entity_id}`}
                    className="text-accent-bright hover:underline"
                  >
                    {e.entity_id}
                  </Link>
                </TableCell>
                <TableCell className="mono tabular-nums text-ink-muted">
                  {((t = e.risk_score_at_action) === null || t === undefined
                    ? undefined
                    : t.toFixed(3)) ?? "—"}
                </TableCell>
                <TableCell className="mono tabular-nums">
                  <span className={e.score_moved ? "text-risk" : "text-ink-muted"}>
                    {((n = e.current_risk_score) === null || n === undefined
                      ? undefined
                      : n.toFixed(3)) ?? "—"}
                  </span>
                  {e.score_moved ? (
                    <TriangleAlert
                      className="ml-1 inline h-3 w-3 text-risk"
                      aria-label="Score has moved since drafting"
                    />
                  ) : null}
                </TableCell>
                <TableCell className="max-w-md text-ink-muted">{e.rationale}</TableCell>
                <TableCell className="whitespace-nowrap text-[0.75rem] text-ink-faint">
                  {e.actor_username}
                </TableCell>
                <TableCell className="whitespace-nowrap text-[0.75rem] tabular-nums text-ink-faint">
                  {y(e.created_at)}
                </TableCell>
              </TableRow>
            );
          })}
        </DataTable>
        <p className="text-[0.6875rem] text-ink-faint">
          A highlighted row means the entity has been re-scored since the draft was written. Re-read
          it before filing.
        </p>
      </section>
    );
  }
}
function _Component3(e) {
  let { action: a } = e;
  let s =
    a === "freeze_request"
      ? "border-risk-border bg-risk-bg text-risk"
      : a === "sar_draft"
        ? "border-canvas-border bg-canvas-hover text-ink"
        : a === "dismiss"
          ? "border-canvas-border bg-canvas-panel text-ink-faint"
          : "border-accent/40 bg-accent/10 text-accent-bright";
  let i = x.find((e) => e.id === a)?.label ?? a;
  return (
    <span
      className={`inline-block whitespace-nowrap rounded border px-1.5 py-0.5 text-[0.6875rem] uppercase tracking-wider ${s}`}
    >
      {i}
    </span>
  );
}
function _Component4(e) {
  let { id: t, onDone: n, onError: s } = e;
  let [i, l] = useState(false);
  let [c, u] = useState(false);
  if (i) {
    return (
      <span className="inline-flex items-center gap-1">
        <button
          disabled={c}
          onClick={async () => {
            u(true);
            try {
              await deleteAction(t);
              n();
            } catch (e) {
              s(String(e));
              u(false);
              l(false);
            }
          }}
          className="focus-ring whitespace-nowrap rounded border border-risk-border bg-risk-bg px-1.5 py-0.5 text-[0.6875rem] text-risk"
        >
          {c ? "Withdrawing…" : "Withdraw"}
        </button>
        <button
          onClick={() => l(false)}
          className="focus-ring rounded px-1.5 py-0.5 text-[0.6875rem] text-ink-faint hover:text-ink-muted"
        >
          Cancel
        </button>
      </span>
    );
  } else {
    return (
      <button
        onClick={() => l(true)}
        aria-label="Withdraw this disposition"
        className="focus-ring rounded p-1 text-ink-faint transition hover:bg-canvas-hover hover:text-risk"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    );
  }
}
function y(e) {
  if (!e) {
    return "—";
  }
  let t = new Date(e);
  if (Number.isNaN(t.getTime())) {
    return e;
  } else {
    return t.toLocaleString();
  }
}
