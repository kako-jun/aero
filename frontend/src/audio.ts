// ── State type ────────────────────────────────────────────────────────────────

export type AeroState = "idle" | "attention" | "alert";

// ── Constants ─────────────────────────────────────────────────────────────────

export const BASELINE_ALPHA = 0.004; // slow EMA decay toward quiet
export const ATTENTION_RATIO = 2.5; // 2.5× baseline → attention
export const ALERT_RATIO = 6.0; // 6× baseline → alert
export const NOISE_FLOOR = 0.004; // baseline never drops below this

// Hysteresis: require N consecutive samples before committing to a state change.
// Up (louder) is fast (2) to react quickly; down (quieter) is slow (8) to
// avoid flicker when sounds are brief.
export const HYSTERESIS_UP = 2;
export const HYSTERESIS_DOWN = 8;

// ── Mutable state ─────────────────────────────────────────────────────────────

// Rolling baseline: exponential moving average of quiet periods.
// Initial value of 0.01 covers typical mic noise floor.
export let baseline = 0.01;

export let currentState: AeroState = "idle";
export let consecutiveCount = 0;
export let pendingState: AeroState = "idle";

// ── State setters (for test reset) ───────────────────────────────────────────

export function setBaseline(v: number) {
  baseline = v;
}

export function setCurrentState(v: AeroState) {
  currentState = v;
}

export function setConsecutiveCount(v: number) {
  consecutiveCount = v;
}

export function setPendingState(v: AeroState) {
  pendingState = v;
}

// ── Pure logic ────────────────────────────────────────────────────────────────

export function classifyRms(rms: number): AeroState {
  if (rms >= baseline * ALERT_RATIO) return "alert";
  if (rms >= baseline * ATTENTION_RATIO) return "attention";
  return "idle";
}

export function updateBaseline(rms: number) {
  // Only update while idle — don't let sustained alerts inflate the baseline
  if (currentState === "idle") {
    baseline = baseline * (1 - BASELINE_ALPHA) + rms * BASELINE_ALPHA;
  }
  // Never let baseline collapse below noise floor
  baseline = Math.max(baseline, NOISE_FLOOR);
}

export function applyHysteresis(next: AeroState): AeroState {
  if (next === pendingState) {
    consecutiveCount++;
  } else {
    pendingState = next;
    consecutiveCount = 1;
  }

  const threshold = next === "idle" ? HYSTERESIS_DOWN : HYSTERESIS_UP;

  if (consecutiveCount >= threshold) {
    return next;
  }
  return currentState; // hold until confident
}
