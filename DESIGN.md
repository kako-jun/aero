# DESIGN.md

aero — Design System

## 1. Visual Theme & Atmosphere

Tiny ambient indicator for desktop use. The app should feel calm while idle and sharply expressive only when something changes.

The visual language should be simple, soft, and readable from the corner of the eye. It is closer to a living status bubble than a dashboard.

Theme: low-noise, light, translucent, corner-friendly, and alert without panic.

## 2. Color Palette & Roles

| Role | Value | Usage |
|---|---|---|
| Idle green | `#34d399` | Normal state |
| Attention yellow | `#facc15` | Raised ambient sound |
| Alert red | `#ef4444` | Strong sudden change |
| Dark ink | `#111827` | Outline / strong contrast |
| Soft bg | `rgba(255,255,255,0.72)` | Bubble body |
| Shadow | `rgba(17,24,39,0.18)` | Floating effect |

## 3. Typography Rules

Use system UI fonts. Text should be minimal and secondary to shape and color.

- Main label: `clamp(0.8rem, 1vw, 0.95rem)`
- Status note: smaller and optional
- Numeric dB values should not dominate the UI

## 4. Layout Principles

- Bottom-right anchored by default
- Small footprint while idle
- Scale up only when the sound state changes
- Prefer one main bubble, not multiple floating panels
- Pixel-art icons should remain readable at small sizes

## 5. Interaction

- The indicator is primarily passive
- Hover / focus may reveal settings later
- Alert animation should be short and meaningful
- Repeated noise should not cause constant violent motion

## 6. Shape Language

- Idle: smooth circle
- Attention: larger rounded blob
- Alert: spiky speech-bubble silhouette
- Voice-like: add a tiny human pixel icon
- Object-like: add a tiny object / warning pixel icon

## 7. Do's and Don'ts

### Do

- Keep the UI readable from peripheral vision
- Let state changes be obvious through both color and silhouette
- Make the app feel lightweight and trustworthy

### Don't

- Do not turn it into a waveform monitor
- Do not cover meaningful screen content
- Do not rely on direction arrows in the MVP
- Do not use loud visual clutter while idle
