"""Chặn xóa bản ghi đang được khóa ngoại tham chiếu.

Revision ID: 0005
Revises: 0004
"""

from alembic import op

revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None

FOREIGN_KEYS = (
    ("fk_audio_assets_lang_languages", "audio_assets", "lang", "languages", "code", None),
    ("fk_audio_assets_poi_id_pois", "audio_assets", "poi_id", "pois", "id", "CASCADE"),
    ("fk_audio_packs_lang_languages", "audio_packs", "lang", "languages", "code", None),
    ("fk_audio_packs_published_by_users", "audio_packs", "published_by", "users", "id", "SET NULL"),
    ("fk_audio_packs_tour_id_tours", "audio_packs", "tour_id", "tours", "id", "CASCADE"),
    ("fk_glossaries_created_by_users", "glossaries", "created_by", "users", "id", "SET NULL"),
    ("fk_glossaries_poi_id_pois", "glossaries", "poi_id", "pois", "id", "CASCADE"),
    ("fk_glossaries_target_lang_languages", "glossaries", "target_lang", "languages", "code", None),
    ("fk_jobs_created_by_users", "jobs", "created_by", "users", "id", "SET NULL"),
    ("fk_playback_events_lang_languages", "playback_events", "lang", "languages", "code", None),
    ("fk_playback_events_poi_id_pois", "playback_events", "poi_id", "pois", "id", "CASCADE"),
    ("fk_pois_created_by_users", "pois", "created_by", "users", "id", "SET NULL"),
    ("fk_pois_updated_by_users", "pois", "updated_by", "users", "id", "SET NULL"),
    ("fk_refresh_tokens_user_id_users", "refresh_tokens", "user_id", "users", "id", "CASCADE"),
    ("fk_ticket_tours_ticket_id_tickets", "ticket_tours", "ticket_id", "tickets", "id", "CASCADE"),
    ("fk_ticket_tours_tour_id_tours", "ticket_tours", "tour_id", "tours", "id", "CASCADE"),
    ("fk_tour_pois_tour_id_tours", "tour_pois", "tour_id", "tours", "id", "CASCADE"),
    ("fk_tours_updated_by_users", "tours", "updated_by", "users", "id", "SET NULL"),
    ("fk_translations_poi_id_pois", "translations", "poi_id", "pois", "id", "CASCADE"),
    ("fk_translations_reviewed_by_users", "translations", "reviewed_by", "users", "id", "SET NULL"),
    (
        "fk_translations_target_lang_languages",
        "translations",
        "target_lang",
        "languages",
        "code",
        None,
    ),
)


def _replace_foreign_keys(*, downgrade: bool) -> None:
    for name, table, column, parent, parent_column, old_action in FOREIGN_KEYS:
        op.drop_constraint(op.f(name), table, type_="foreignkey")
        op.create_foreign_key(
            op.f(name),
            table,
            parent,
            [column],
            [parent_column],
            ondelete=old_action if downgrade else "RESTRICT",
        )


def upgrade() -> None:
    _replace_foreign_keys(downgrade=False)


def downgrade() -> None:
    _replace_foreign_keys(downgrade=True)
