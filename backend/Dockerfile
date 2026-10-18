# Dockerfile for backend (Gunicorn + Nginx)
FROM python:3.12-slim AS builder
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .

FROM python:3.12-slim AS runtime
WORKDIR /app
COPY --from=builder /app /app
ENV PYTHONUNBUFFERED 1
EXPOSE 8000
CMD gunicorn backend.kyc_system.wsgi:application --bind 0.0.0.0:8000
