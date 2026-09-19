import { cn } from "@/lib/utils";
export function Card(e) {
  let { className: t, ...n } = e;
  return <div className={cn("rounded border border-canvas-border bg-canvas-panel", t)} {...n} />;
}
export function CardHeader(e) {
  let { className: t, ...n } = e;
  return <div className={cn("border-b border-canvas-border px-4 py-3", t)} {...n} />;
}
export function CardTitle(e) {
  let { className: t, ...n } = e;
  return <h3 className={cn("text-sm font-semibold text-ink", t)} {...n} />;
}
export function CardBody(e) {
  let { className: t, ...n } = e;
  return <div className={cn("p-4", t)} {...n} />;
}
