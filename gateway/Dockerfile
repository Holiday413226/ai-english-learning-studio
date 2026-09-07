FROM python:3.11-slim

WORKDIR /app

# The gateway reuses the AI engines in ../backend, so copy both.
COPY gateway/requirements.txt ./gateway/requirements.txt
RUN pip install --no-cache-dir -r gateway/requirements.txt

COPY gateway/ ./gateway/
COPY backend/ ./backend/

WORKDIR /app/gateway
EXPOSE 9000

CMD ["python", "gateway_server.py"]
