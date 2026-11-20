import { useTheme } from "next-themes";

import { cn } from "@/lib/utils";

const TILE = 256;

/** Browser key for the Maps Static API, from .env.local. Without it the map uses OpenStreetMap. */
const GOOGLE_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;

/** Quiet map styles: no shops or bus stops, and a dark version that matches the dashboard. */
const BASE_STYLE = ["feature:poi|visibility:off", "feature:transit|visibility:off"];
const DARK_STYLE = [
  "element:geometry|color:0x1d2127",
  "element:labels.text.fill|color:0x8b929c",
  "element:labels.text.stroke|color:0x1d2127",
  "element:labels.icon|visibility:off",
  "feature:road|element:geometry|color:0x2b3038",
  "feature:road.arterial|element:geometry|color:0x333944",
  "feature:road.highway|element:geometry|color:0x3d4450",
  "feature:landscape.man_made|element:geometry|color:0x22262d",
  "feature:water|element:geometry|color:0x0f1b29",
  "feature:administrative|element:geometry|color:0x3a3f47",
];

function Pin() {
  // The pin's tip sits exactly on the venue, which is the centre of the map.
  return (
    <svg
      viewBox="0 0 24 32"
      className="absolute top-1/2 left-1/2 z-10 h-9 w-7 -translate-x-1/2 -translate-y-full drop-shadow-md"
      role="img"
      aria-label="Venue location"
    >
      <path
        d="M12 0C5.4 0 0 5.3 0 11.9 0 20.8 12 32 12 32s12-11.2 12-20.1C24 5.3 18.6 0 12 0Z"
        className="fill-destructive"
      />
      <circle cx="12" cy="12" r="4.5" className="fill-white" />
    </svg>
  );
}

/**
 * A small map of the venue, centred on it. Uses Google Maps when VITE_GOOGLE_MAPS_API_KEY
 * is set (the same Google Cloud project as the real app), otherwise OpenStreetMap tiles.
 */
export function VenueMap(props: {
  lat: number;
  lng: number;
  zoom?: number;
  className?: string;
  /** Off when the map sits inside a link (a venue card), since links can't nest. */
  linkOut?: boolean;
}) {
  return GOOGLE_KEY ? <GoogleMap {...props} apiKey={GOOGLE_KEY} /> : <OsmMap {...props} />;
}

function GoogleMap({
  lat,
  lng,
  zoom = 15,
  className,
  linkOut = true,
  apiKey,
}: {
  lat: number;
  lng: number;
  zoom?: number;
  className?: string;
  linkOut?: boolean;
  apiKey: string;
}) {
  const { resolvedTheme } = useTheme();
  const params = new URLSearchParams({
    center: `${lat},${lng}`,
    zoom: String(zoom),
    // The largest free size at double density; object-cover crops it around the centre.
    size: "640x400",
    scale: "2",
    key: apiKey,
  });
  for (const style of resolvedTheme === "dark" ? [...BASE_STYLE, ...DARK_STYLE] : BASE_STYLE)
    params.append("style", style);

  return (
    <div className={cn("relative isolate overflow-hidden rounded-xl border bg-muted", className)}>
      {/* Wait for the theme, so a dark dashboard never loads the light map first. */}
      {resolvedTheme && (
        <img
          src={`https://maps.googleapis.com/maps/api/staticmap?${params}`}
          alt=""
          loading="lazy"
          draggable={false}
          className="absolute inset-0 size-full object-cover select-none"
        />
      )}
      <Pin />
      {linkOut && (
        <a
          href={`https://www.google.com/maps/search/?api=1&query=${lat},${lng}`}
          target="_blank"
          rel="noreferrer"
          className="absolute end-1.5 top-1.5 z-10 rounded-md bg-card/90 px-2 py-1 text-xs font-medium backdrop-blur-sm hover:text-primary"
        >
          Open in Google Maps
        </a>
      )}
    </div>
  );
}

function OsmMap({
  lat,
  lng,
  zoom = 15,
  className,
  linkOut = true,
}: {
  lat: number;
  lng: number;
  zoom?: number;
  className?: string;
  /** Off when the map sits inside a link (a venue card), since links can't nest. */
  linkOut?: boolean;
}) {
  const n = 2 ** zoom;
  const rad = (lat * Math.PI) / 180;
  // Where the point sits in the world, in tiles (Web Mercator).
  const x = ((lng + 180) / 360) * n;
  const y = ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * n;
  const tx = Math.floor(x);
  const ty = Math.floor(y);
  const tiles: { col: number; row: number }[] = [];
  for (let row = -2; row <= 2; row++) for (let col = -2; col <= 2; col++) tiles.push({ col, row });

  return (
    <div className={cn("relative isolate overflow-hidden rounded-xl border bg-muted", className)}>
      <div
        className="absolute dark:[filter:invert(0.92)_hue-rotate(180deg)_saturate(0.6)_brightness(0.95)]"
        style={{
          left: `calc(50% - ${(x - tx + 2) * TILE}px)`,
          top: `calc(50% - ${(y - ty + 2) * TILE}px)`,
          width: TILE * 5,
          height: TILE * 5,
        }}
        aria-hidden
      >
        {tiles.map(({ col, row }) => (
          <img
            key={`${col}:${row}`}
            src={`https://tile.openstreetmap.org/${zoom}/${(((tx + col) % n) + n) % n}/${ty + row}.png`}
            alt=""
            width={TILE}
            height={TILE}
            loading="lazy"
            draggable={false}
            className="absolute max-w-none select-none"
            style={{ left: (col + 2) * TILE, top: (row + 2) * TILE }}
          />
        ))}
      </div>
      <Pin />
      {linkOut ? (
        <a
          href={`https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=${zoom + 2}/${lat}/${lng}`}
          target="_blank"
          rel="noreferrer"
          className="absolute end-1.5 bottom-1.5 z-10 rounded bg-card/85 px-1.5 py-0.5 text-[10px] text-muted-foreground backdrop-blur-sm hover:text-foreground"
        >
          © OpenStreetMap
        </a>
      ) : (
        <span className="absolute end-1.5 bottom-1.5 z-10 rounded bg-card/85 px-1.5 py-0.5 text-[10px] text-muted-foreground backdrop-blur-sm">
          © OpenStreetMap
        </span>
      )}
    </div>
  );
}
