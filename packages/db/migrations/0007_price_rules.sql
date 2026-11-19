-- Court prices (TURF-201). Every owner sets their own: a base price per hour, and rules for
-- days, hours and booking lengths, priced per hour or for the whole booking (a 3 h 30 m
-- cricket slot). Times are local, like opening hours; a rule may run past midnight.
ALTER TABLE court
ADD COLUMN base_price_per_hour_paise integer,
    ADD CONSTRAINT court_base_price CHECK (
        base_price_per_hour_paise IS NULL
        OR (
            base_price_per_hour_paise BETWEEN 0 AND 10000000
            AND base_price_per_hour_paise % 100 = 0
        )
    );
CREATE TYPE price_unit AS ENUM ('PER_HOUR', 'PER_BOOKING');
CREATE TABLE price_rule (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    court_id uuid NOT NULL REFERENCES court (id) ON DELETE CASCADE,
    name text NOT NULL,
    -- ISO weekdays (1 = Monday) the rule applies to, or a single date (31 Dec).
    weekdays smallint [] NOT NULL DEFAULT '{}',
    on_date date,
    -- Minutes after local midnight; to_minute above 1440 ends the next day.
    from_minute smallint NOT NULL,
    to_minute smallint NOT NULL,
    -- Only bookings of this length; NULL means any length (per-hour rules only).
    minutes smallint,
    unit price_unit NOT NULL,
    price_paise integer NOT NULL,
    priority smallint NOT NULL DEFAULT 0,
    position smallint NOT NULL DEFAULT 0,
    CONSTRAINT price_rule_name_length CHECK (
        length(btrim(name)) BETWEEN 1 AND 40
    ),
    CONSTRAINT price_rule_days CHECK (
        (
            on_date IS NULL
            AND cardinality(weekdays) BETWEEN 1 AND 7
            AND weekdays <@ ARRAY [1, 2, 3, 4, 5, 6, 7]::smallint []
        )
        OR (
            on_date IS NOT NULL
            AND cardinality(weekdays) = 0
        )
    ),
    CONSTRAINT price_rule_from CHECK (
        from_minute BETWEEN 0 AND 1439
    ),
    CONSTRAINT price_rule_length CHECK (
        to_minute > from_minute
        AND to_minute <= from_minute + 1440
    ),
    CONSTRAINT price_rule_minutes CHECK (
        minutes IS NULL
        OR minutes BETWEEN 15 AND 720
    ),
    CONSTRAINT price_rule_per_booking_needs_length CHECK (
        unit = 'PER_HOUR'
        OR minutes IS NOT NULL
    ),
    CONSTRAINT price_rule_price CHECK (
        price_paise BETWEEN 0 AND 10000000
        AND price_paise % 100 = 0
    ),
    CONSTRAINT price_rule_priority CHECK (
        priority BETWEEN 0 AND 100
    )
);
CREATE INDEX price_rule_court_idx ON price_rule (court_id, position);