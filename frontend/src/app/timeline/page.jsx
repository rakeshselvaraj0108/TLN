"use client";

import { useEffect, useState } from "react";
import { LoaderCircle } from "lucide-react";
import { EventTimeline } from "@/components/EventTimeline";
import { ErrorAlert, PageHeader } from "@/components/ui/primitives";
import { getEntityIntel, getEntityTimeline, getQueue } from "@/lib/api";
export default function TimelinePage() {
  let [e, t] = useState([]);
  let [n, d] = useState("");
  let [o, u] = useState([]);
  let [m, x] = useState(new Set());
  let [h, b] = useState(false);
  let [f, p] = useState(null);
  useEffect(() => {
    getQueue()
      .then((e) => {
        t(e.items);
        if (e.items[0]) {
          d(e.items[0].entity_id);
        }
      })
      .catch((e) => p(String(e)));
  }, []);
  useEffect(() => {
    if (n) {
      b(true);
      p(null);
      Promise.all([getEntityTimeline(n), getEntityIntel(n).catch(() => null)])
        .then((e) => {
          let [t, n] = e;
          u(t.events);
          let r = new Set();
          if (n != null) {
            n.call_to_debit_links.forEach((e) => {
              if (e.latency_s <= 600) {
                r.add(e.call_rec_id);
                r.add(e.debit_rec_id);
              }
            });
          }
          x(r);
        })
        .catch((e) => p(String(e)))
        .finally(() => b(false));
    }
  }, [n]);
  return (
    <div className="space-y-4">
      <PageHeader
        title="Timeline reconstruction"
        description="Every call, data session, transaction, and post for one entity on a single axis. Amber markers mark a call and a debit within 10 minutes."
      />
      <div className="flex items-center gap-2">
        <label className="text-[0.8125rem] text-ink-muted">Entity</label>
        <select
          value={n}
          onChange={(e) => d(e.target.value)}
          className="rounded border border-canvas-border bg-canvas-raised px-2 py-1 text-[0.8125rem] text-ink"
        >
          {e.map((e) => (
            <option value={e.entity_id} key={e.entity_id}>
              {e.entity_id} — {e.band} {e.risk_score.toFixed(2)}
            </option>
          ))}
        </select>
      </div>
      {f ? <ErrorAlert>{f}</ErrorAlert> : null}
      {h ? (
        <div className="flex items-center gap-2 text-ink-muted">
          <LoaderCircle className="h-4 w-4 animate-spin" /> Reconstructing…
        </div>
      ) : (
        <EventTimeline events={o} highlightRecIds={m} />
      )}
    </div>
  );
}
