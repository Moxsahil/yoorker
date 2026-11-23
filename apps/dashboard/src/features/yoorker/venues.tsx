import { useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Trash2Icon,
  EllipsisIcon,
  CopyIcon,
  ImageIcon,
  LandPlotIcon,
  LinkIcon,
  MapPinIcon,
  PencilIcon,
  PlusIcon,
} from "lucide-react";
import { useState } from "react";

import { Link, useRouter } from "@/kit/framework";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import { useBreadcrumbLabel } from "@/kit/shell/breadcrumbs";
import { PageHeader } from "@/kit/ui-patterns/page-header";
import { StatusBadge } from "@/kit/ui-patterns/status-badge";
import { Widget, WidgetHeader } from "@/kit/widgets/widget";
import { api, ApiError } from "@/lib/api";
import { useAllVenues, useRemovedVenues, useVenueChoice } from "@/lib/session";
import {
  SPORT_LABEL,
  SURFACE_LABEL,
  type Court,
  type Sport,
  type Surface,
  type Venue,
} from "@/lib/yoorker";
import { DEV_NOTES } from "@/lib/dev-notes";

import { LiveBadge, LoadDemoVenueButton, NoVenue } from "./common";
import { VenueMap } from "./venue-map";
import { VenueDetailSkeleton, VenuesSkeleton } from "./page-skeletons";

const errorText = (error: unknown) => (error instanceof ApiError ? error.message : String(error));

/** "IST" for Asia/Kolkata, or the zone name for anything else. */
const zoneLabel = (timeZone: string) =>
  new Intl.DateTimeFormat("en-IN", { timeZone, timeZoneName: "short" })
    .formatToParts(new Date())
    .find((part) => part.type === "timeZoneName")?.value ?? timeZone;

function useRole(venue: Venue | undefined) {
  const { organisations } = useAllVenues();
  const role = organisations.find((org) => org.id === venue?.organisationId)?.role ?? null;
  return { role, manager: role === "OWNER" || role === "MANAGER" };
}

function useCourts(venueId: string | undefined) {
  return useQuery({
    queryKey: ["courts", venueId],
    queryFn: () => api<Court[]>(`/venues/${venueId}/courts`),
    enabled: Boolean(venueId),
  });
}

function BookingStatus({ active }: { active: boolean }) {
  return (
    <StatusBadge tone={active ? "success" : "muted"}>
      {active ? "Taking bookings" : "Paused"}
    </StatusBadge>
  );
}

// ---------------------------------------------------------------------------
// Venue list
// ---------------------------------------------------------------------------

