"""Đổi tên bảng và khóa ngoại theo POI, giữ toàn bộ dữ liệu.

Revision ID: 0004
Revises: 0003
"""

from alembic import op

revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None

CHILDREN = ("tour_pois", "translations", "glossaries", "audio_assets", "playback_events")
CONSTRAINTS = (
    ("pois", "fk_attractions_created_by_users", "fk_pois_created_by_users"),
    ("pois", "fk_attractions_updated_by_users", "fk_pois_updated_by_users"),
    ("pois", "pk_attractions", "pk_pois"),
    ("pois", "uq_attractions_slug", "uq_pois_slug"),
    ("tour_pois", "fk_tour_attractions_tour_id_tours", "fk_tour_pois_tour_id_tours"),
    ("tour_pois", "pk_tour_attractions", "pk_tour_pois"),
    ("translations", "fk_translations_attraction_id_attractions", "fk_translations_poi_id_pois"),
    ("translations", "uq_translations_attraction_lang", "uq_translations_poi_lang"),
    ("glossaries", "fk_glossaries_attraction_id_attractions", "fk_glossaries_poi_id_pois"),
    ("glossaries", "uq_glossaries_term_lang_attraction", "uq_glossaries_term_lang_poi"),
    ("audio_assets", "fk_audio_assets_attraction_id_attractions", "fk_audio_assets_poi_id_pois"),
    ("audio_assets", "uq_audio_assets_attraction_lang", "uq_audio_assets_poi_lang"),
    (
        "playback_events",
        "fk_playback_events_attraction_id_attractions",
        "fk_playback_events_poi_id_pois",
    ),
)
INDEXES = (
    ("ix_attractions_geo", "ix_pois_geo"),
    ("ix_attractions_script_status", "ix_pois_script_status"),
    ("ix_attractions_status_updated_at", "ix_pois_status_updated_at"),
    ("ix_tour_attractions_attraction_id", "ix_tour_pois_poi_id"),
    ("ix_playback_events_attraction_ts", "ix_playback_events_poi_ts"),
)
OLD_FK = "fk_tour_attractions_attraction_id_attractions"
NEW_FK = "fk_tour_pois_poi_id_pois"


def _rename_db_objects(*, reverse: bool = False) -> None:
    for table, old, new in CONSTRAINTS:
        src, dst = (new, old) if reverse else (old, new)
        op.execute(f'ALTER TABLE "{table}" RENAME CONSTRAINT "{src}" TO "{dst}"')
    for old, new in INDEXES:
        src, dst = (new, old) if reverse else (old, new)
        op.execute(f'ALTER INDEX "{src}" RENAME TO "{dst}"')


def upgrade() -> None:
    op.drop_constraint(op.f(OLD_FK), "tour_attractions", type_="foreignkey")
    op.rename_table("attractions", "pois")
    op.rename_table("tour_attractions", "tour_pois")
    for table in CHILDREN:
        op.alter_column(table, "attraction_id", new_column_name="poi_id")
    _rename_db_objects()
    op.create_foreign_key(
        op.f(NEW_FK), "tour_pois", "pois", ["poi_id"], ["id"], ondelete="RESTRICT"
    )
    op.execute("""
        CREATE FUNCTION prevent_poi_delete() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN
            RAISE EXCEPTION 'Không được xóa cứng POI. Hãy gỡ POI khỏi tour nếu cần.'
                USING ERRCODE = '23514';
        END;
        $$
    """)
    op.execute("""
        CREATE TRIGGER protect_pois_from_delete
        BEFORE DELETE OR TRUNCATE ON pois
        FOR EACH STATEMENT EXECUTE FUNCTION prevent_poi_delete()
    """)


def downgrade() -> None:
    op.execute("DROP TRIGGER protect_pois_from_delete ON pois")
    op.execute("DROP FUNCTION prevent_poi_delete()")
    op.drop_constraint(op.f(NEW_FK), "tour_pois", type_="foreignkey")
    _rename_db_objects(reverse=True)
    for table in CHILDREN:
        op.alter_column(table, "poi_id", new_column_name="attraction_id")
    op.rename_table("tour_pois", "tour_attractions")
    op.rename_table("pois", "attractions")
    op.create_foreign_key(
        op.f(OLD_FK),
        "tour_attractions",
        "attractions",
        ["attraction_id"],
        ["id"],
        ondelete="CASCADE",
    )
