from django.http import JsonResponse
from django.shortcuts import render

def home(request):
    return render(request, "index.html")

def health(request):
    return JsonResponse({"status": "ok", "service": "invisibility-cloak"})
