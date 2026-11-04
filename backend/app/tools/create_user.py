"""Tạo tài khoản CMS từ dòng lệnh — dùng tạm tới khi có trang quản lý tài khoản (S-11).

    python -m app.tools.create_user editor@geonarrate.test editor --name "Biên tập viên"

Không truyền `--password` thì nhập mật khẩu ẩn từ bàn phím.
"""

import argparse
import asyncio
import getpass
import sys

from app.core import database
from app.core.deps import get_auth_service
from app.core.exceptions import DomainError
from app.models.user import Role


async def main() -> int:
    parser = argparse.ArgumentParser(description="Tạo tài khoản CMS")
    parser.add_argument("email")
    parser.add_argument("role", choices=[r.value for r in Role])
    parser.add_argument("--name", default="")
    parser.add_argument("--password")
    args = parser.parse_args()
    password = args.password or getpass.getpass("Mật khẩu: ")

    await database.connect()
    try:
        user = await get_auth_service().create_user(
            args.email, password, Role(args.role), args.name
        )
    except DomainError as e:
        print(e.detail, file=sys.stderr)
        return 1
    finally:
        await database.disconnect()
    print(f"Đã tạo {user.email} ({user.role.value})")
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
