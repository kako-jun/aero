import { describe, it, expect, beforeEach } from "vitest";
import * as A from "./audio";

// Helper: reset all mutable state before each test
function resetState({
  baseline = 0.01,
  currentState = "idle" as A.AeroState,
  pendingState = "idle" as A.AeroState,
  consecutiveCount = 0,
} = {}) {
  A.setBaseline(baseline);
  A.setCurrentState(currentState);
  A.setPendingState(pendingState);
  A.setConsecutiveCount(consecutiveCount);
}

// ── classifyRms ───────────────────────────────────────────────────────────────

describe("classifyRms", () => {
  beforeEach(() => resetState({ baseline: 0.01 }));

  it("C-01: rms = baseline × 1.0 → idle", () => {
    expect(A.classifyRms(0.01 * 1.0)).toBe("idle");
  });

  it("C-02: rms = baseline × 3.0 → attention", () => {
    expect(A.classifyRms(0.01 * 3.0)).toBe("attention");
  });

  it("C-03: rms = baseline × 10.0 → alert", () => {
    expect(A.classifyRms(0.01 * 10.0)).toBe("alert");
  });

  it("C-04: rms = baseline × 2.5（ちょうど）→ attention", () => {
    expect(A.classifyRms(0.01 * 2.5)).toBe("attention");
  });

  it("C-05: rms = baseline × 2.4999 → idle", () => {
    expect(A.classifyRms(0.01 * 2.4999)).toBe("idle");
  });

  it("C-06: rms = baseline × 6.0（ちょうど）→ alert", () => {
    expect(A.classifyRms(0.01 * 6.0)).toBe("alert");
  });

  it("C-07: rms = baseline × 5.9999 → attention", () => {
    expect(A.classifyRms(0.01 * 5.9999)).toBe("attention");
  });

  it("C-08: rms = 0 → idle", () => {
    expect(A.classifyRms(0)).toBe("idle");
  });

  it("C-09: rms = 1.0（極大）、baseline=0.01 → alert", () => {
    A.setBaseline(0.01);
    expect(A.classifyRms(1.0)).toBe("alert");
  });
});

// ── updateBaseline ────────────────────────────────────────────────────────────

describe("updateBaseline", () => {
  beforeEach(() => resetState({ baseline: 0.01, currentState: "idle" }));

  it("U-01: idle 中は EMA で baseline が変化する", () => {
    const before = A.baseline;
    A.updateBaseline(0.05);
    expect(A.baseline).not.toBe(before);
    // EMA: 0.01 * (1 - 0.004) + 0.05 * 0.004 = 0.009960 + 0.000200 = 0.01016
    const expected = 0.01 * (1 - A.BASELINE_ALPHA) + 0.05 * A.BASELINE_ALPHA;
    expect(A.baseline).toBeCloseTo(expected, 10);
  });

  it("U-02: alert 中は baseline が変化しない", () => {
    A.setCurrentState("alert");
    const before = A.baseline;
    A.updateBaseline(0.5);
    expect(A.baseline).toBe(before);
  });

  it("U-03: attention 中は baseline が変化しない", () => {
    A.setCurrentState("attention");
    const before = A.baseline;
    A.updateBaseline(0.3);
    expect(A.baseline).toBe(before);
  });

  it("U-04: 入力が極小でも NOISE_FLOOR (0.004) 以下にならない", () => {
    // baseline=0.01 → EMA with rms=0 → will decrease, but floor applies
    for (let i = 0; i < 1000; i++) {
      A.updateBaseline(0);
    }
    expect(A.baseline).toBeGreaterThanOrEqual(A.NOISE_FLOOR);
  });

  it("U-05: baseline=0.004、rms=0 → baseline が 0.004 のまま", () => {
    A.setBaseline(0.004);
    A.updateBaseline(0);
    // EMA: 0.004 * (1-0.004) + 0 * 0.004 = 0.003984 → floored to 0.004
    expect(A.baseline).toBe(A.NOISE_FLOOR);
  });
});

// ── applyHysteresis ───────────────────────────────────────────────────────────

describe("applyHysteresis", () => {
  beforeEach(() =>
    resetState({ currentState: "idle", pendingState: "idle", consecutiveCount: 0 })
  );

  it("H-01: next=attention を 2 回 → 2 回目で attention を返す", () => {
    const r1 = A.applyHysteresis("attention");
    expect(r1).toBe("idle"); // 1回目: count=1 < 2
    const r2 = A.applyHysteresis("attention");
    expect(r2).toBe("attention"); // 2回目: count=2 >= 2
  });

  it("H-02: next=attention を 1 回 → currentState(idle) のまま", () => {
    const r = A.applyHysteresis("attention");
    expect(r).toBe("idle");
  });

  it("H-03: currentState=alert、next=idle を 8 回 → 8 回目で idle", () => {
    resetState({ currentState: "alert", pendingState: "idle", consecutiveCount: 0 });
    let result: A.AeroState = "alert";
    for (let i = 0; i < 7; i++) {
      result = A.applyHysteresis("idle");
      expect(result).toBe("alert");
    }
    result = A.applyHysteresis("idle"); // 8回目
    expect(result).toBe("idle");
  });

  it("H-04: currentState=alert、next=idle を 7 回 → alert のまま", () => {
    resetState({ currentState: "alert", pendingState: "idle", consecutiveCount: 0 });
    let result: A.AeroState = "alert";
    for (let i = 0; i < 7; i++) {
      result = A.applyHysteresis("idle");
    }
    expect(result).toBe("alert");
  });

  it("H-05: attention×1 → idle×1 → attention×1 → まだ確定しない", () => {
    const r1 = A.applyHysteresis("attention"); // count=1
    expect(r1).toBe("idle");
    const r2 = A.applyHysteresis("idle"); // pending変わる count=1
    expect(r2).toBe("idle");
    const r3 = A.applyHysteresis("attention"); // pending変わる count=1
    expect(r3).toBe("idle");
  });

  it("H-06: currentState=alert、next=attention を 2 回 → attention（UP 閾値=2）", () => {
    resetState({ currentState: "alert", pendingState: "idle", consecutiveCount: 0 });
    const r1 = A.applyHysteresis("attention");
    expect(r1).toBe("alert"); // 1回目: count=1 < 2
    const r2 = A.applyHysteresis("attention");
    expect(r2).toBe("attention"); // 2回目: count=2 >= 2
  });

  it("H-07: 閾値ちょうど HYSTERESIS_UP=2 のとき 2 回で確定（>= 境界）", () => {
    // HYSTERESIS_UP = 2, threshold for attention/alert = HYSTERESIS_UP
    expect(A.HYSTERESIS_UP).toBe(2);
    A.applyHysteresis("alert"); // count=1
    const r = A.applyHysteresis("alert"); // count=2 >= 2
    expect(r).toBe("alert");
  });
});
