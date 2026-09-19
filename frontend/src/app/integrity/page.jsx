"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  FlaskConical,
  LoaderCircle,
  RotateCcw,
  ShieldCheck,
  ShieldX,
  TriangleAlert,
} from "lucide-react";
import { DataTable, TableCell, TableRow } from "@/components/ui/DataTable";
import {
  ErrorAlert,
  PageHeader,
  buttonClass,
  primaryButtonClass,
} from "@/components/ui/primitives";
import { getMe, restoreIntegrity, runIntegrityDrill, verifyIntegrity } from "@/lib/api";
let _Component4 = ShieldX;
let _Component5 = FlaskConical;
export default function IntegrityPage() {
  let [e, t] = useState(null);
  let [r, c] = useState(null);
  let [l, d] = useState(true);
  let [o, u] = useState(null);
  let [x, p] = useState(null);
  let [j, v] = useState(false);
  let N = useCallback(async () => {
    d(true);
    u(null);
    try {
      t(await verifyIntegrity());
    } catch (e) {
      u(String(e));
      t(null);
    } finally {
      d(false);
    }
  }, []);
  useEffect(() => {
    N();
  }, [N]);
  useEffect(() => {
    getMe()
      .then(c)
      .catch(() => c(null));
    let e = () =>
      getMe()
        .then(c)
        .catch(() => c(null));
    window.addEventListener("tracex:user-changed", e);
    return () => window.removeEventListener("tracex:user-changed", e);
  }, []);
  let g = async () => {
    v(true);
    u(null);
    try {
      let e = await runIntegrityDrill({
        source_type: "bank",
        field: "amount",
        new_value: "1",
      });
      p(e);
      t(await verifyIntegrity());
    } catch (e) {
      u(String(e));
    } finally {
      v(false);
    }
  };
  let y = useMemo(() => {
    let r = e == null ? undefined : e.batches.find((e) => !e.intact && e.first_breach);
    if (r == null ? undefined : r.first_breach?.record_id) {
      return {
        source_type: r.source_type,
        record_id: r.first_breach.record_id,
      };
    } else {
      return null;
    }
  }, [e]);
  let w = async () => {
    let e = x
      ? {
          source_type: x.source_type,
          record_id: x.record_id,
        }
      : y;
    if (e) {
      v(true);
      u(null);
      try {
        await restoreIntegrity({
          ...e,
          restore_token: x == null ? undefined : x.restore_token,
        });
        p(null);
        t(await verifyIntegrity());
      } catch (e) {
        u(e instanceof Error ? e.message : String(e));
      } finally {
        v(false);
      }
    }
  };
  return (
    <div className="space-y-4">
      <PageHeader
        title="Evidentiary integrity"
        description="Every stored record is re-hashed and every chain re-walked against the values recorded at ingest. This page exists to be tested, not believed — run the drill and watch the check fail."
        actions={
          <button onClick={N} disabled={l} className={buttonClass}>
            {l ? (
              <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <ShieldCheck className="h-3.5 w-3.5" />
            )}
            Re-verify
          </button>
        }
      />
      {o ? <ErrorAlert>{o}</ErrorAlert> : null}
      {l && !e ? <div className="skeleton h-28 rounded" /> : e ? <_Component report={e} /> : null}
      <_Component2 me={r} drill={x} breached={y} busy={j} onTamper={g} onRestore={w} />
      {e ? <_Component3 batches={e.batches} /> : null}
    </div>
  );
}
function _Component(e) {
  let { report: t } = e;
  let r = t.all_intact;
  return (
    <section
      className={
        "animate-fade-in flex items-start gap-3 rounded border p-4 " +
        (r
          ? "border-canvas-border bg-canvas-panel/60"
          : "border-risk-border bg-risk-bg shadow-raised")
      }
    >
      {r ? (
        <ShieldCheck className="mt-0.5 h-7 w-7 shrink-0 text-ok" strokeWidth={1.5} />
      ) : (
        <_Component4 className="mt-0.5 h-7 w-7 shrink-0 text-risk" strokeWidth={1.5} />
      )}
      <div className="min-w-0">
        <p className={"text-base font-semibold tracking-tight " + (r ? "text-ink" : "text-risk")}>
          {r ? "All records verified" : "Integrity failure"}
        </p>
        <p className="mt-1 text-[0.8125rem] leading-relaxed text-ink-muted">{t.summary}</p>
        <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-[0.75rem] text-ink-faint">
          <span>
            <span className="tabular-nums text-ink-muted">{t.total_records}</span> records
          </span>
          <span>
            <span className="tabular-nums text-ink-muted">{t.batch_count}</span> batches
          </span>
          {r ? null : (
            <span className="text-risk">
              <span className="tabular-nums">{t.compromised_batches}</span> compromised
            </span>
          )}
        </div>
      </div>
    </section>
  );
}
function _Component2(e) {
  var t;
  let { me: r, drill: s, breached: i, busy: c, onTamper: l, onRestore: u } = e;
  let h = (t = r == null ? undefined : r.is_supervisor) !== null && t !== undefined && t;
  return (
    <section className="reasoning-surface--counter space-y-3 p-3">
      <div className="flex items-start gap-2">
        <_Component5 className="mt-0.5 h-4 w-4 shrink-0 text-risk" strokeWidth={1.75} />
        <div className="min-w-0">
          <h2 className="text-[0.8125rem] font-medium text-ink">Tamper drill</h2>
          <p className="mt-0.5 text-[0.75rem] leading-relaxed text-ink-muted">
            Alters one stored transaction — a ₹4,80,000 debit becomes ₹1 — without touching its
            recorded hash, exactly as an edit made straight in the database would. Then re-verify.
            The check names the record, reports how far the batch was sound before it, and evidence
            export is refused until it is put back.
          </p>
        </div>
      </div>
      {!s && i ? (
        <div className="space-y-2 rounded border border-risk-border bg-canvas-panel p-3">
          <p className="text-[0.75rem] leading-relaxed text-ink-muted">
            A drill run earlier is still in effect on{" "}
            <span className="mono text-ink">{i.record_id}</span> — this tab did not run it, so the
            original is not held here. It can still be put back: the record is restored from the
            drill’s audit entry and written only if the result hashes to the value recorded at
            ingest.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <button onClick={u} disabled={c || !h} className={buttonClass}>
              {c ? (
                <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RotateCcw className="h-3.5 w-3.5" />
              )}
              Restore {i.record_id}
            </button>
            {h ? null : (
              <span className="text-[0.75rem] text-ink-faint">
                Supervisor only — switch identity in the top bar.
              </span>
            )}
          </div>
        </div>
      ) : null}
      {s ? (
        <div className="space-y-3">
          <div className="rounded border border-risk-border bg-canvas-panel p-3">
            <p className="text-[0.6875rem] uppercase tracking-wider text-ink-faint">
              Record altered
            </p>
            <p className="mono mt-0.5 text-[0.8125rem] text-ink">
              {s.record_id} · {s.field}
            </p>
            <p className="mt-1 text-[0.8125rem] text-ink-muted">
              <span className="mono text-ink-faint line-through">{String(s.original_value)}</span> →{" "}
              <span className="mono text-risk">{s.new_value}</span>
            </p>
            <dl className="mt-3 space-y-1.5">
              <div>
                <dt className="text-[0.625rem] uppercase tracking-wider text-ink-faint">
                  Hash recorded at ingest
                </dt>
                <dd className="mono break-all text-[0.6875rem] text-ink-muted">
                  {s.stored_row_sha256}
                </dd>
              </div>
              <div>
                <dt className="text-[0.625rem] uppercase tracking-wider text-ink-faint">
                  Hash of the record as it stands now
                </dt>
                <dd className="mono break-all text-[0.6875rem] text-risk">
                  {s.recomputed_row_sha256}
                </dd>
              </div>
            </dl>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button onClick={u} disabled={c} className={buttonClass}>
              {c ? (
                <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RotateCcw className="h-3.5 w-3.5" />
              )}
              Restore the record
            </button>
            <span className="text-[0.75rem] text-ink-faint">
              The drill is reversible and both the alteration and the restore are in the audit log.
            </span>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <button onClick={l} disabled={c || !h} className={primaryButtonClass}>
            {c ? (
              <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <_Component5 className="h-3.5 w-3.5" />
            )}
            Run the drill
          </button>
          {h ? null : (
            <span className="text-[0.75rem] text-ink-faint">
              Supervisor only — switch identity in the top bar.
            </span>
          )}
        </div>
      )}
    </section>
  );
}
function _Component3(e) {
  let { batches: t } = e;
  return (
    <section className="space-y-2">
      <h2 className="text-[0.6875rem] uppercase tracking-wider text-ink-faint">
        Per-batch verification
      </h2>
      <DataTable head={["Source", "File", "Records", "Verified to", "Status", "Chain head"]}>
        {t.map((e) => (
          <TableRow
            className={e.intact ? undefined : "bg-risk-bg/40"}
            key={`${e.source_type}-${e.batch_id}`}
          >
            <TableCell className="whitespace-nowrap uppercase text-ink-muted">
              {e.source_type}
            </TableCell>
            <TableCell className="mono whitespace-nowrap text-ink-faint">{e.filename}</TableCell>
            <TableCell className="tabular-nums text-ink-muted">{e.records}</TableCell>
            <TableCell className="tabular-nums text-ink-muted">
              {e.intact ? "all" : `seq ${e.verified_through_seq}`}
            </TableCell>
            <TableCell>
              {e.intact ? (
                <span className="inline-flex items-center gap-1 text-[0.75rem] text-ok">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  intact
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-[0.75rem] text-risk">
                  <TriangleAlert className="h-3.5 w-3.5" />
                  failed
                </span>
              )}
            </TableCell>
            <TableCell className="mono text-[0.6875rem] text-ink-faint" title={e.chain_head}>
              {e.chain_head.slice(0, 12)}…
            </TableCell>
          </TableRow>
        ))}
        {t
          .filter((e) => e.first_breach)
          .map((e) => (
            <TableRow className="bg-risk-bg/20" key={`${e.batch_id}-breach`}>
              <TableCell colSpan={6} className="py-3">
                <_Component6 batch={e} />
              </TableCell>
            </TableRow>
          ))}
      </DataTable>
    </section>
  );
}
let j = {
  content_altered: "Record content was changed after ingest",
  link_broken: "A record was inserted or removed",
  chain_recomputed: "The chain value was rewritten",
};
function _Component6(e) {
  let { batch: s } = e;
  let a = s.first_breach;
  return (
    <div className="space-y-1.5 border-l-2 border-risk pl-3">
      <p className="text-[0.8125rem] font-medium text-risk">{j[a.kind] ?? a.kind}</p>
      <p className="text-[0.8125rem] text-ink-muted">
        Record <span className="mono text-ink">{a.record_id ?? `seq ${a.seq}`}</span> in{" "}
        <span className="mono">{s.filename}</span> — {a.detail}
      </p>
      <div className="grid gap-1 pt-1 sm:grid-cols-2">
        <div>
          <p className="text-[0.625rem] uppercase tracking-wider text-ink-faint">Expected</p>
          <p className="mono break-all text-[0.6875rem] text-ink-muted">{a.expected}</p>
        </div>
        <div>
          <p className="text-[0.625rem] uppercase tracking-wider text-ink-faint">Found</p>
          <p className="mono break-all text-[0.6875rem] text-risk">{a.actual}</p>
        </div>
      </div>
      {s.breach_count > 1 ? (
        <p className="pt-1 text-[0.6875rem] text-ink-faint">
          {s.breach_count} discrepancies in total; the first is shown. A chain is only meaningful up
          to its first break — everything after it is unverifiable rather than independently wrong.
        </p>
      ) : null}
    </div>
  );
}
