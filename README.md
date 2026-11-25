# Real-Time Invisibility Cloak

A browser-based computer vision project that creates an invisibility cloak effect using Python, Django, OpenCV, and MediaPipe. It uses webcam input and hand gestures to control the effect in real time.

**Live Demo:** https://invisibility-cloak-django.onrender.com

## Features

- Real-time webcam access through the browser.
- Capture and use a clean background.
- Register a custom hand gesture.
- Toggle the invisibility effect using the registered gesture.
- Reset the camera session.
- Person segmentation using MediaPipe.
- Background replacement using OpenCV and NumPy.
- Django backend with WebSocket communication using Django Channels.

## Tech Stack

- **Backend:** Python, Django, Django Channels
- **Computer Vision:** OpenCV, MediaPipe, NumPy
- **Frontend:** HTML, CSS, JavaScript
- **Deployment:** Render

## Run Locally

```bash
python -m venv venv
source venv/Scripts/activate
pip install -r requirements.txt
python manage.py runserver
```

For Windows PowerShell, activate the environment using:

```powershell
.\venv\Scripts\Activate.ps1
```

Open http://127.0.0.1:8000/ in your browser and allow camera access.

## How It Works

1. Connect the webcam and capture the background.
2. Register a custom hand gesture.
3. Use the registered gesture to activate or deactivate the invisibility effect.
4. MediaPipe identifies the person and hand gesture.
5. OpenCV processes the frames and replaces the background.
6. The processed video is streamed back to the browser through WebSockets.

## Deployment

## Deploy to Render

1. Push the contents of this folder to a GitHub repository (the `manage.py` file must be at the repository root).
2. In Render, choose **New → Blueprint** and connect the repository. Render reads `render.yaml`.
3. Wait for the build and deploy to finish.
4. Open the generated `https://...onrender.com` URL and allow camera permission.
The application is deployed on Render using Django Channels and Daphne.

**Live Application:** https://invisibility-cloak-django.onrender.com

**GitHub Repository:** https://github.com/Sarvanigsnv/Real-time-invisibility-Cloak-


