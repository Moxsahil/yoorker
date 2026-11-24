import { useQueryClient } from "@tanstack/react-query";
import { CheckIcon, LocateFixedIcon, MapPinIcon, SearchIcon } from "lucide-react";
import { useState } from "react";

import { Link, useRouter } from "@/kit/framework";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { toast } from "@/components/ui/toast";
import { useBreadcrumbLabel } from "@/kit/shell/breadcrumbs";
import { PageHeader } from "@/kit/ui-patterns/page-header";
import { Widget, WidgetHeader } from "@/kit/widgets/widget";
import { api, ApiError } from "@/lib/api";
import {
  addressAt,
  findAddress,
  hasGoogleMaps,
  type AddressFields,
  type FoundPlace,
} from "@/lib/google-maps";
import { useAllVenues, useVenueChoice } from "@/lib/session";
import { cn } from "@/lib/utils";
import type { Organisation, Venue } from "@/lib/yoorker";

import { AddressSearch } from "./address-search";
import { VenueMap } from "./venue-map";

const AMENITIES = [
  "Parking",
  "Floodlights",
  "Washroom",
  "Changing rooms",
  "Drinking water",
  "Seating",
  "Cafeteria",
  "First aid",
  "Equipment on rent",
];

const slugify = (text: string) =>
  text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);

const parseCoords = (text: string) => {
  const match = text.trim().match(/^(-?\d{1,2}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)$/);
  if (!match) return null;
  const lat = Number(match[1]);
  const lng = Number(match[2]);
  return Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? { lat, lng } : null;
};

const pin = (lat: number, lng: number) => `${lat.toFixed(6)}, ${lng.toFixed(6)}`;

