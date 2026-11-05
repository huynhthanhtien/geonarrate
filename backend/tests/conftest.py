import os

# Test không chạm DB dev: dùng DB riêng (CI đã đặt DATABASE_URL thì giữ nguyên)
os.environ.setdefault(
    "DATABASE_URL", "postgresql+asyncpg://geonarrate:geonarrate@localhost:5432/geonarrate_test"
)
os.environ["APP_ENV"] = "dev"
os.environ["DEV_ADMIN_EMAIL"] = "admin@geonarrate.test"
os.environ["DEV_ADMIN_PASSWORD"] = "admin-test-password"
