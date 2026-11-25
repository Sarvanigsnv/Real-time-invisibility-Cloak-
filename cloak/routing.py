from django.urls import path
from .consumers import CloakConsumer

websocket_urlpatterns = [
    path("ws/cloak/", CloakConsumer.as_asgi()),
]