export function NewVenuePage() {
  useBreadcrumbLabel("Add venue");
  const router = useRouter();
  const client = useQueryClient();
  const choose = useVenueChoice((state) => state.choose);
  const { organisations, loading } = useAllVenues();
  const teams = organisations.filter((org) => org.role === "OWNER" || org.role === "MANAGER");
  const firstVenue = teams.length === 0;

  const [orgId, setOrgId] = useState("");
  const [business, setBusiness] = useState("");
  const [name, setName] = useState("");
  const [slug, setSlug] = useState<string | null>(null);
  const [address, setAddress] = useState("");
  const [locality, setLocality] = useState("");
  const [pincode, setPincode] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [coords, setCoords] = useState("");
  const [amenities, setAmenities] = useState<string[]>([]);
  const [finding, setFinding] = useState<"address" | "here" | null>(null);
  const [busy, setBusy] = useState(false);
  const [tried, setTried] = useState(false);

  const organisation = teams.find((o) => o.id === orgId) ?? teams[0];
  const finalSlug = slug ?? slugify(name);
  const point = parseCoords(coords);

  const fillEmpty = (found: AddressFields) => {
    setAddress((v) => v || found.address);
    setLocality((v) => v || found.locality);
    setCity((v) => v || found.city);
    setState((v) => v || found.state);
    setPincode((v) => v || found.pincode);
  };

  const pickPlace = (found: FoundPlace) => {
    setCoords(pin(found.lat, found.lng));
    setAddress(found.address);
    setLocality(found.locality);
    setCity(found.city);
    setState(found.state);
    setPincode(found.pincode);
    if (found.name) setName((v) => v || found.name);
  };

  const locateAddress = async () => {
    setFinding("address");
    try {
      const found = await findAddress(
        [address, locality, city, state, pincode].filter(Boolean).join(", "),
      );
      if (!found) {
        toast.add({
          type: "error",
          title: "Couldn't find that address",
          description: "Add the area and city, or paste the pin's coordinates from Google Maps.",
        });
        return;
      }
      setCoords(pin(found.lat, found.lng));
      fillEmpty(found);
    } catch (error) {
      toast.add({ type: "error", title: (error as Error).message });
    } finally {
      setFinding(null);
    }
  };

  const useHere = () => {
    if (!navigator.geolocation) return;
    setFinding("here");
    navigator.geolocation.getCurrentPosition(
      async ({ coords: here }) => {
        setCoords(pin(here.latitude, here.longitude));
        try {
          if (hasGoogleMaps) {
            const found = await addressAt(here.latitude, here.longitude);
            if (found) fillEmpty(found);
          }
        } catch {
          // The pin is set; the address can still be typed.
        } finally {
          setFinding(null);
        }
      },
      () => {
        setFinding(null);
        toast.add({
          type: "error",
          title: "Couldn't read your location",
          description: "Allow location access, or search for the venue instead.",
        });
      },
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  };

  const errors = {
    business: firstVenue && !business.trim() ? "Enter your business name." : null,
    name: !name.trim() ? "Enter the venue's name." : null,
    slug:
      finalSlug.length < 3 || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(finalSlug)
        ? "Use at least 3 lowercase letters, numbers or hyphens."
        : null,
    address: !address.trim() ? "Enter the street address." : null,
    pincode: pincode && !/^[1-9][0-9]{5}$/.test(pincode) ? "Enter a 6-digit PIN code." : null,
    city: !city.trim() || !state.trim() ? "Enter the city and state." : null,
    coords: !point ? "Set the venue's pin on the map." : null,
  };
  const show = (key: keyof typeof errors) => (tried ? errors[key] : null);

  const save = async () => {
    setTried(true);
    if (Object.values(errors).some(Boolean) || !point) return;
    setBusy(true);
    try {
      const owner =
        organisation ??
        (await api<Organisation>("/organisations", { body: { name: business.trim() } }));
      if (!organisation) await client.invalidateQueries({ queryKey: ["organisations"] });
      const venue = await api<Venue>(`/organisations/${owner.id}/venues`, {
        body: {
          slug: finalSlug,
          name: name.trim(),
          address: address.trim(),
          location: point,
          city: { name: city.trim(), state: state.trim() },
          locality: locality.trim() || null,
          pincode: pincode.trim() || null,
          amenities,
          rules: [],
        },
      });
      await client.invalidateQueries({ queryKey: ["venues", owner.id] });
      choose(venue.id);
      toast.add({
        type: "success",
        title: `${venue.name} added`,
        description: "Add its courts next, then set hours and prices.",
      });
      router.push(`/venues/${venue.id}`);
    } catch (error) {
      toast.add({
        type: "error",
        title: "Couldn't add the venue",
        description: error instanceof ApiError ? error.message : String(error),
      });
      setBusy(false);
    }
  };

  const fieldError = (message: string | null) =>
    message && <p className="text-xs text-destructive">{message}</p>;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Add venue"
        description="A venue is one place players come to. You add its courts on the next screen."
      />

      {loading ? null : (
        <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)]">
          <div className="flex flex-col gap-4">
            <Widget>
              <WidgetHeader title="Details" />
              <div className="flex flex-col gap-4 px-(--card-spacing)">
                {firstVenue && (
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="v-business">Business name</Label>
                    <Input
                      id="v-business"
                      placeholder="e.g. Green Arena Sports"
                      value={business}
                      onChange={(e) => setBusiness(e.target.value)}
                      aria-invalid={Boolean(show("business"))}
                    />
                    {fieldError(show("business")) ?? (
                      <p className="text-xs text-muted-foreground">
                        Your company or trade name. Every venue you add belongs to it.
                      </p>
                    )}
                  </div>
                )}
                {teams.length > 1 && (
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="v-org">Business</Label>
                    <NativeSelect
                      id="v-org"
                      className="w-full"
                      value={organisation?.id}
                      onChange={(e) => setOrgId(e.target.value)}
                    >
                      {teams.map((org) => (
                        <NativeSelectOption key={org.id} value={org.id}>
                          {org.name}
                        </NativeSelectOption>
                      ))}
                    </NativeSelect>
                  </div>
                )}
                <div className="flex flex-col gap-2">
                  <Label htmlFor="v-name">Venue name</Label>
                  <Input
                    id="v-name"
                    placeholder="e.g. Green Arena"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    aria-invalid={Boolean(show("name"))}
                  />
                  {fieldError(show("name"))}
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="v-slug">Booking link</Label>
                  <div className="flex">
                    <span className="flex items-center rounded-s-md border border-e-0 bg-muted px-2.5 text-sm text-muted-foreground">
                      yoorker.com/
                    </span>
                    <Input
                      id="v-slug"
                      placeholder="green-arena-sector-57"
                      value={finalSlug}
                      onChange={(e) => setSlug(e.target.value.toLowerCase())}
                      className="rounded-s-none font-mono text-sm"
                      aria-invalid={Boolean(show("slug"))}
                    />
                  </div>
                  {fieldError(show("slug")) ?? (
                    <p className="text-xs text-muted-foreground">
                      Players open this link to book. Made from the name; you can change it.
                    </p>
                  )}
                </div>
              </div>
            </Widget>

            <Widget>
              <WidgetHeader title="Address" />
              <div className="flex flex-col gap-4 px-(--card-spacing)">
                {hasGoogleMaps && <AddressSearch onPick={pickPlace} />}
                <div className="flex flex-col gap-2">
                  <Label htmlFor="v-address">Street address</Label>
                  <Input
                    id="v-address"
                    placeholder="Plot, street, landmark"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    aria-invalid={Boolean(show("address"))}
                  />
                  {fieldError(show("address"))}
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="v-locality">Area</Label>
                    <Input
                      id="v-locality"
                      placeholder="e.g. Sector 57"
                      value={locality}
                      onChange={(e) => setLocality(e.target.value)}
                    />
                  </div>
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="v-pincode">PIN code</Label>
                    <Input
                      id="v-pincode"
                      inputMode="numeric"
                      placeholder="6 digits"
                      value={pincode}
                      onChange={(e) => setPincode(e.target.value.trim())}
                      className="font-mono tabular-nums"
                      aria-invalid={Boolean(show("pincode"))}
                    />
                    {fieldError(show("pincode"))}
                  </div>
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="v-city">City</Label>
                    <Input
                      id="v-city"
                      placeholder="e.g. Gurugram"
                      value={city}
                      onChange={(e) => setCity(e.target.value)}
                      aria-invalid={Boolean(show("city") && !city.trim())}
                    />
                  </div>
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="v-state">State</Label>
                    <Input
                      id="v-state"
                      placeholder="e.g. Haryana"
                      value={state}
                      onChange={(e) => setState(e.target.value)}
                      aria-invalid={Boolean(show("city") && !state.trim())}
                    />
                  </div>
                </div>
                {fieldError(show("city"))}
              </div>
            </Widget>

            <Widget>
              <WidgetHeader title="Amenities" />
              <div className="flex flex-wrap gap-2 px-(--card-spacing)">
                {AMENITIES.map((item) => {
                  const on = amenities.includes(item);
                  return (
                    <button
                      key={item}
                      type="button"
                      aria-pressed={on}
                      onClick={() =>
                        setAmenities((list) =>
                          on ? list.filter((a) => a !== item) : [...list, item],
                        )
                      }
                      className={cn(
                        "flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-colors",
                        on
                          ? "border-primary/50 bg-primary/10 text-foreground"
                          : "text-muted-foreground hover:border-foreground/30 hover:text-foreground",
                      )}
                    >
                      {on && <CheckIcon className="size-3.5 text-primary" />}
                      {item}
                    </button>
                  );
                })}
              </div>
            </Widget>
          </div>

          <div className="flex flex-col gap-4 lg:sticky lg:top-20">
            <Widget>
              <WidgetHeader title="Location on the map" icon={MapPinIcon} />
              <div className="flex flex-col gap-3 px-(--card-spacing)">
                {point ? (
                  <VenueMap lat={point.lat} lng={point.lng} className="h-56" />
                ) : (
                  <div className="flex h-56 flex-col items-center justify-center gap-1 rounded-xl border border-dashed text-center text-sm text-muted-foreground">
                    <MapPinIcon className="size-5" />
                    No pin yet
                  </div>
                )}
                <div className={cn("grid gap-2", hasGoogleMaps && "grid-cols-2")}>
                  {hasGoogleMaps && (
                    <Button
                      variant="outline"
                      onClick={locateAddress}
                      disabled={!address.trim() || finding !== null}
                    >
                      <SearchIcon data-icon="inline-start" />
                      {finding === "address" ? "Finding…" : "Find address"}
                    </Button>
                  )}
                  <Button variant="outline" onClick={useHere} disabled={finding !== null}>
                    <LocateFixedIcon data-icon="inline-start" />
                    {finding === "here" ? "Locating…" : "I'm at the venue"}
                  </Button>
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="v-coords">Pin coordinates</Label>
                  <Input
                    id="v-coords"
                    placeholder="28.421100, 77.087800"
                    value={coords}
                    onChange={(e) => setCoords(e.target.value)}
                    className="font-mono text-sm tabular-nums"
                    aria-invalid={Boolean(show("coords"))}
                  />
                  {fieldError(show("coords")) ?? (
                    <p className="text-xs text-muted-foreground">
                      Check the pin is on the venue&apos;s gate. To fix it, copy the coordinates
                      from Google Maps (right-click the spot) and paste them here.
                    </p>
                  )}
                </div>
              </div>
            </Widget>
            <div className="flex justify-end gap-2">
              <Link href="/venues" className={buttonVariants({ variant: "ghost" })}>
                Cancel
              </Link>
              <Button onClick={save} disabled={busy}>
                {busy ? "Adding…" : "Add venue"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
