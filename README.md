# Real-Time Invisibility Cloak — Django Edition

A browser-based computer-vision demo. The visitor grants webcam permission; JavaScript sends compressed frames to a Django Channels WebSocket; Python processes each frame with OpenCV and MediaPipe and streams the result back.

## Features

- Browser webcam access (no server-side `cv2.VideoCapture(0)`)
- Capture a clean background
- Register a custom hand gesture
- Toggle the cloak with the registered gesture
- Manual toggle and reset controls
- MediaPipe selfie segmentation and feathered background replacement
- Django HTTP app + Django Channels WebSocket endpoint

## Requirements

- Python 3.11
- A webcam
- Modern browser with camera permission
- Internet connection for the hosted demo

## Run locally (Windows PowerShell)

```powershell
py -3.11 -m venv .venv
.\\.venv\\Scripts\\Activate.ps1
python -m pip install --upgrade pip
pip install -r requirements.txt
python manage.py runserver
```

Open http://127.0.0.1:8000 and allow camera access. `localhost` is permitted for webcam access without HTTPS.

## Use the demo

1. Click **Connect camera** and allow browser camera permission.
2. Step out of the camera view and click **Capture background**. Keep the camera fixed afterwards.
3. Show one hand and hold the gesture you want to use. Click **Register hand gesture**.
4. Step into the scene. Repeat the registered gesture to toggle the cloak.
5. The **Toggle invisibility** button is also available as a manual fallback.
6. Click **Reset session** to start again.

The background is captured per WebSocket session and is held in memory. It is not saved to disk.

## Deploy to Render

1. Push the contents of this folder to a GitHub repository (the `manage.py` file must be at the repository root).
2. In Render, choose **New → Blueprint** and connect the repository. Render reads `render.yaml`.
3. Wait for the build and deploy to finish.
4. Open the generated `https://...onrender.com` URL and allow camera permission.

You can alternatively create a Web Service manually:
- Runtime: Python
- Build: `pip install -r requirements.txt && python manage.py collectstatic --noinput`
- Start: `daphne -b 0.0.0.0 -p $PORT config.asgi:application`

## Deployment notes and limitations

- Render's HTTPS URL is required for webcam access on non-localhost origins. The browser-to-server WebSocket automatically uses `wss://` on HTTPS.
- This is a portfolio/demo application, not a production multi-user video service. MediaPipe inference runs on the Render instance. Free instances may be CPU-limited, sleep when idle, or struggle with multiple simultaneous visitors.
- The Channels in-memory layer is sufficient for this single-process demo. For multi-instance scaling, configure Redis and use `channels_redis`.
- The demo processes webcam frames on the server. Tell visitors this clearly and obtain their camera permission. Frames are processed in memory and are not intentionally stored.
- Keep the camera stationary after background capture. The effect is a segmentation-based background replacement, not physical invisibility.
- If Render cannot install a dependency or runs out of memory, use a paid instance with more RAM/CPU or host the inference service separately.

## Architecture

```text
Browser webcam
   │ compressed JPEG frames over WebSocket
   ▼
Django Channels consumer
   │
   ▼
cloak/vision.py
   ├── MediaPipe Hands: gesture features
   ├── MediaPipe Selfie Segmentation: person mask
   └── OpenCV + NumPy: background compositing
   │
   ▼
Processed JPEG frames over WebSocket
   │
   ▼
Browser preview
```

## Project structure

```text
config/             Django settings, URL and ASGI routing
cloak/              Views, Channels consumer and vision pipeline
templates/          Browser UI
static/css/         Styles
static/js/          Webcam and WebSocket client
render.yaml         Render Blueprint
requirements.txt    Python dependencies
```
https://github.com/Sarvanigsnv/Real-time-invisibility-Cloak-.git