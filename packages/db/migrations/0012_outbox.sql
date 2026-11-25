CREATE TABLE outbox (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    event text NOT NULL,
    payload jsonb NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    published_at timestamptz
);
CREATE INDEX outbox_unpublished_idx ON outbox (id)
WHERE published_at IS NULL;
CREATE FUNCTION outbox_slot_changed(p_court uuid, p_during tstzrange) RETURNS void LANGUAGE sql AS $$
INSERT INTO outbox (event, payload)
SELECT 'slot_changed',
    jsonb_build_object(
        'courtId',
        c.id,
        'venueId',
        c.venue_id,
        'from',
        lower(p_during),
        'to',
        upper(p_during)
    )
FROM court c
WHERE c.id = p_court;
$$;
CREATE FUNCTION booking_slot_changed() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF TG_OP = 'INSERT'
    OR NEW.status IS DISTINCT
FROM OLD.status THEN PERFORM outbox_slot_changed(NEW.court_id, NEW.during);
END IF;
RETURN NULL;
END;
$$;
CREATE TRIGGER booking_slot_changed
AFTER
INSERT
    OR
UPDATE OF status ON booking FOR EACH ROW EXECUTE FUNCTION booking_slot_changed();
CREATE FUNCTION blackout_slot_changed() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF TG_OP = 'DELETE' THEN PERFORM outbox_slot_changed(OLD.court_id, OLD.during);
ELSE PERFORM outbox_slot_changed(NEW.court_id, NEW.during);
END IF;
RETURN NULL;
END;
$$;
CREATE TRIGGER blackout_slot_changed
AFTER
INSERT
    OR DELETE ON blackout FOR EACH ROW EXECUTE FUNCTION blackout_slot_changed();
