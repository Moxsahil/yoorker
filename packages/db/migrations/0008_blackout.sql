-- Blocks (TURF-203): times an owner or staff member takes a court out of booking, for
-- maintenance, a private event or a holiday. Stored as exact UTC instants. Blocks on one
-- court never overlap, enforced the same way bookings will be (ADR-0004).
CREATE TYPE block_reason AS ENUM (
    'MAINTENANCE',
    'PRIVATE_EVENT',
    'HOLIDAY',
    'OTHER'
);
CREATE TABLE blackout (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    court_id uuid NOT NULL REFERENCES court (id) ON DELETE CASCADE,
    during tstzrange NOT NULL,
    reason block_reason NOT NULL,
    note text,
    created_by uuid REFERENCES app_user (id),
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT blackout_during_bounded CHECK (
        NOT isempty(during)
        AND NOT lower_inf(during)
        AND NOT upper_inf(during)
        AND lower_inc(during)
        AND NOT upper_inc(during)
    ),
    CONSTRAINT blackout_max_length CHECK (
        upper(during) - lower(during) <= interval '31 days'
    ),
    CONSTRAINT blackout_note_length CHECK (
        note IS NULL
        OR length(btrim(note)) BETWEEN 1 AND 200
    ),
    CONSTRAINT blackout_no_overlap EXCLUDE USING gist (
        court_id WITH =,
        during WITH &&
    )
);