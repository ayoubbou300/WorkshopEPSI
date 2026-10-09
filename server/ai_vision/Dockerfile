FROM python:3.11-slim

WORKDIR /app

# Dépendances système nécessaires pour OpenCV et l'accès webcam
RUN apt-get update && apt-get install -y \
    libgl1 \
    libglib2.0-0 \
    libsm6 \
    libxrender1 \
    libxext6 \
    libv4l-dev \
    v4l-utils \
    && rm -rf /var/lib/apt/lists/*

# Copie et installation des dépendances Python
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copie du script et du modèle IA
COPY vision.py .
COPY yolov8n.pt .

CMD ["python", "vision.py"]
