# aero

**A small ambient-sound indicator for deaf and hard-of-hearing users**

`aero` is a desktop-first accessibility app that helps users notice when the surrounding sound level suddenly rises while they are reading, writing, or focused on another app.

It is not a subtitle app and it does not compete with cloud speech recognition. Its first job is simpler:

- notice that something changed around you
- show that change with a small visual indicator
- stay out of the way during normal work

## MVP

- **Desktop-first overlay** — A small always-on-top indicator that stays near the bottom-right corner.
- **Ambient change detection** — React to sudden changes relative to the recent baseline, not just absolute volume.
- **Calm-to-urgent state** — Green → yellow → red, then a spiky speech-bubble shape for stronger events.
- **Optional rough classification** — Human voice-like vs object-like, shown with a tiny pixel-art icon.
- **No cloud dependency** — Local-first design. Audio is not meant to be stored or uploaded.

## Platform Direction

- **Primary target:** Windows
- **App shell:** Tauri
- **Future:** Android as a separate implementation if overlay behavior is needed there

## For Users

`aero` is intended for moments like:

- someone speaks from outside your field of view
- the room suddenly gets louder
- something unusual happens nearby while you are focused on a screen

The app should remain small, readable, and non-intrusive until something changes.

## Development

```bash
# Frontend
cd frontend
npm install
npm run dev

# Tauri desktop shell
npm run tauri:dev
```

See [README.ja.md](./README.ja.md), [CLAUDE.md](./CLAUDE.md), and [docs/spec.md](./docs/spec.md) for project details.

## License

MIT
