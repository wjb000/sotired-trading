export const AUTH_KEY = "sotired_auth";
export const DASHBOARD_PASSWORD = "money";

export function isUnlocked() {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(AUTH_KEY) === "ok";
}

export function unlock(password: string) {
  if (password !== DASHBOARD_PASSWORD) return false;
  localStorage.setItem(AUTH_KEY, "ok");
  return true;
}

export function lock() {
  localStorage.removeItem(AUTH_KEY);
}
