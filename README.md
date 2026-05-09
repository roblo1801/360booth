# 360booth

Touchpix-style photo + video booth web app with a full-feature dashboard.

## Included features
- Event dashboard (name, host, location, date) with save/load/clear persistence
- Capture studio with device profiles, countdown, burst capture, retake
- Modes: Photo, AI Photo, Boomerang, Video, Slow Motion, GIF
- AI-style and background mode selectors, effects, templates, overlay text
- Branding controls (brand title + theme color)
- Sharing center for QR, Email, SMS, WhatsApp, Download
- Offline queueing + online flush workflow for delayed sharing
- Cloud upload actions (Google Drive / Dropbox)
- Print strip counter and live display mode
- Gallery filtering, gallery export, and clear session controls
- Local persistence for queue/gallery/event state
- Multi-device-style sync between browser tabs via BroadcastChannel

## Run locally
No build step required.

```bash
cd /home/runner/work/360booth/360booth
python3 -m http.server 4173
```

Open `http://127.0.0.1:4173`.
