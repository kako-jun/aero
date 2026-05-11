import "./styles.css";
import * as Audio from "./audio";
import {
  type AeroState,
  classifyRms,
  updateBaseline,
  applyHysteresis,
} from "./audio";

// Re-export for backward compatibility / external consumers
export type { AeroState } from "./audio";
export {
  baseline,
  BASELINE_ALPHA,
  ATTENTION_RATIO,
  ALERT_RATIO,
  NOISE_FLOOR,
  HYSTERESIS_UP,
  HYSTERESIS_DOWN,
  currentState,
  consecutiveCount,
  pendingState,
  classifyRms,
  updateBaseline,
  applyHysteresis,
} from "./audio";

// ── Audio monitoring ─────────────────────────────────────────────────────────

const FFT_SIZE = 512;
const SAMPLE_INTERVAL_MS = 80;

// ── UI ───────────────────────────────────────────────────────────────────────

const app = document.querySelector<HTMLDivElement>("#app")!;

app.innerHTML = `
  <main class="shell">
    <section class="bubble bubble-idle" id="bubble" aria-label="aero — All clear" aria-live="polite">
      <div class="orb" id="orb" aria-hidden="true"></div>
      <div class="label" id="label">Listening…</div>
    </section>
  </main>
`;

const bubble = document.getElementById("bubble")!;
const orb = document.getElementById("orb")!;
const label = document.getElementById("label")!;

export const STATE_LABELS: Record<AeroState, string> = {
  idle: "All clear",
  attention: "Something nearby",
  alert: "Loud sound!",
};

export function renderState(state: AeroState) {
  bubble.className = `bubble bubble-${state}`;
  orb.className = `orb orb-${state}`;
  label.textContent = STATE_LABELS[state];
  bubble.setAttribute("aria-label", `aero — ${STATE_LABELS[state]}`);
}

function renderError(message: string) {
  bubble.className = "bubble bubble-error";
  orb.className = "orb orb-error";
  label.textContent = message;
  bubble.setAttribute("aria-label", `aero — Error: ${message}`);
}

// ── Microphone setup ──────────────────────────────────────────────────────────

let monitoringActive = false;
let intervalId: ReturnType<typeof setInterval> | null = null;

export async function startMonitoring(): Promise<void> {
  if (monitoringActive) return;

  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
  } catch (err) {
    renderError("No mic access");
    return;
  }

  monitoringActive = true;
  const ctx = new AudioContext();
  const source = ctx.createMediaStreamSource(stream);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = FFT_SIZE;
  source.connect(analyser);

  const buf = new Float32Array(analyser.fftSize);

  function tick() {
    analyser.getFloatTimeDomainData(buf);

    let sum = 0;
    for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
    const rms = Math.sqrt(sum / buf.length);

    updateBaseline(rms);

    const raw = classifyRms(rms);
    const next = applyHysteresis(raw);

    if (next !== Audio.currentState) {
      Audio.setCurrentState(next);
      renderState(Audio.currentState);
    }
  }

  intervalId = setInterval(tick, SAMPLE_INTERVAL_MS);
  return;
}

export function stopMonitoring() {
  if (intervalId !== null) {
    clearInterval(intervalId);
    intervalId = null;
  }
  monitoringActive = false;
}

// ── Boot ──────────────────────────────────────────────────────────────────────

renderState("idle");
startMonitoring();
