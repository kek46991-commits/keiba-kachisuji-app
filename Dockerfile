FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt /app/requirements.txt
COPY requirements-ml.txt /app/requirements-ml.txt
COPY web/requirements.txt /app/web/requirements.txt

RUN pip install --no-cache-dir --upgrade pip \
    && pip install --no-cache-dir -r /app/requirements-ml.txt -r /app/requirements.txt

COPY . /app

ENV PORT=8000

CMD ["sh", "-c", "uvicorn web.server:app --host 0.0.0.0 --port ${PORT:-8000}"]