export function VenuesPage() {
  const { venues, organisations, loading } = useAllVenues();
  const client = useQueryClient();
  const [editing, setEditing] = useState<Venue | null>(null);
  const [deleting, setDeleting] = useState<Venue | null>(null);
  const choose = useVenueChoice((state) => state.choose);
  const courts = useQueries({
    queries: venues.map((venue) => ({
      queryKey: ["courts", venue.id],
      queryFn: () => api<Court[]>(`/venues/${venue.id}/courts`),
    })),
  });
  const manager = organisations.some((org) => org.role === "OWNER" || org.role === "MANAGER");
  const totalCourts = courts.reduce((sum, q) => sum + (q.data?.length ?? 0), 0);

  if (loading) return <VenuesSkeleton />;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Venues & courts"
        description={
          venues.length
            ? `${venues.length} venue${venues.length === 1 ? "" : "s"} · ${totalCourts} court${totalCourts === 1 ? "" : "s"}. Open a venue to manage its courts.`
            : "Your venues, their courts and photos."
        }
        meta={<LiveBadge />}
        actions={
          manager ? (
            <>
              {DEV_NOTES && venues.length > 0 && (
                <LoadDemoVenueButton label="Add demo venue" variant="outline" />
              )}
              <Link href="/venues/new" className={buttonVariants()}>
                <PlusIcon data-icon="inline-start" />
                Add venue
              </Link>
            </>
          ) : undefined
        }
      />
      {venues.length === 0 ? (
        <NoVenue />
      ) : (
        // Columns follow the space the page actually has (sidebar open or closed), so every
        // row is full: 5 across on a wide screen, down to 1 on a phone.
        <div className="@container">
          <div className="grid grid-cols-1 gap-4 @2xl:grid-cols-2 @4xl:grid-cols-3 @6xl:grid-cols-4 @[88rem]:grid-cols-5">
            {venues.map((venue, i) => {
              const list = courts[i]?.data;
              return (
                // The name is the link and stretches over the whole card, so the menu
                // button can sit on top without nesting a button inside a link.
                <div
                  key={venue.id}
                  className="group relative flex flex-col gap-3 rounded-2xl border bg-card p-3 transition-colors focus-within:ring-2 focus-within:ring-ring hover:border-primary/40"
                >
                  <VenueMap
                    lat={venue.location.lat}
                    lng={venue.location.lng}
                    className="h-32"
                    linkOut={false}
                    zoom={14}
                  />
                  {manager && (
                    <div className="absolute end-5 top-5 z-20">
                      <VenueMenu
                        venue={venue}
                        onEdit={() => setEditing(venue)}
                        onDelete={() => setDeleting(venue)}
                      />
                    </div>
                  )}
                  <div className="flex flex-col gap-1.5 px-1">
                    <div className="flex items-start justify-between gap-3">
                      <h2 className="truncate text-[15px] font-semibold group-hover:text-primary">
                        <Link
                          href={`/venues/${venue.id}`}
                          onClick={() => choose(venue.id)}
                          className="outline-none after:absolute after:inset-0 after:z-10 after:rounded-2xl"
                        >
                          {venue.name}
                        </Link>
                      </h2>
                      <Badge variant="secondary" className="shrink-0 gap-1">
                        <MapPinIcon />
                        {venue.city.name}
                      </Badge>
                    </div>
                    <p className="line-clamp-2 text-[13px] leading-snug text-muted-foreground">
                      {venue.address}
                      {venue.pincode ? ` ${venue.pincode}` : ""}
                    </p>
                  </div>
                  <div className="mt-auto flex items-center justify-between gap-3 px-1 pb-1">
                    <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                      <LandPlotIcon className="size-4" />
                      {list ? `${list.length} court${list.length === 1 ? "" : "s"}` : "…"}
                    </span>
                    <BookingStatus active={venue.isActive} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
      {editing && (
        <EditVenueDialog
          key={editing.id}
          venue={editing}
          open
          onOpenChange={(open) => !open && setEditing(null)}
          onSaved={() =>
            client.invalidateQueries({
              queryKey: ["venues", editing.organisationId],
            })
          }
        />
      )}
      {deleting && (
        <DeleteVenueDialog
          key={deleting.id}
          venue={deleting}
          courts={courts[venues.indexOf(deleting)]?.data?.length ?? 0}
          onClose={() => setDeleting(null)}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// One venue
// ---------------------------------------------------------------------------

export function VenueDetailPage({ venueId }: { venueId: string }) {
  const client = useQueryClient();
  const { venues, loading } = useAllVenues();
  const venue = venues.find((v) => v.id === venueId);
  const { manager } = useRole(venue);
  // The top bar reads "Venues & courts › Green Arena" instead of the venue's id.
  useBreadcrumbLabel(venue?.name ?? null);
  const courts = useCourts(venue?.id);
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [courtDialog, setCourtDialog] = useState<{
    open: boolean;
    court: Court | null;
  }>({ open: false, court: null });
  const photos = useQuery({
    queryKey: ["photos", venue?.id],
    queryFn: () => api<{ id: string; url: string }[]>(`/venues/${venue!.id}/photos`),
    enabled: Boolean(venue),
    retry: false,
  });

  if (loading) return <VenueDetailSkeleton />;
  if (!venue) {
    return (
      <div className="flex flex-col items-start gap-3">
        <p className="text-sm text-muted-foreground">
          This venue doesn&apos;t exist, or you don&apos;t have access to it.
        </p>
        <Link href="/venues" className="text-sm text-primary hover:underline">
          Back to venues
        </Link>
      </div>
    );
  }

  const refreshVenue = () =>
    client.invalidateQueries({ queryKey: ["venues", venue.organisationId] });

  const toggleVenue = async () => {
    try {
      await api(`/venues/${venue.id}`, {
        method: "PATCH",
        body: { isActive: !venue.isActive },
      });
      await refreshVenue();
    } catch (error) {
      toast.add({
        type: "error",
        title: "Couldn't change the venue",
        description: errorText(error),
      });
    }
  };

  const toggleCourt = async (court: Court) => {
    try {
      await api(`/courts/${court.id}`, {
        method: "PATCH",
        body: { isActive: !court.isActive },
      });
      await client.invalidateQueries({ queryKey: ["courts", venue.id] });
    } catch (error) {
      toast.add({
        type: "error",
        title: "Couldn't change the court",
        description: errorText(error),
      });
    }
  };

  const link = `yoorker.com/${venue.slug}`;
  const list = courts.data ?? [];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={venue.name}
        description={[venue.address, venue.pincode].filter(Boolean).join(" ")}
        meta={<LiveBadge />}
        actions={
          <>
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={venue.isActive} disabled={!manager} onCheckedChange={toggleVenue} />
              Taking bookings
            </label>
            {manager && (
              <Button variant="outline" onClick={() => setEditing(true)}>
                <PencilIcon data-icon="inline-start" />
                Edit
              </Button>
            )}
            {manager && (
              <Button
                variant="outline"
                className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                onClick={() => setDeleting(true)}
              >
                <Trash2Icon data-icon="inline-start" />
                Delete
              </Button>
            )}
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <VenueMap lat={venue.location.lat} lng={venue.location.lng} className="min-h-64" />
        <Widget>
          <dl className="flex flex-col gap-5 px-(--card-spacing) text-sm">
            <div className="flex flex-col gap-1.5">
              <dt className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                Booking link
              </dt>
              <dd className="flex items-center gap-2">
                <LinkIcon className="size-4 text-muted-foreground" />
                <span className="font-medium">{link}</span>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label="Copy booking link"
                  onClick={async () => {
                    await navigator.clipboard.writeText(`https://${link}`);
                    toast.add({ type: "success", title: "Link copied" });
                  }}
                >
                  <CopyIcon />
                </Button>
              </dd>
            </div>
            <div className="flex flex-col gap-1.5">
              <dt className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                Location
              </dt>
              <dd className="flex flex-col gap-0.5">
                <span className="font-medium">
                  {[venue.locality, venue.city.name, venue.city.state].filter(Boolean).join(", ")}
                </span>
                <span className="font-mono text-xs text-muted-foreground tabular-nums">
                  {venue.location.lat.toFixed(5)}, {venue.location.lng.toFixed(5)} ·{" "}
                  {zoneLabel(venue.timezone)}
                </span>
              </dd>
            </div>
            <div className="flex flex-col gap-1.5">
              <dt className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                Amenities
              </dt>
              <dd className="flex flex-wrap gap-1.5">
                {venue.amenities.length ? (
                  venue.amenities.map((a) => (
                    <Badge key={a} variant="outline">
                      {a}
                    </Badge>
                  ))
                ) : (
                  <span className="text-muted-foreground">None added</span>
                )}
              </dd>
            </div>
            {venue.rules.length > 0 && (
              <div className="flex flex-col gap-1.5">
                <dt className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  Rules for players
                </dt>
                <dd>
                  <ul className="flex flex-col gap-1 text-muted-foreground">
                    {venue.rules.map((r) => (
                      <li key={r}>{r}</li>
                    ))}
                  </ul>
                </dd>
              </div>
            )}
          </dl>
        </Widget>
      </div>

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">
            Courts{" "}
            <span className="font-normal text-muted-foreground tabular-nums">{list.length}</span>
          </h2>
          {manager && (
            <Button onClick={() => setCourtDialog({ open: true, court: null })}>
              <PlusIcon data-icon="inline-start" />
              Add court
            </Button>
          )}
        </div>
        <Widget className="py-2">
          <div className="overflow-x-auto px-[calc(var(--card-spacing)-0.75rem)]">
            <Table className="min-w-[44rem] table-fixed [&_td]:px-3 [&_td]:py-3.5 [&_td:first-child]:rounded-s-lg [&_td:last-child]:rounded-e-lg [&_th]:h-11 [&_th]:px-3">
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-[20%]">Court</TableHead>
                  <TableHead className="w-[30%]">Sports</TableHead>
                  <TableHead className="w-[18%]">Surface</TableHead>
                  <TableHead className="w-[14%]">Capacity</TableHead>
                  <TableHead className="w-[11%]">Bookings</TableHead>
                  <TableHead className="w-[7%]">
                    <span className="sr-only">Edit</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {courts.isLoading && (
                  <TableRow>
                    <TableCell colSpan={6}>
                      <Skeleton className="h-8" />
                    </TableCell>
                  </TableRow>
                )}
                {!courts.isLoading && list.length === 0 && (
                  <TableRow className="hover:bg-transparent">
                    <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                      No courts yet. Add the first one to start taking bookings.
                    </TableCell>
                  </TableRow>
                )}
                {list.map((court) => (
                  <TableRow key={court.id} className="border-border/60 hover:bg-muted/40">
                    <TableCell className="truncate font-medium">{court.name}</TableCell>
                    <TableCell>
                      <span className="flex flex-wrap gap-1">
                        {court.sports.map((s) => (
                          <Badge key={s} variant="secondary">
                            {SPORT_LABEL[s]}
                          </Badge>
                        ))}
                      </span>
                    </TableCell>
                    <TableCell>{SURFACE_LABEL[court.surface]}</TableCell>
                    <TableCell className="tabular-nums">{court.capacity} players</TableCell>
                    <TableCell>
                      <Switch
                        checked={court.isActive}
                        disabled={!manager}
                        onCheckedChange={() => toggleCourt(court)}
                        aria-label={`${court.name} takes bookings`}
                      />
                    </TableCell>
                    <TableCell className="text-end">
                      {manager && (
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Edit ${court.name}`}
                          onClick={() => setCourtDialog({ open: true, court })}
                        >
                          <PencilIcon />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Widget>
      </section>

      <Widget>
        <WidgetHeader title="Photos" icon={ImageIcon} />
        <div className="px-(--card-spacing) text-sm text-muted-foreground">
          {photos.data && photos.data.length > 0 ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {photos.data.map((p) => (
                <img
                  key={p.id}
                  src={p.url}
                  alt=""
                  className="aspect-video rounded-lg object-cover"
                />
              ))}
            </div>
          ) : (
            <p>
              No photos yet.
              {DEV_NOTES &&
                " Uploads go straight from the browser to Cloudflare R2 (TURF-103); the upload screen comes with the real dashboard, once this demo's address is added to the bucket's CORS list."}
            </p>
          )}
        </div>
      </Widget>

      {deleting && (
        <DeleteVenueDialog venue={venue} courts={list.length} onClose={() => setDeleting(false)} />
      )}
      <EditVenueDialog
        key={`${venue.id}-${editing}`}
        venue={venue}
        open={editing}
        onOpenChange={setEditing}
        onSaved={refreshVenue}
      />
      <CourtDialog
        key={`${courtDialog.court?.id ?? "new"}-${courtDialog.open}`}
        venueId={venue.id}
        court={courtDialog.court}
        open={courtDialog.open}
        onOpenChange={(open) => setCourtDialog((d) => ({ ...d, open }))}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Dialogs
// ---------------------------------------------------------------------------

/** The ⋯ menu on a venue card. */
function VenueMenu({
  venue,
  onEdit,
  onDelete,
}: {
  venue: Venue;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="secondary"
            size="icon-sm"
            aria-label={`Options for ${venue.name}`}
            className="bg-card/90 shadow-sm backdrop-blur-sm"
          />
        }
      >
        <EllipsisIcon />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuItem onClick={onEdit}>
          <PencilIcon />
          Edit details
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onClick={onDelete}>
          <Trash2Icon />
          Delete venue
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * Deleting needs the venue's name typed in, since it removes its courts, prices and blocks.
 * The API has no delete yet, so for now the venue is hidden on this device.
 */
function DeleteVenueDialog({
  venue,
  courts,
  onClose,
}: {
  venue: Venue;
  courts: number;
  onClose: () => void;
}) {
  const router = useRouter();
  const remove = useRemovedVenues((state) => state.remove);
  const { venueId, choose } = useVenueChoice();
  const { venues } = useAllVenues();
  const [typed, setTyped] = useState("");
  const matches = typed.trim().toLowerCase() === venue.name.trim().toLowerCase();

  const confirm = () => {
    remove(venue.id);
    // If the sidebar was on this venue, move it to another one.
    const next = venues.find((v) => v.id !== venue.id);
    if (venueId === venue.id && next) choose(next.id);
    toast.add({
      type: "success",
      title: `${venue.name} deleted`,
      description: "Players can no longer find or book it.",
    });
    onClose();
    router.push("/venues");
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Delete {venue.name}?</DialogTitle>
          <DialogDescription>
            This can&apos;t be undone. Players lose its booking page straight away.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <ul className="flex flex-col gap-1.5 rounded-lg bg-destructive/10 px-4 py-3 text-sm">
            <li>
              {courts} court{courts === 1 ? "" : "s"}, with their hours and prices
            </li>
            <li>All blocks and photos</li>
            <li>Its booking link, yoorker.com/{venue.slug}</li>
          </ul>
          <p className="text-xs text-muted-foreground">
            Past bookings and payouts stay in your reports. To stop bookings for a while instead,
            turn off <strong>Taking bookings</strong> on the venue page.
          </p>
          <div className="flex flex-col gap-2">
            <Label htmlFor="delete-confirm">
              Type{" "}
              <span className="font-semibold text-destructive">&ldquo;{venue.name}&rdquo;</span> to
              confirm
            </Label>
            <Input
              id="delete-confirm"
              autoComplete="off"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="destructive" disabled={!matches} onClick={confirm}>
            Delete venue
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** One item per line, blanks dropped. */
const lines = (text: string) =>
  text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

function EditVenueDialog({
  venue,
  open,
  onOpenChange,
  onSaved,
}: {
  venue: Venue;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => Promise<unknown>;
}) {
  const [name, setName] = useState(venue.name);
  const [address, setAddress] = useState(venue.address);
  const [locality, setLocality] = useState(venue.locality ?? "");
  const [pincode, setPincode] = useState(venue.pincode ?? "");
  const [amenities, setAmenities] = useState(venue.amenities.join(", "));
  const [rules, setRules] = useState(venue.rules.join("\n"));
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      await api(`/venues/${venue.id}`, {
        method: "PATCH",
        body: {
          name: name.trim(),
          address: address.trim(),
          locality: locality.trim() || null,
          pincode: pincode.trim() || null,
          amenities: amenities
            .split(",")
            .map((a) => a.trim())
            .filter(Boolean),
          rules: lines(rules),
        },
      });
      await onSaved();
      toast.add({ type: "success", title: "Venue saved" });
      onOpenChange(false);
    } catch (error) {
      toast.add({
        type: "error",
        title: "Couldn't save the venue",
        description: errorText(error),
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit venue</DialogTitle>
          <DialogDescription>Players see these details on the venue page.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="venue-name">Name</Label>
            <Input id="venue-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="venue-address">Address</Label>
            <Input
              id="venue-address"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="venue-locality">Area</Label>
              <Input
                id="venue-locality"
                placeholder="Sector 57"
                value={locality}
                onChange={(e) => setLocality(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="venue-pincode">PIN code</Label>
              <Input
                id="venue-pincode"
                inputMode="numeric"
                value={pincode}
                onChange={(e) => setPincode(e.target.value)}
                className="font-mono tabular-nums"
              />
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="venue-amenities">Amenities</Label>
            <Input
              id="venue-amenities"
              placeholder="Parking, Floodlights, Washroom"
              value={amenities}
              onChange={(e) => setAmenities(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">Separate with commas.</p>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="venue-rules">Rules for players</Label>
            <Textarea
              id="venue-rules"
              rows={3}
              placeholder="One rule per line"
              value={rules}
              onChange={(e) => setRules(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={busy || !name.trim() || !address.trim()} onClick={save}>
            Save changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Add a court, or edit one when `court` is given. */
function CourtDialog({
  venueId,
  court,
  open,
  onOpenChange,
}: {
  venueId: string;
  court: Court | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const client = useQueryClient();
  const [name, setName] = useState(court?.name ?? "");
  const [sports, setSports] = useState<Sport[]>(court?.sports ?? ["FOOTBALL"]);
  const [surface, setSurface] = useState<Surface>(court?.surface ?? "ARTIFICIAL_TURF");
  const [capacity, setCapacity] = useState(court?.capacity ?? 14);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    const body = { name: name.trim(), sports, surface, capacity };
    try {
      if (court) {
        await api<Court>(`/courts/${court.id}`, { method: "PATCH", body });
      } else {
        await api<Court>(`/venues/${venueId}/courts`, { body });
      }
      await client.invalidateQueries({ queryKey: ["courts", venueId] });
      toast.add({
        type: "success",
        title: court ? `${body.name} saved` : `${body.name} added`,
        description: court ? undefined : "Set its hours and prices in Availability & pricing.",
      });
      onOpenChange(false);
    } catch (error) {
      toast.add({
        type: "error",
        title: court ? "Couldn't save the court" : "Couldn't add the court",
        description: errorText(error),
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{court ? `Edit ${court.name}` : "Add a court"}</DialogTitle>
          <DialogDescription>
            A court is one bookable playing area. One court can host several sports.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="court-name">Name</Label>
            <Input
              id="court-name"
              placeholder="Turf 3"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label>Sports</Label>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {(Object.keys(SPORT_LABEL) as Sport[]).map((sport) => (
                <label key={sport} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={sports.includes(sport)}
                    onCheckedChange={(checked) =>
                      setSports((list) =>
                        checked ? [...list, sport] : list.filter((s) => s !== sport),
                      )
                    }
                  />
                  {SPORT_LABEL[sport]}
                </label>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="surface">Surface</Label>
              <NativeSelect
                id="surface"
                value={surface}
                onChange={(e) => setSurface(e.target.value as Surface)}
                className="w-full"
              >
                {(Object.keys(SURFACE_LABEL) as Surface[]).map((s) => (
                  <NativeSelectOption key={s} value={s}>
                    {SURFACE_LABEL[s]}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="capacity">Players</Label>
              <Input
                id="capacity"
                type="number"
                min={1}
                max={50}
                value={capacity}
                onChange={(e) => setCapacity(Number(e.target.value))}
              />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={busy || !name.trim() || sports.length === 0} onClick={save}>
            {court ? "Save changes" : "Add court"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
