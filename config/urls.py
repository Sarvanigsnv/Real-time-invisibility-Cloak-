from django.urls import include, path

urlpatterns = [
    path("", include("cloak.urls")),
]
