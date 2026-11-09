from pathlib import Path
from tempfile import NamedTemporaryFile


def atomic_write(path: Path, data: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with NamedTemporaryFile(dir=path.parent, delete=False) as temporary:
        temporary_path = Path(temporary.name)
        try:
            temporary.write(data)
            temporary.flush()
            temporary_path.replace(path)
        finally:
            temporary_path.unlink(missing_ok=True)


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
        atomic_write(p, data)

    def read(self, key: str) -> bytes:
        return self.path(key).read_bytes()

    def exists(self, key: str) -> bool:
        return self.path(key).is_file()
