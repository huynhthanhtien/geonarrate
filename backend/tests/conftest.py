import os

# Test không chạm DB dev: dùng DB riêng (CI đã đặt MONGO_DB thì giữ nguyên)
os.environ.setdefault("MONGO_DB", "geonarrate_test")
os.environ["APP_ENV"] = "dev"
os.environ["DEV_ADMIN_EMAIL"] = "admin@geonarrate.test"
os.environ["DEV_ADMIN_PASSWORD"] = "admin-test-password"
