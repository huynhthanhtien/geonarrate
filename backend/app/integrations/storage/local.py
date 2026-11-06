from pathlib import Path


class LocalStorage:
    """Kho file trên đĩa; khoá là đường dẫn tương đối, không được thoát khỏi thư mục gốc."""

    def __init__(self, root: str) -> None:
        self._root = Path(root).resolve()

    def path(self, key: str) -> Path:
        p = (self._root / key).resolve()
        if not p.is_relative_to(self._root):
            raise ValueError("Khoá file không hợp lệ")
        return p

    def put(self, key: str, data: bytes) -> None:
        p = self.path(key)
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_bytes(data)

    def read(self, key: str) -> bytes:
        return self.path(key).read_bytes()

    def exists(self, key: str) -> bool:
        return self.path(key).is_file()
