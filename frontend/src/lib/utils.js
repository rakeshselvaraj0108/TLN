import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";
export function cn() {
  for (var e = arguments.length, t = Array(e), n = 0; n < e; n++) {
    t[n] = arguments[n];
  }
  return twMerge(clsx(t));
}
