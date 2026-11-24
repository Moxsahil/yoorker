CREATE TYPE booking_status AS ENUM (
    'HELD',
    'CONFIRMED',
    'COMPLETED',
    'CANCELLED',
    'NO_SHOW',
    'EXPIRED'
);
CREATE TYPE payment_status AS ENUM ('NOT_PAID', 'PAID', 'REFUNDED');
CREATE TYPE booking_source AS ENUM ('ONLINE', 'WALK_IN', 'PHONE');
CREATE TYPE price_source AS ENUM ('BOOKING_RULE', 'PACKAGE', 'HOURLY');
CREATE TABLE booking (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    number bigint GENERATED ALWAYS AS IDENTITY,
    court_id uuid NOT NULL REFERENCES court (id),
    during tstzrange NOT NULL,
    minutes integer NOT NULL,
    sport text NOT NULL,
    status booking_status NOT NULL DEFAULT 'HELD',
    payment_status payment_status NOT NULL DEFAULT 'NOT_PAID',
    source booking_source NOT NULL,
    hold_expires_at timestamptz,
    player_id uuid REFERENCES app_user (id),
    player_name text,
    player_phone text,
    price_paise integer NOT NULL,
    price_source price_source NOT NULL,
    price_rule_name text,
    idempotency_key text,
    created_by uuid REFERENCES app_user (id),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    status_changed_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT booking_number_unique UNIQUE (number),
    CONSTRAINT booking_idempotency_unique UNIQUE (created_by, idempotency_key),
    CONSTRAINT booking_during_bounded CHECK (
        NOT isempty(during)
        AND NOT lower_inf(during)
        AND NOT upper_inf(during)
        AND lower_inc(during)
        AND NOT upper_inc(during)
    ),
    CONSTRAINT booking_minutes_match CHECK (
        minutes BETWEEN 15 AND 720
        AND minutes % 15 = 0
        AND upper(during) - lower(during) = make_interval(mins => minutes)
    ),
    CONSTRAINT booking_sport_format CHECK (sport ~ '^[A-Z]+$'),
    CONSTRAINT booking_price_whole_rupees CHECK (
        price_paise >= 0
        AND price_paise % 100 = 0
    ),
    CONSTRAINT booking_player_named CHECK (
        (
            player_id IS NOT NULL
            OR player_name IS NOT NULL
        )
        AND (
            player_name IS NULL
            OR length(btrim(player_name)) BETWEEN 1 AND 100
        )
    ),
    CONSTRAINT booking_player_phone_e164 CHECK (
        player_phone IS NULL
        OR player_phone ~ '^\+[1-9][0-9]{7,14}$'
    ),
    CONSTRAINT booking_idempotency_key_length CHECK (
        idempotency_key IS NULL
        OR length(idempotency_key) BETWEEN 8 AND 100
    ),
    CONSTRAINT booking_hold_expires CHECK (
        status <> 'HELD'
        OR hold_expires_at IS NOT NULL
    ),
    CONSTRAINT booking_hold_not_paid CHECK (
        status NOT IN ('HELD', 'EXPIRED')
        OR payment_status = 'NOT_PAID'
    ),
    CONSTRAINT booking_refund_needs_cancel CHECK (
        payment_status <> 'REFUNDED'
        OR status = 'CANCELLED'
    ),
    CONSTRAINT booking_no_overlap EXCLUDE USING gist (
        court_id WITH =,
        during WITH &&
    )
    WHERE (status IN ('HELD', 'CONFIRMED'))
);
CREATE INDEX booking_court_start_idx ON booking (court_id, lower(during));
CREATE INDEX booking_player_idx ON booking (player_id);
CREATE INDEX booking_hold_expiry_idx ON booking (hold_expires_at)
WHERE status = 'HELD';
-- Blocks and bookings live in two tables, so no single constraint can keep them apart. Both
-- triggers take this per-court lock first, so a block and a booking for the same time can't
-- both commit.
CREATE FUNCTION lock_court(court uuid) RETURNS void LANGUAGE sql AS $$
SELECT pg_advisory_xact_lock(hashtextextended(court::text, 7303));
$$;
CREATE FUNCTION booking_before_insert() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NOT (
        NEW.status = 'HELD'
        AND NEW.payment_status = 'NOT_PAID'
        OR NEW.status = 'CONFIRMED'
        AND NEW.source <> 'ONLINE'
    ) THEN RAISE EXCEPTION 'A new booking starts as a hold, or confirmed at the desk' USING ERRCODE = 'YK003';
END IF;
PERFORM lock_court(NEW.court_id);
IF EXISTS (
    SELECT 1
    FROM blackout
    WHERE court_id = NEW.court_id
        AND during && NEW.during
) THEN RAISE EXCEPTION 'That time is blocked on this court' USING ERRCODE = 'YK001';
END IF;
RETURN NEW;
END;
$$;
CREATE TRIGGER booking_before_insert BEFORE
INSERT ON booking FOR EACH ROW EXECUTE FUNCTION booking_before_insert();
CREATE FUNCTION booking_before_update() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.court_id <> OLD.court_id
    OR NEW.during <> OLD.during
    OR NEW.number <> OLD.number THEN RAISE EXCEPTION 'A booking''s court and time can''t change' USING ERRCODE = 'YK003';
END IF;
IF NEW.status <> OLD.status
AND NOT (
    OLD.status = 'HELD'
    AND NEW.status IN ('CONFIRMED', 'CANCELLED', 'EXPIRED')
    OR OLD.status = 'CONFIRMED'
    AND NEW.status IN ('COMPLETED', 'CANCELLED', 'NO_SHOW')
) THEN RAISE EXCEPTION 'A booking can''t go from % to %',
OLD.status,
NEW.status USING ERRCODE = 'YK003';
END IF;
IF NEW.payment_status <> OLD.payment_status
AND NOT (
    OLD.payment_status = 'NOT_PAID'
    AND NEW.payment_status = 'PAID'
    OR OLD.payment_status = 'PAID'
    AND NEW.payment_status = 'REFUNDED'
) THEN RAISE EXCEPTION 'A payment can''t go from % to %',
OLD.payment_status,
NEW.payment_status USING ERRCODE = 'YK003';
END IF;
IF NEW.status <> OLD.status THEN NEW.status_changed_at := now();
END IF;
NEW.updated_at := now();
RETURN NEW;
END;
$$;
CREATE TRIGGER booking_before_update BEFORE
UPDATE ON booking FOR EACH ROW EXECUTE FUNCTION booking_before_update();
CREATE FUNCTION blackout_before_insert() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN PERFORM lock_court(NEW.court_id);
IF EXISTS (
    SELECT 1
    FROM booking
    WHERE court_id = NEW.court_id
        AND during && NEW.during
        AND (
            status = 'CONFIRMED'
            OR status = 'HELD'
            AND hold_expires_at > now()
        )
) THEN RAISE EXCEPTION 'A booking holds this time on this court' USING ERRCODE = 'YK002';
END IF;
RETURN NEW;
END;
$$;
CREATE TRIGGER blackout_before_insert BEFORE
INSERT ON blackout FOR EACH ROW EXECUTE FUNCTION blackout_before_insert();
