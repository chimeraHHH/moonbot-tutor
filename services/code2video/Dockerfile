# code2video (Deep Solve) — FastAPI Manim pipeline.
# Based on the manim community image so manim + LaTeX + ffmpeg + Cairo/Pango
# are already present (avoids a ~5GB texlive build). We only add the app extras.
FROM manimcommunity/manim:latest

# The base image runs as a non-root user; switch to root for package installs.
USER root

# sox + libsndfile are needed by manim-voiceover / pydub for audio handling.
RUN apt-get update \
    && apt-get install -y --no-install-recommends sox libsndfile1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY app-requirements.txt .
RUN pip install --no-cache-dir -r app-requirements.txt

# Preserve the expected layout: run from src/, with prompts/assets/json_files
# as siblings (PROJECT_ROOT = parent of src = /app).
COPY src/ ./src/
COPY prompts/ ./prompts/
COPY assets/ ./assets/
COPY json_files/ ./json_files/

WORKDIR /app/src
ENV PORT=8010 \
    PYTHONPATH=/app:/app/src

EXPOSE 8010
CMD ["python", "deep_solve_bridge.py"]
