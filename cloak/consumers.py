import asyncio
import json
import logging

from channels.generic.websocket import AsyncWebsocketConsumer
from asgiref.sync import sync_to_async

from .vision import InvisibilityVision

logger = logging.getLogger(__name__)


class CloakConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        self.vision = InvisibilityVision()
        self.pending_command = None
        await self.accept()
        await self.send_json({
            "type": "ready",
            "message": "Connected. Allow camera access to begin.",
            "cloak_active": False,
            "background_ready": False,
            "gesture_ready": False,
        })

    async def disconnect(self, close_code):
        if hasattr(self, "vision"):
            await sync_to_async(self.vision.close, thread_sensitive=True)()

    async def receive(self, text_data=None, bytes_data=None):
        if not text_data:
            return
        try:
            payload = json.loads(text_data)
            if payload.get("type") == "command":
                command = payload.get("command")
                allowed = {"capture_background", "train_gesture", "toggle", "reset"}
                if command not in allowed:
                    await self.send_json({"type": "error", "message": "Unknown command."})
                    return
                self.pending_command = command
                await self.send_json({
                    "type": "notice",
                    "message": "Command received. Processing the next camera frame...",
                })
                return

            if payload.get("type") != "frame":
                return

            data_url = payload.get("data")
            if not data_url:
                return

            command = self.pending_command
            self.pending_command = None
            processed, state = await sync_to_async(
                self.vision.process, thread_sensitive=True
            )(data_url, command)

            await self.send_json({
                "type": "frame",
                "image": processed,
                **state,
            })
        except Exception as exc:
            logger.exception("WebSocket frame processing failed")
            await self.send_json({
                "type": "error",
                "message": "Frame processing failed. Check camera access and reconnect.",
            })

    async def send_json(self, content):
        await self.send(text_data=json.dumps(content))
