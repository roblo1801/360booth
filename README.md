# 360booth

Touchpix-style photo + video booth web app.

## Features
- Multi-device capture source profiles (iPhone/iPad, Android, GoPro, DSLR/Mirrorless)
- Capture modes: Photo, AI Photo, Boomerang, Video, Slow Motion, GIF
- Branding controls: brand title, overlays, theme color, effects
- Sharing controls: QR, Email, SMS, WhatsApp, Download
- Offline share queue and later flush
- Cloud upload actions for Google Drive / Dropbox
- Live display toggle and print action
- Session gallery and activity log

## Run locally
No build step required.

```bash
cd /home/runner/work/360booth/360booth
python3 -m http.server 4173
```

Then open `http://localhost:4173`.
