"""initial schema

Revision ID: 0001
Revises:
"""

import geoalchemy2
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS postgis")
    op.create_table(
        "languages",
        sa.Column("code", sa.Text(), nullable=False),
        sa.Column("bcp47", sa.Text(), nullable=False),
        sa.Column("native_name", sa.Text(), nullable=False),
        sa.Column("is_source", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("is_active", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column("tts_voice", sa.Text(), nullable=True),
        sa.Column("tts_rate", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("code", name=op.f("pk_languages")),
    )
    op.create_table(
        "users",
        sa.Column("id", sa.Uuid(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("email", sa.Text(), nullable=False),
        sa.Column("password_hash", sa.Text(), nullable=False),
        sa.Column("full_name", sa.Text(), server_default="", nullable=False),
        sa.Column("role", sa.Text(), nullable=False),
        sa.Column("is_active", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column("last_login_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint("role IN ('admin', 'editor', 'translator')", name=op.f("ck_users_role")),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_users")),
        sa.UniqueConstraint("email", name=op.f("uq_users_email")),
    )
    op.create_table(
        "attractions",
        sa.Column("id", sa.Uuid(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("slug", sa.Text(), nullable=False),
        sa.Column("title", sa.Text(), nullable=False),
        sa.Column("summary", sa.Text(), nullable=True),
        sa.Column("category", sa.Text(), nullable=False),
        sa.Column(
            "geo",
            geoalchemy2.types.Geography(
                geometry_type="POINT",
                srid=4326,
                dimension=2,
                spatial_index=False,
                from_text="ST_GeogFromText",
                name="geography",
                nullable=False,
            ),
            nullable=False,
        ),
        sa.Column("trigger_radius_m", sa.Integer(), nullable=False),
        sa.Column("priority", sa.Integer(), server_default=sa.text("0"), nullable=False),
        sa.Column(
            "images",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default=sa.text("'[]'::jsonb"),
            nullable=False,
        ),
        sa.Column("script", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("status", sa.Text(), nullable=False),
        sa.Column("published_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_by", sa.Uuid(), nullable=True),
        sa.Column("updated_by", sa.Uuid(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["created_by"],
            ["users.id"],
            name=op.f("fk_attractions_created_by_users"),
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["updated_by"],
            ["users.id"],
            name=op.f("fk_attractions_updated_by_users"),
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_attractions")),
        sa.UniqueConstraint("slug", name=op.f("uq_attractions_slug")),
    )
    op.create_index(
        "ix_attractions_geo", "attractions", ["geo"], unique=False, postgresql_using="gist"
    )
    op.create_index(
        "ix_attractions_script_status",
        "attractions",
        [sa.literal_column("(script ->> 'status')")],
        unique=False,
    )
    op.create_index(
        "ix_attractions_status_updated_at",
        "attractions",
        ["status", sa.literal_column("updated_at DESC")],
        unique=False,
    )
    op.create_table(
        "audit_logs",
        sa.Column("id", sa.Uuid(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("actor_id", sa.Uuid(), nullable=False),
        sa.Column("action", sa.Text(), nullable=False),
        sa.Column("resource_type", sa.Text(), nullable=False),
        sa.Column("resource_id", sa.Text(), nullable=False),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("ts", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["actor_id"],
            ["users.id"],
            name=op.f("fk_audit_logs_actor_id_users"),
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_audit_logs")),
    )
    op.create_index(
        "ix_audit_logs_actor_ts",
        "audit_logs",
        ["actor_id", sa.literal_column("ts DESC")],
        unique=False,
    )
    op.create_index(
        "ix_audit_logs_resource_ts",
        "audit_logs",
        ["resource_type", "resource_id", sa.literal_column("ts DESC")],
        unique=False,
    )
    op.create_index("ix_audit_logs_ts", "audit_logs", [sa.literal_column("ts DESC")], unique=False)
    op.create_table(
        "jobs",
        sa.Column("id", sa.Uuid(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("type", sa.Text(), nullable=False),
        sa.Column("payload", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("dedupe_key", sa.Text(), nullable=False),
        sa.Column("status", sa.Text(), nullable=False),
        sa.Column("progress", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("attempts", sa.Integer(), server_default=sa.text("0"), nullable=False),
        sa.Column("error", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("created_by", sa.Uuid(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["created_by"], ["users.id"], name=op.f("fk_jobs_created_by_users"), ondelete="SET NULL"
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_jobs")),
    )
    op.create_index(
        "ix_jobs_status_created_at",
        "jobs",
        ["status", sa.literal_column("created_at DESC")],
        unique=False,
    )
    op.create_index(
        "uq_jobs_active_dedupe_key",
        "jobs",
        ["dedupe_key"],
        unique=True,
        postgresql_where=sa.text("status IN ('queued', 'running')"),
    )
    op.create_table(
        "refresh_tokens",
        sa.Column("id", sa.Uuid(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("token_hash", sa.Text(), nullable=False),
        sa.Column("family_id", sa.Text(), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name=op.f("fk_refresh_tokens_user_id_users"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_refresh_tokens")),
        sa.UniqueConstraint("token_hash", name=op.f("uq_refresh_tokens_token_hash")),
    )
    op.create_index("ix_refresh_tokens_expires_at", "refresh_tokens", ["expires_at"], unique=False)
    op.create_index("ix_refresh_tokens_family_id", "refresh_tokens", ["family_id"], unique=False)
    op.create_index("ix_refresh_tokens_user_id", "refresh_tokens", ["user_id"], unique=False)
    op.create_table(
        "tickets",
        sa.Column("id", sa.Uuid(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("code_hash", sa.Text(), nullable=False),
        sa.Column("code_hint", sa.Text(), nullable=False),
        sa.Column("batch", sa.Text(), nullable=False),
        sa.Column("valid_until", sa.DateTime(timezone=True), nullable=False),
        sa.Column("device_id", sa.Text(), nullable=True),
        sa.Column("activated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("transfers_left", sa.Integer(), nullable=False),
        sa.Column("status", sa.Text(), nullable=False),
        sa.Column("created_by", sa.Uuid(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["created_by"],
            ["users.id"],
            name=op.f("fk_tickets_created_by_users"),
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_tickets")),
        sa.UniqueConstraint("code_hash", name=op.f("uq_tickets_code_hash")),
    )
    op.create_index("ix_tickets_batch", "tickets", ["batch"], unique=False)
    op.create_index("ix_tickets_device_id", "tickets", ["device_id"], unique=False)
    op.create_table(
        "tours",
        sa.Column("id", sa.Uuid(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("slug", sa.Text(), nullable=False),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("bbox", sa.ARRAY(sa.Double()), nullable=True),
        sa.Column("status", sa.Text(), nullable=False),
        sa.Column("access", sa.Text(), nullable=False),
        sa.Column("updated_by", sa.Uuid(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint("access IN ('free', 'paid')", name=op.f("ck_tours_access")),
        sa.ForeignKeyConstraint(
            ["updated_by"],
            ["users.id"],
            name=op.f("fk_tours_updated_by_users"),
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_tours")),
        sa.UniqueConstraint("slug", name=op.f("uq_tours_slug")),
    )
    op.create_table(
        "audio_assets",
        sa.Column("id", sa.Uuid(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("attraction_id", sa.Uuid(), nullable=False),
        sa.Column("lang", sa.Text(), nullable=False),
        sa.Column("text_hash", sa.Text(), nullable=False),
        sa.Column("voice", sa.Text(), nullable=False),
        sa.Column("storage_key", sa.Text(), nullable=False),
        sa.Column("bytes", sa.BigInteger(), nullable=True),
        sa.Column("duration_ms", sa.Integer(), nullable=True),
        sa.Column("sha256", sa.Text(), nullable=False),
        sa.Column("status", sa.Text(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["attraction_id"],
            ["attractions.id"],
            name=op.f("fk_audio_assets_attraction_id_attractions"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["lang"], ["languages.code"], name=op.f("fk_audio_assets_lang_languages")
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_audio_assets")),
        sa.UniqueConstraint(
            "attraction_id", "lang", "text_hash", name="uq_audio_assets_attraction_lang"
        ),
    )
    op.create_index("ix_audio_assets_text_hash", "audio_assets", ["text_hash"], unique=False)
    op.create_table(
        "audio_packs",
        sa.Column("id", sa.Uuid(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("tour_id", sa.Uuid(), nullable=False),
        sa.Column("lang", sa.Text(), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("status", sa.Text(), nullable=False),
        sa.Column("archive_key", sa.Text(), nullable=True),
        sa.Column("manifest_key", sa.Text(), nullable=True),
        sa.Column("sha256", sa.Text(), nullable=True),
        sa.Column("total_bytes", sa.BigInteger(), nullable=True),
        sa.Column("file_count", sa.Integer(), nullable=True),
        sa.Column("published_by", sa.Uuid(), nullable=True),
        sa.Column("published_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["lang"], ["languages.code"], name=op.f("fk_audio_packs_lang_languages")
        ),
        sa.ForeignKeyConstraint(
            ["published_by"],
            ["users.id"],
            name=op.f("fk_audio_packs_published_by_users"),
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["tour_id"], ["tours.id"], name=op.f("fk_audio_packs_tour_id_tours"), ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_audio_packs")),
        sa.UniqueConstraint("tour_id", "lang", "version", name="uq_audio_packs_tour_lang_version"),
    )
    op.create_index(
        "ix_audio_packs_tour_lang_status",
        "audio_packs",
        ["tour_id", "lang", "status"],
        unique=False,
    )
    op.create_index(
        "uq_audio_packs_published",
        "audio_packs",
        ["tour_id", "lang"],
        unique=True,
        postgresql_where=sa.text("status = 'published'"),
    )
    op.create_table(
        "glossaries",
        sa.Column("id", sa.Uuid(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("term", sa.Text(), nullable=False),
        sa.Column("target_lang", sa.Text(), nullable=False),
        sa.Column("translation", sa.Text(), nullable=False),
        sa.Column("is_required", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("attraction_id", sa.Uuid(), nullable=True),
        sa.Column("created_by", sa.Uuid(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["attraction_id"],
            ["attractions.id"],
            name=op.f("fk_glossaries_attraction_id_attractions"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["created_by"],
            ["users.id"],
            name=op.f("fk_glossaries_created_by_users"),
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["target_lang"], ["languages.code"], name=op.f("fk_glossaries_target_lang_languages")
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_glossaries")),
        sa.UniqueConstraint(
            "term",
            "target_lang",
            "attraction_id",
            name="uq_glossaries_term_lang_attraction",
            postgresql_nulls_not_distinct=True,
        ),
    )
    op.create_index("ix_glossaries_target_lang", "glossaries", ["target_lang"], unique=False)
    op.create_table(
        "playback_events",
        sa.Column("id", sa.Uuid(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("device_id", sa.Text(), nullable=False),
        sa.Column("event_id", sa.Text(), nullable=False),
        sa.Column("attraction_id", sa.Uuid(), nullable=False),
        sa.Column("lang", sa.Text(), nullable=False),
        sa.Column("event", sa.Text(), nullable=False),
        sa.Column("position_ms", sa.Integer(), nullable=True),
        sa.Column("trigger", sa.Text(), nullable=True),
        sa.Column("ts", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["attraction_id"],
            ["attractions.id"],
            name=op.f("fk_playback_events_attraction_id_attractions"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["lang"], ["languages.code"], name=op.f("fk_playback_events_lang_languages")
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_playback_events")),
        sa.UniqueConstraint("device_id", "event_id", name="uq_playback_events_device_event"),
    )
    op.create_index(
        "ix_playback_events_attraction_ts",
        "playback_events",
        ["attraction_id", sa.literal_column("ts DESC")],
        unique=False,
    )
    op.create_index("ix_playback_events_ts", "playback_events", ["ts"], unique=False)
    op.create_table(
        "ticket_tours",
        sa.Column("ticket_id", sa.Uuid(), nullable=False),
        sa.Column("tour_id", sa.Uuid(), nullable=False),
        sa.ForeignKeyConstraint(
            ["ticket_id"],
            ["tickets.id"],
            name=op.f("fk_ticket_tours_ticket_id_tickets"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["tour_id"],
            ["tours.id"],
            name=op.f("fk_ticket_tours_tour_id_tours"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("ticket_id", "tour_id", name=op.f("pk_ticket_tours")),
    )
    op.create_index("ix_ticket_tours_tour_id", "ticket_tours", ["tour_id"], unique=False)
    op.create_table(
        "tour_attractions",
        sa.Column("tour_id", sa.Uuid(), nullable=False),
        sa.Column("attraction_id", sa.Uuid(), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.Column("is_preview", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.ForeignKeyConstraint(
            ["attraction_id"],
            ["attractions.id"],
            name=op.f("fk_tour_attractions_attraction_id_attractions"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["tour_id"],
            ["tours.id"],
            name=op.f("fk_tour_attractions_tour_id_tours"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("tour_id", "attraction_id", name=op.f("pk_tour_attractions")),
    )
    op.create_index(
        "ix_tour_attractions_attraction_id", "tour_attractions", ["attraction_id"], unique=False
    )
    op.create_table(
        "translations",
        sa.Column("id", sa.Uuid(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("attraction_id", sa.Uuid(), nullable=False),
        sa.Column("target_lang", sa.Text(), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("text", sa.Text(), nullable=False),
        sa.Column("provider", sa.Text(), nullable=True),
        sa.Column(
            "qa_flags", sa.ARRAY(sa.Text()), server_default=sa.text("'{}'::text[]"), nullable=False
        ),
        sa.Column("review_status", sa.Text(), nullable=False),
        sa.Column("review_note", sa.Text(), nullable=True),
        sa.Column("reviewed_by", sa.Uuid(), nullable=True),
        sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("text_hash", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["attraction_id"],
            ["attractions.id"],
            name=op.f("fk_translations_attraction_id_attractions"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["reviewed_by"],
            ["users.id"],
            name=op.f("fk_translations_reviewed_by_users"),
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["target_lang"], ["languages.code"], name=op.f("fk_translations_target_lang_languages")
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_translations")),
        sa.UniqueConstraint("attraction_id", "target_lang", name="uq_translations_attraction_lang"),
    )
    op.create_index(
        "ix_translations_lang_review_status",
        "translations",
        ["target_lang", "review_status"],
        unique=False,
    )


def downgrade() -> None:
    # Giữ extension postgis: có thể đang được dùng ở schema khác, xoá cần quyền superuser
    op.drop_index("ix_translations_lang_review_status", table_name="translations")
    op.drop_table("translations")
    op.drop_index("ix_tour_attractions_attraction_id", table_name="tour_attractions")
    op.drop_table("tour_attractions")
    op.drop_index("ix_ticket_tours_tour_id", table_name="ticket_tours")
    op.drop_table("ticket_tours")
    op.drop_index("ix_playback_events_ts", table_name="playback_events")
    op.drop_index("ix_playback_events_attraction_ts", table_name="playback_events")
    op.drop_table("playback_events")
    op.drop_index("ix_glossaries_target_lang", table_name="glossaries")
    op.drop_table("glossaries")
    op.drop_index(
        "uq_audio_packs_published",
        table_name="audio_packs",
        postgresql_where=sa.text("status = 'published'"),
    )
    op.drop_index("ix_audio_packs_tour_lang_status", table_name="audio_packs")
    op.drop_table("audio_packs")
    op.drop_index("ix_audio_assets_text_hash", table_name="audio_assets")
    op.drop_table("audio_assets")
    op.drop_table("tours")
    op.drop_index("ix_tickets_device_id", table_name="tickets")
    op.drop_index("ix_tickets_batch", table_name="tickets")
    op.drop_table("tickets")
    op.drop_index("ix_refresh_tokens_user_id", table_name="refresh_tokens")
    op.drop_index("ix_refresh_tokens_family_id", table_name="refresh_tokens")
    op.drop_index("ix_refresh_tokens_expires_at", table_name="refresh_tokens")
    op.drop_table("refresh_tokens")
    op.drop_index(
        "uq_jobs_active_dedupe_key",
        table_name="jobs",
        postgresql_where=sa.text("status IN ('queued', 'running')"),
    )
    op.drop_index("ix_jobs_status_created_at", table_name="jobs")
    op.drop_table("jobs")
    op.drop_index("ix_audit_logs_ts", table_name="audit_logs")
    op.drop_index("ix_audit_logs_resource_ts", table_name="audit_logs")
    op.drop_index("ix_audit_logs_actor_ts", table_name="audit_logs")
    op.drop_table("audit_logs")
    op.drop_index("ix_attractions_status_updated_at", table_name="attractions")
    op.drop_index("ix_attractions_script_status", table_name="attractions")
    op.drop_index("ix_attractions_geo", table_name="attractions", postgresql_using="gist")
    op.drop_table("attractions")
    op.drop_table("users")
    op.drop_table("languages")
