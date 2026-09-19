import { getEntityIntel } from "@/lib/api";
let l = new Map();
let s = new Map();
export function getEntityIntelCached(e) {
  let t = l.get(e);
  if (t && Date.now() - t.at < 15000) {
    return Promise.resolve(t.value);
  }
  let n = s.get(e);
  if (n) {
    return n;
  }
  let r = getEntityIntel(e)
    .then((t) => {
      l.set(e, {
        at: Date.now(),
        value: t,
      });
      return t;
    })
    .finally(() => {
      s.delete(e);
    });
  s.set(e, r);
  return r;
}
export function clearEntityIntelCache() {
  l.clear();
}
