"use client";

import { createContext, useContext, useMemo, useState } from "react";
let r = createContext(null);
let i = createContext({
  select: () => {},
  clear: () => {},
});
export function EvidenceSelectionProvider(e) {
  let { children: s } = e;
  let [t, l] = useState(null);
  let c = useMemo(
    () => ({
      select: (e) => l(e),
      clear: () => l(null),
    }),
    [],
  );
  return (
    <i.Provider value={c}>
      <r.Provider value={t}>{s}</r.Provider>
    </i.Provider>
  );
}
export function useEvidenceSelection() {
  let e = useContext(r);
  let { select: s, clear: t } = useContext(i);
  return {
    selection: e,
    select: s,
    clear: t,
  };
}
export function useEvidenceSelectActions() {
  return useContext(i);
}
