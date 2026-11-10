FROM python:3.12-slim AS build
WORKDIR /src
COPY pyproject.toml ./
COPY app ./app
RUN pip install --no-cache-dir --prefix=/install .

FROM python:3.12-slim
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg && rm -rf /var/lib/apt/lists/* \
 && useradd -r -u 10001 app
COPY --from=build /install /usr/local
WORKDIR /app
COPY app ./app
COPY alembic.ini ./
RUN mkdir -p /app/var/storage && chown -R app:app /app/var
ENV STORAGE_DIR=/app/var/storage
USER app
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
