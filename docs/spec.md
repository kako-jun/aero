# aero MVP Spec

## Goal

Help the user notice when the surrounding sound suddenly becomes stronger while they are focused on another task.

## Non-Goals

- Full speech recognition
- Speaker identification
- Accurate direction detection
- Cloud transcription

## MVP Behavior

1. Continuously observe local microphone input
2. Estimate a recent baseline level
3. Detect sudden rises relative to that baseline
4. Reflect the current state in a bottom-right overlay
5. Stay quiet and small when nothing unusual is happening

## States

### Idle
- Small green circle
- Minimal motion

### Attention
- Yellow
- Slightly larger
- Triggered by noticeable rise above baseline

### Alert
- Red
- Spiky speech-bubble silhouette
- Triggered by sharp or strong increase

## Optional Phase 2

- Classify events as `voice-like` or `object-like`
- Show a small pixel icon next to the bubble

## Platform

- Windows first
- Tauri first
- Android later, likely separate implementation
