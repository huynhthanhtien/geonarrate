"""Schema PostgreSQL phạm vi v1 (13 bảng nghiệp vụ + 2 bảng nối) — nguồn để Alembic đối chiếu.

Đổi file này thì phải thêm migration: `alembic revision --autogenerate -m "..."`.
"""

from geoalchemy2 import Geography
from sqlalchemy import (
    ARRAY,
    BigInteger,
    Boolean,
    CheckConstraint,
    Column,
    DateTime,
    Double,
    ForeignKey,
    Index,
    Integer,
    MetaData,
    PrimaryKeyConstraint,
    Table,
    Text,
    UniqueConstraint,
    Uuid,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB

metadata = MetaData(
    naming_convention={
        "ix": "ix_%(column_0_label)s",
        "uq": "uq_%(table_name)s_%(column_0_name)s",
        "ck": "ck_%(table_name)s_%(constraint_name)s",
        "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
        "pk": "pk_%(table_name)s",
    }
)


def _id() -> Column[object]:
    return Column("id", Uuid, primary_key=True, server_default=func.gen_random_uuid())


def _timestamps() -> tuple[Column[object], Column[object]]:
    return (
        Column("created_at", DateTime(timezone=True), nullable=False, server_default=func.now()),
        Column("updated_at", DateTime(timezone=True), nullable=False, server_default=func.now()),
    )


def _user_fk(name: str, ondelete: str = "SET NULL", nullable: bool = True) -> Column[object]:
    return Column(name, Uuid, ForeignKey("users.id", ondelete=ondelete), nullable=nullable)


def _lang_fk(name: str) -> Column[object]:
    return Column(name, Text, ForeignKey("languages.code"), nullable=False)


languages = Table(
    "languages",
    metadata,
    Column("code", Text, primary_key=True),
    Column("bcp47", Text, nullable=False),
    Column("native_name", Text, nullable=False),
    Column("is_source", Boolean, nullable=False, server_default=text("false")),
    Column("is_active", Boolean, nullable=False, server_default=text("true")),
    Column("tts_voice", Text),
    Column("tts_rate", Text),
    *_timestamps(),
)

users = Table(
    "users",
    metadata,
    _id(),
    Column("email", Text, nullable=False, unique=True),
    Column("password_hash", Text, nullable=False),
    Column("full_name", Text, nullable=False, server_default=""),
    Column("role", Text, nullable=False),
    Column("is_active", Boolean, nullable=False, server_default=text("true")),
    Column("last_login_at", DateTime(timezone=True)),
    *_timestamps(),
    CheckConstraint("role IN ('admin', 'editor', 'translator')", name="role"),
)

refresh_tokens = Table(
    "refresh_tokens",
    metadata,
    _id(),
    _user_fk("user_id", ondelete="CASCADE", nullable=False),
    Column("token_hash", Text, nullable=False, unique=True),
    Column("family_id", Text, nullable=False),
    Column("expires_at", DateTime(timezone=True), nullable=False),
    Column("revoked_at", DateTime(timezone=True)),
    Column("created_at", DateTime(timezone=True), nullable=False, server_default=func.now()),
    Index("ix_refresh_tokens_user_id", "user_id"),
    Index("ix_refresh_tokens_family_id", "family_id"),
    Index("ix_refresh_tokens_expires_at", "expires_at"),  # MaintenanceService xoá token hết hạn
)

audit_logs = Table(
    "audit_logs",
    metadata,
    _id(),
    _user_fk("actor_id", ondelete="RESTRICT", nullable=False),
    Column("action", Text, nullable=False),
    Column("resource_type", Text, nullable=False),
    Column("resource_id", Text, nullable=False),
    Column("note", Text),
    Column("ts", DateTime(timezone=True), nullable=False),
    Index("ix_audit_logs_resource_ts", "resource_type", "resource_id", text("ts DESC")),
    Index("ix_audit_logs_actor_ts", "actor_id", text("ts DESC")),
    Index("ix_audit_logs_ts", text("ts DESC")),
)

attractions = Table(
    "attractions",
    metadata,
    _id(),
    Column("slug", Text, nullable=False, unique=True),
    Column("title", Text, nullable=False),
    Column("summary", Text),
    Column("category", Text, nullable=False),
    Column("geo", Geography("POINT", srid=4326, spatial_index=False), nullable=False),
    Column("trigger_radius_m", Integer, nullable=False),
    Column("priority", Integer, nullable=False, server_default=text("0")),
    Column("images", JSONB, nullable=False, server_default=text("'[]'::jsonb")),
    # {version, body, status, review_note, reviewed_by, reviewed_at}
    Column("script", JSONB),
    Column("status", Text, nullable=False),
    Column("published_at", DateTime(timezone=True)),
    _user_fk("created_by"),
    _user_fk("updated_by"),
    *_timestamps(),
    Index("ix_attractions_geo", "geo", postgresql_using="gist"),
    Index("ix_attractions_status_updated_at", "status", text("updated_at DESC")),
    Index("ix_attractions_script_status", text("(script ->> 'status')")),
)

tours = Table(
    "tours",
    metadata,
    _id(),
    Column("slug", Text, nullable=False, unique=True),
    Column("name", Text, nullable=False),
    Column("bbox", ARRAY(Double)),
    Column("status", Text, nullable=False),
    Column("access", Text, nullable=False),  # free | paid: tour paid cần vé để tải pack
    _user_fk("updated_by"),
    *_timestamps(),
    CheckConstraint("access IN ('free', 'paid')", name="access"),
)

# Thay cho tours.attraction_ids + preview_attraction_ids; position giữ thứ tự điểm trong tour
tour_attractions = Table(
    "tour_attractions",
    metadata,
    Column("tour_id", Uuid, ForeignKey("tours.id", ondelete="CASCADE"), nullable=False),
    Column("attraction_id", Uuid, ForeignKey("attractions.id", ondelete="CASCADE"), nullable=False),
    Column("position", Integer, nullable=False),
    Column("is_preview", Boolean, nullable=False, server_default=text("false")),
    PrimaryKeyConstraint("tour_id", "attraction_id"),
    Index("ix_tour_attractions_attraction_id", "attraction_id"),
)

glossaries = Table(
    "glossaries",
    metadata,
    _id(),
    Column("term", Text, nullable=False),
    _lang_fk("target_lang"),
    Column("translation", Text, nullable=False),
    Column("is_required", Boolean, nullable=False, server_default=text("false")),
    # NULL = áp dụng toàn hệ thống
    Column("attraction_id", Uuid, ForeignKey("attractions.id", ondelete="CASCADE")),
    _user_fk("created_by"),
    *_timestamps(),
    # NULLS NOT DISTINCT: thuật ngữ toàn hệ thống (attraction_id NULL) cũng không được trùng
    UniqueConstraint(
        "term",
        "target_lang",
        "attraction_id",
        name="uq_glossaries_term_lang_attraction",
        postgresql_nulls_not_distinct=True,
    ),
    Index("ix_glossaries_target_lang", "target_lang"),
)

translations = Table(
    "translations",
    metadata,
    _id(),
    Column(
        "attraction_id",
        Uuid,
        ForeignKey("attractions.id", ondelete="CASCADE"),
        nullable=False,
    ),
    _lang_fk("target_lang"),
    Column("version", Integer, nullable=False),
    Column("text", Text, nullable=False),
    Column("provider", Text),
    Column("qa_flags", ARRAY(Text), nullable=False, server_default=text("'{}'::text[]")),
    Column("review_status", Text, nullable=False),
    Column("review_note", Text),
    _user_fk("reviewed_by"),
    Column("reviewed_at", DateTime(timezone=True)),
    Column("text_hash", Text),
    *_timestamps(),
    UniqueConstraint("attraction_id", "target_lang", name="uq_translations_attraction_lang"),
    Index("ix_translations_lang_review_status", "target_lang", "review_status"),
)

audio_assets = Table(
    "audio_assets",
    metadata,
    _id(),
    Column(
        "attraction_id",
        Uuid,
        ForeignKey("attractions.id", ondelete="CASCADE"),
        nullable=False,
    ),
    _lang_fk("lang"),
    Column("text_hash", Text, nullable=False),
    Column("voice", Text, nullable=False),
    Column("storage_key", Text, nullable=False),
    Column("bytes", BigInteger),
    Column("duration_ms", Integer),
    Column("sha256", Text, nullable=False),
    Column("status", Text, nullable=False),
    *_timestamps(),
    # build lại không sinh bản ghi trùng
    UniqueConstraint("attraction_id", "lang", "text_hash", name="uq_audio_assets_attraction_lang"),
    Index("ix_audio_assets_text_hash", "text_hash"),
)

audio_packs = Table(
    "audio_packs",
    metadata,
    _id(),
    Column("tour_id", Uuid, ForeignKey("tours.id", ondelete="CASCADE"), nullable=False),
    _lang_fk("lang"),
    Column("version", Integer, nullable=False),
    Column("status", Text, nullable=False),
    Column("archive_key", Text),
    Column("manifest_key", Text),
    Column("sha256", Text),
    Column("total_bytes", BigInteger),
    Column("file_count", Integer),
    _user_fk("published_by"),
    Column("published_at", DateTime(timezone=True)),
    *_timestamps(),
    UniqueConstraint("tour_id", "lang", "version", name="uq_audio_packs_tour_lang_version"),
    Index("ix_audio_packs_tour_lang_status", "tour_id", "lang", "status"),
    # Mỗi tour × ngôn ngữ chỉ có một version đang phát hành
    Index(
        "uq_audio_packs_published",
        "tour_id",
        "lang",
        unique=True,
        postgresql_where=text("status = 'published'"),
    ),
)

jobs = Table(
    "jobs",
    metadata,
    _id(),
    Column("type", Text, nullable=False),
    Column("payload", JSONB),
    Column("dedupe_key", Text, nullable=False),
    Column("status", Text, nullable=False),
    Column("progress", JSONB),
    Column("attempts", Integer, nullable=False, server_default=text("0")),
    Column("error", JSONB),
    _user_fk("created_by"),
    *_timestamps(),
    Index(
        "uq_jobs_active_dedupe_key",
        "dedupe_key",
        unique=True,
        postgresql_where=text("status IN ('queued', 'running')"),
    ),
    Index("ix_jobs_status_created_at", "status", text("created_at DESC")),
)

tickets = Table(
    "tickets",
    metadata,
    _id(),
    Column("code_hash", Text, nullable=False, unique=True),  # SHA-256 của mã trong QR
    Column("code_hint", Text, nullable=False),
    Column("batch", Text, nullable=False),
    Column("valid_until", DateTime(timezone=True), nullable=False),
    Column("device_id", Text),  # 1 vé = 1 máy; NULL = chưa quét
    Column("activated_at", DateTime(timezone=True)),
    Column("transfers_left", Integer, nullable=False),
    Column("status", Text, nullable=False),
    _user_fk("created_by", ondelete="RESTRICT", nullable=False),
    *_timestamps(),
    Index("ix_tickets_device_id", "device_id"),
    Index("ix_tickets_batch", "batch"),
)

# Thay cho tickets.tour_ids (tour lẻ hoặc combo)
ticket_tours = Table(
    "ticket_tours",
    metadata,
    Column("ticket_id", Uuid, ForeignKey("tickets.id", ondelete="CASCADE"), nullable=False),
    Column("tour_id", Uuid, ForeignKey("tours.id", ondelete="CASCADE"), nullable=False),
    PrimaryKeyConstraint("ticket_id", "tour_id"),
    Index("ix_ticket_tours_tour_id", "tour_id"),
)

playback_events = Table(
    "playback_events",
    metadata,
    _id(),
    Column("device_id", Text, nullable=False),
    Column("event_id", Text, nullable=False),
    Column(
        "attraction_id",
        Uuid,
        ForeignKey("attractions.id", ondelete="CASCADE"),
        nullable=False,
    ),
    _lang_fk("lang"),
    Column("event", Text, nullable=False),
    Column("position_ms", Integer),
    Column("trigger", Text),
    Column("ts", DateTime(timezone=True), nullable=False),
    UniqueConstraint("device_id", "event_id", name="uq_playback_events_device_event"),
    Index("ix_playback_events_attraction_ts", "attraction_id", text("ts DESC")),
    Index("ix_playback_events_ts", "ts"),  # MaintenanceService xoá sự kiện quá hạn
)
