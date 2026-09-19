import { cn } from "@/lib/utils";
export function DataTable(e) {
  let { head: t, children: n, className: s } = e;
  return (
    <div className="-mx-1 overflow-x-auto px-1">
      <table className={cn("w-full border-collapse text-[0.8125rem]", s)}>
        <thead>
          <tr className="border-b border-canvas-border text-left text-[0.6875rem] uppercase tracking-wider text-ink-faint">
            {t.map((e, t) => (
              <th className="whitespace-nowrap py-2 pr-3 font-medium last:pr-0" key={t}>
                {e}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{n}</tbody>
      </table>
    </div>
  );
}
export function TableRow(e) {
  let { className: t, ...n } = e;
  return (
    <tr
      className={cn(
        "border-b border-canvas-border/50 transition-colors last:border-0 hover:bg-canvas-hover/60",
        t,
      )}
      {...n}
    />
  );
}
export function TableCell(e) {
  let { className: t, ...n } = e;
  return <td className={cn("py-2 pr-3 align-middle last:pr-0", t)} {...n} />;
}
export function TableSkeleton(e) {
  let { cols: t = 5, rows: n = 4 } = e;
  return (
    <div className="space-y-2 py-1" aria-busy={true} aria-label="Loading">
      {Array.from({
        length: n,
      }).map((e, n) => (
        <div className="flex gap-3" key={n}>
          {Array.from({
            length: t,
          }).map((e, t) => (
            <div className="skeleton h-3 flex-1 rounded-sm" key={t} />
          ))}
        </div>
      ))}
    </div>
  );
}
