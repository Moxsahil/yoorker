import { MapPinIcon, SearchIcon } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import {
  newSearchSession,
  placeDetails,
  suggestPlaces,
  type FoundPlace,
  type Suggestion,
} from "@/lib/google-maps";
import { cn } from "@/lib/utils";

export function AddressSearch({ onPick }: { onPick: (place: FoundPlace) => void }) {
  const listId = useId();
  const [text, setText] = useState("");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const session = useRef<google.maps.places.AutocompleteSessionToken | null>(null);
  const latest = useRef(0);

  useEffect(() => {
    const query = text.trim();
    if (query.length < 3) return;
    const request = ++latest.current;
    const timer = setTimeout(async () => {
      try {
        session.current ??= await newSearchSession();
        const found = await suggestPlaces(query, session.current);
        if (request !== latest.current) return;
        setSuggestions(found);
        setActive(0);
        setOpen(true);
        setProblem(found.length === 0 ? "No matches. Try the area or a landmark." : null);
      } catch (error) {
        if (request === latest.current) setProblem((error as Error).message);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [text]);

  const pick = async (suggestion: Suggestion) => {
    setOpen(false);
    setText(suggestion.main);
    setBusy(true);
    try {
      onPick(await placeDetails(suggestion));
      setProblem(null);
    } catch (error) {
      setProblem((error as Error).message);
    } finally {
      session.current = null;
      setBusy(false);
    }
  };

  const showList = open && suggestions.length > 0 && text.trim().length >= 3;

  return (
    <div className="relative flex flex-col gap-2">
      <div className="relative">
        <SearchIcon className="pointer-events-none absolute start-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          role="combobox"
          aria-label="Search for the venue on Google"
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={showList ? `${listId}-${active}` : undefined}
          autoComplete="off"
          placeholder="Search the venue's name or address"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            if (e.target.value.trim().length < 3) {
              setSuggestions([]);
              setProblem(null);
            }
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onKeyDown={(e) => {
            if (!showList) return;
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((i) => (i + 1) % suggestions.length);
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((i) => (i - 1 + suggestions.length) % suggestions.length);
            } else if (e.key === "Enter") {
              e.preventDefault();
              void pick(suggestions[active]!);
            } else if (e.key === "Escape") {
              setOpen(false);
            }
          }}
          className="ps-8 pe-8"
        />
        {busy && (
          <Spinner className="absolute end-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        )}
      </div>
      {showList && (
        <div className="absolute inset-x-0 top-full z-30 mt-1 overflow-hidden rounded-lg bg-popover text-popover-foreground shadow-md ring-1 ring-foreground/10">
          <ul id={listId} role="listbox" aria-label="Places" className="p-1">
            {suggestions.map((s, i) => (
              <li
                key={s.id}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={i === active}
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => setActive(i)}
                onClick={() => void pick(s)}
                className={cn(
                  "flex cursor-default items-start gap-2.5 rounded-md px-2 py-1.5 text-sm",
                  i === active && "bg-accent text-accent-foreground",
                )}
              >
                <MapPinIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                <span className="flex min-w-0 flex-col">
                  <span className="truncate font-medium">{s.main}</span>
                  <span className="truncate text-xs text-muted-foreground">{s.secondary}</span>
                </span>
              </li>
            ))}
          </ul>
          <p className="border-t px-3 py-1.5 text-end text-[11px] text-muted-foreground">
            Powered by Google
          </p>
        </div>
      )}
      {problem ? (
        <p className="text-xs text-destructive">{problem}</p>
      ) : (
        <p className="text-xs text-muted-foreground">
          Pick your venue and we fill in the address and the map pin.
        </p>
      )}
    </div>
  );
}
