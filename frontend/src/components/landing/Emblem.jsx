"use client";

// TRACE X's own mark. (An earlier version of the landing page rendered an institutional emblem here; that image and
// every reference to it have been removed.)
export function BrandMark(e) {
  let { size, height } = e;
  let t = size ?? height ?? 30;
  return (
    <span
      className="grid shrink-0 place-items-center bg-[color:var(--tx-orange)]"
      style={{
        width: t * 0.78,
        height: t * 0.78,
      }}
      aria-hidden="true"
    >
      <svg width={t * 0.46} height={t * 0.46} viewBox="0 0 16 16" fill="none">
        <path
          d="M5.4 2h5.2l3.4 3.4v5.2L10.6 14H5.4L2 10.6V5.4z"
          stroke="var(--tx-on-orange)"
          strokeWidth="1.1"
          strokeLinejoin="round"
        />
        <path d="M8 4.6v6.8M5.2 8h5.6" stroke="var(--tx-on-orange)" strokeWidth="1.1" />
      </svg>
    </span>
  );
}
