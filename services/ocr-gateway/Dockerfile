FROM python:3.11-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /app
RUN useradd -r -u 10001 appuser
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY app.py security.py ./
USER appuser
EXPOSE 8080
CMD ["uvicorn","app:app","--host","0.0.0.0","--port","8080","--proxy-headers","--forwarded-allow-ips=*"]
