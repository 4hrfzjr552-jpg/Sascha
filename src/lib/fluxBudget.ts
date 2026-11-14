/**
 * FLUX.2 billing guardrails and optional browser-local budget.
 * Prices are conservative ESTIMATES based on the BFL API tariff checked on
 * 2026-11-14 for <=1 MP output and <=1 MP garment input.
 * The actual provider charge can change; BFL prepaid credits (AUTO TOP-UP OFF)
 * are the actual hard account-wide spending limit.
 */
export type ImageProvider = "gemini" | "flux-klein" | "flux-pro";
export type FluxProvider = Exclude<ImageProvider,"gemini">;
export const FLUX_MODELS: Record<FluxProvider,string> = {
  "flux-klein": "flux-2-klein-4b",
  "flux-pro": "flux-2-pro",
};
export const FLUX_BASE_COST_USD: Record<FluxProvider,number> = {
  "flux-klein": 0.015,
  "flux-pro": 0.045,
};
export const FLUX_RESERVED_USD: Record<FluxProvider,number> = {
  "flux-klein": 0.025,
  "flux-pro": 0.060,
};
export const DEFAULT_LOCAL_MONTHLY_CAP_USD = 1.00;
export const LOCAL_BUDGET_KEY_PREFIX = "sascha-flux-estimate-v1-";

export function isFluxProvider(value:unknown): value is FluxProvider {
  return value==="flux-klein" || value==="flux-pro";
}
export function serverPreflightCost(
  provider:unknown,
  maxPerRequestUsd:number,
  clientCapUsd:number,
): { provider:FluxProvider; reservedUsd:number } | null {
  if(!isFluxProvider(provider)) return null;
  const reservedUsd=FLUX_RESERVED_USD[provider];
  if(!Number.isFinite(maxPerRequestUsd)||!Number.isFinite(clientCapUsd) ||
    maxPerRequestUsd < reservedUsd || clientCapUsd < reservedUsd) return null;
  return {provider,reservedUsd};
}
export function utcMonthKey(when:Date = new Date()):string {
  return when.toISOString().slice(0,7);
}
export function capCanReserve(used:number,limit:number,estimated:number):boolean {
  return [used,limit,estimated].every(Number.isFinite) &&
    used>=0 && limit>0 && estimated>0 &&
    Number((used+estimated).toFixed(4))<=limit+0.000001;
}
/** Advisory per-browser estimate ONLY, not a billing or account-wide limit. */
export function getLocalFluxUsage(when:Date=new Date()):number {
  try {
    const raw=window.localStorage.getItem(LOCAL_BUDGET_KEY_PREFIX+utcMonthKey(when));
    const parsed=Number(raw||0);
    return Number.isFinite(parsed)&&parsed>=0 ? parsed : 0;
  } catch { return 0; }
}
export function reserveLocalFluxEstimate(provider:FluxProvider,cap:number,when:Date=new Date()) {
  const used=getLocalFluxUsage(when);
  const amount=FLUX_RESERVED_USD[provider];
  if(!capCanReserve(used,cap,amount)) {
    throw new Error(`Dein lokales FLUX-Monatsbudget ist erreicht (ca. $${used.toFixed(2)} von $${cap.toFixed(2)}). Dieses Browser-Limit ist nur eine Schätzung; BFL-Credits sind das echte Kontolimit.`);
  }
  try {
    window.localStorage.setItem(LOCAL_BUDGET_KEY_PREFIX+utcMonthKey(when),String(Number((used+amount).toFixed(4))));
  } catch {
    // Do not silently skip user-requested cost protection if private-mode
    // browsers block localStorage. BFL prepaid balance remains separate.
    throw new Error("Budgetschutz kann in diesem Browser nicht gespeichert werden. Bitte Browser-Speicher aktivieren.");
  }
}

/** Release a reservation only for a confirmed no-charge failure (e.g. no API key). */
export function releaseLocalFluxEstimate(provider:FluxProvider,when:Date=new Date()) {
  const amount=FLUX_RESERVED_USD[provider];
  const used=getLocalFluxUsage(when);
  try {
    window.localStorage.setItem(LOCAL_BUDGET_KEY_PREFIX+utcMonthKey(when),
      String(Number(Math.max(0,used-amount).toFixed(4))));
  }catch { /* Never issue extra generations in response to storage errors. */ }
}
export const LOCAL_CAP_KEY="sascha-flux-monthly-cap-usd-v1";
export function getLocalFluxCap():number {
  try{
    const cap=Number(window.localStorage.getItem(LOCAL_CAP_KEY)||DEFAULT_LOCAL_MONTHLY_CAP_USD);
    return Number.isFinite(cap)&&cap>=0.10&&cap<=10 ? cap : DEFAULT_LOCAL_MONTHLY_CAP_USD;
  }catch{return DEFAULT_LOCAL_MONTHLY_CAP_USD;}
}
export function setLocalFluxCap(next:number) {
  if(!Number.isFinite(next)||next<0.1||next>10)throw Error("Budget muss zwischen $0,10 und $10 liegen.");
  try { window.localStorage.setItem(LOCAL_CAP_KEY,String(next)); }
  catch { throw new Error("Dein Browser kann das lokale Budget nicht speichern."); }
}
