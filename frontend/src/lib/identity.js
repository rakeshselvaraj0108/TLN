let STORAGE_KEY = "tracex.user";
export let DEFAULT_USER = "investigator";
export function getActiveUser() {
  try {
    return window.localStorage.getItem(STORAGE_KEY) || DEFAULT_USER;
  } catch (n) {
    return DEFAULT_USER;
  }
}
export function setActiveUser(n) {
  try {
    window.localStorage.setItem(STORAGE_KEY, n);
  } catch (n) {}
  window.dispatchEvent(new CustomEvent("tracex:user-changed"));
}
export function authHeaders() {
  return {
    Authorization: `Bearer ${getActiveUser()}`,
  };
}
