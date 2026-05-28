# Dockerfile for the dating game AgentCore runtime
FROM python:3.12-slim

# Set working directory
WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    libc6-dev \
    portaudio19-dev \
    && rm -rf /var/lib/apt/lists/*

# 1. Install Dependencies (Slowest, but cached if requirements.txt doesn't change)
COPY backend/requirements.txt ./backend/
RUN pip install --no-cache-dir -r backend/requirements.txt

# 2. Copy Backend Application Logic (Cached unless backend code changes)
COPY backend/ ./backend/

# 3. Copy Static Web Assets (Fastest, only this layer rebuilds if web files update)
COPY frontend/ ./frontend/

# Set environment variables
ENV PYTHONUNBUFFERED=1
ENV PYTHONDONTWRITEBYTECODE=1

# Expose microservice port
EXPOSE 8080

# Run the dating game agent from the backend directory
CMD ["python", "backend/dating_voice_agent.py"]
