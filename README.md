"# README

## Automated KYC System
This repository contains a Django‑based backend with a React + Vite front‑end. It uses PostgreSQL, Celery (Redis broker), OpenCV & Tesseract for OCR, and implements a multi‑phase KYC workflow.

### Quick Start
```
# Build the containers
make build

# Run migrations
make migrate

# Start services
docker compose up -d
```

For local development you can run the Django dev server directly:
```bash
python manage.py runserver
```
And start the Vite front‑end in another terminal:
```bash
cd frontend && npm install && npm run dev
```

---

*This repo was scaffolded by Claude Code.*