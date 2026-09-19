export function ShapFactors(e) {
  let { factors: s, compact: t } = e;
  let n = Math.max(...s.map((e) => Math.abs(e.shap)), 0.0001);
  return (
    <ul className={t ? "space-y-1" : "space-y-1.5"}>
      {s.map((e, s) => {
        let r = (Math.abs(e.shap) / n) * 100;
        let i = e.direction === "raises";
        return (
          <li
            className={
              "items-center gap-2 " +
              (t ? "grid grid-cols-[1fr_46px]" : "grid grid-cols-[180px_1fr_64px]")
            }
            key={e.feature}
          >
            {t ? null : (
              <span className="truncate text-[0.75rem] text-ink-muted" title={e.feature}>
                {e.feature}
              </span>
            )}
            <span className={t ? "min-w-0" : ""}>
              {t ? (
                <span
                  className="mb-0.5 block truncate text-[0.6875rem] text-ink-muted"
                  title={e.feature}
                >
                  {e.feature}
                </span>
              ) : null}
              <span className={"relative block rounded-sm bg-canvas-hover " + (t ? "h-2" : "h-3")}>
                <span
                  className={
                    "absolute inset-y-0 left-0 origin-left rounded-sm animate-grow-x " +
                    (i ? "bg-accent" : "bg-ink-faint/60")
                  }
                  style={{
                    width: `${r}%`,
                    animationDelay: `${s * 45}ms`,
                  }}
                />
              </span>
            </span>
            <span
              className={
                "text-right font-mono " +
                (t ? "text-[0.625rem]" : "text-[0.6875rem]") +
                (i ? " text-accent-bright" : " text-ink-faint")
              }
            >
              {e.shap > 0 ? "+" : ""}
              {e.shap.toFixed(3)}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
