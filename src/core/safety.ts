export type SafetyMode = "normal" | "read-only" | "freeze-writes" | "lockdown";

let mode: SafetyMode = "normal";

export function getSafetyMode(): SafetyMode {
  return mode;
}

export function setSafetyMode(next: SafetyMode): void {
  mode = next;
}
