import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/kit/ui-patterns/page-header";
import { Widget } from "@/kit/widgets/widget";
import { cn } from "@/lib/utils";

function Header({
  title,
  description,
  actions = 1,
}: {
  title?: string;
  description?: string;
  actions?: number;
}) {
  return (
    <PageHeader
      title={title ?? <Skeleton className="h-8 w-56" />}
      description={description ?? <Skeleton className="mt-1 h-4 w-80 max-w-full" />}
      actions={
        actions > 0 && (
          <>
            {Array.from({ length: actions }, (_, i) => (
              <Skeleton
                key={i}
                className={cn("h-8 rounded-lg", i === actions - 1 ? "w-32" : "w-28")}
              />
            ))}
          </>
        )
      }
    />
  );
}

function Filter() {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {[16, 20, 20, 24, 28].map((w, i) => (
        <Skeleton key={i} className="h-8 rounded-lg" style={{ width: `${w * 0.25}rem` }} />
      ))}
    </div>
  );
}

function Stats({ count, className }: { count: number; className?: string }) {
  return (
    <div className={cn("grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5", className)}>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="flex flex-col gap-3 rounded-xl border bg-card p-4">
          <div className="flex items-center justify-between">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="size-8 rounded-lg" />
          </div>
          <Skeleton className="h-7 w-24" />
          <Skeleton className="h-3 w-32 max-w-full" />
        </div>
      ))}
    </div>
  );
}

function Card({ className, children }: { className?: string; children?: React.ReactNode }) {
  return (
    <Widget className={className}>
      <div className="flex items-center gap-2 px-(--card-spacing)">
        <Skeleton className="size-4 rounded" />
        <Skeleton className="h-4 w-36" />
      </div>
      <div className="flex flex-col gap-3 px-(--card-spacing)">{children}</div>
    </Widget>
  );
}

function Chart({ height = "h-56" }: { height?: string }) {
  const bars = [55, 70, 40, 85, 60, 75, 45, 90, 65, 50, 80, 70];
  return (
    <>
      <Skeleton className="h-8 w-32" />
      <Skeleton className="h-3 w-48" />
      <div className={cn("flex items-end gap-2 pt-2", height)}>
        {bars.map((h, i) => (
          <Skeleton
            key={i}
            className="flex-1 rounded-t-md rounded-b-none"
            style={{ height: `${h}%` }}
          />
        ))}
      </div>
    </>
  );
}

function List({ rows = 5 }: { rows?: number }) {
  return (
    <div className="flex flex-col divide-y divide-border/60">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-3 py-3">
          <Skeleton className="size-9 shrink-0 rounded-full" />
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <Skeleton className="h-4 w-2/5" />
            <Skeleton className="h-3 w-3/5" />
          </div>
          <Skeleton className="h-4 w-14" />
        </div>
      ))}
    </div>
  );
}

function Table({ rows = 8, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div className="flex flex-col">
      <div className="flex gap-4 border-b pb-3">
        {Array.from({ length: cols }, (_, c) => (
          <Skeleton key={c} className={cn("h-3", c === 0 ? "w-1/4" : "flex-1")} />
        ))}
      </div>
      {Array.from({ length: rows }, (_, r) => (
        <div
          key={r}
          className="flex items-center gap-4 border-b border-border/60 py-3.5 last:border-0"
        >
          <div className={cn("flex items-center gap-3", "w-1/4")}>
            <Skeleton className="size-8 shrink-0 rounded-full" />
            <Skeleton className="h-4 flex-1" />
          </div>
          {Array.from({ length: cols - 1 }, (_, c) => (
            <Skeleton
              key={c}
              className="h-4 flex-1"
              style={{ maxWidth: `${60 + ((r + c) % 4) * 10}%` }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

function Toolbar() {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <Skeleton className="h-8 w-64 max-w-full rounded-lg" />
      <div className="flex gap-2">
        <Skeleton className="h-8 w-24 rounded-lg" />
        <Skeleton className="h-8 w-24 rounded-lg" />
      </div>
    </div>
  );
}

function Grid({ cols = 4, rows = 10 }: { cols?: number; rows?: number }) {
  return (
    <div className="flex flex-col gap-1.5">
      {Array.from({ length: rows }, (_, r) => (
        <div key={r} className="flex items-center gap-1.5">
          <Skeleton className="h-3 w-10 shrink-0" />
          {Array.from({ length: cols }, (_, c) => (
            <Skeleton
              key={c}
              className={cn("h-9 flex-1 rounded-md", (r * 3 + c) % 5 === 0 && "bg-primary/15")}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

function Page({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-6" role="status" aria-busy="true" aria-label="Loading">
      {children}
    </div>
  );
}

export function OverviewSkeleton() {
  return (
    <Page>
      <Header actions={2} />
      <Filter />
      <Stats count={5} />
      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <Chart />
        </Card>
        <Card>
          <List rows={5} />
        </Card>
      </div>
      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <Table rows={4} cols={5} />
        </Card>
        <Card>
          <List rows={4} />
        </Card>
      </div>
    </Page>
  );
}

export function BookingsSkeleton() {
  return (
    <Page>
      <Header
        title="Bookings"
        description="Every booking has two labels: what happened to the booking, and to the money."
        actions={2}
      />
      <Toolbar />
      <Widget className="px-(--card-spacing)">
        <Grid cols={5} rows={12} />
      </Widget>
    </Page>
  );
}

export function LiveSkeleton() {
  return (
    <Page>
      <Header
        title="Live board"
        description="What every court is doing right now. Updates every 30 seconds."
      />
      <Widget className="py-4">
        <div className="flex flex-wrap gap-6 px-(--card-spacing)">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="flex flex-col gap-2">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-6 w-12" />
            </div>
          ))}
        </div>
      </Widget>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 3 }, (_, i) => (
          <Widget key={i}>
            <div className="flex items-center justify-between px-(--card-spacing)">
              <Skeleton className="h-5 w-28" />
              <Skeleton className="h-5 w-16 rounded-full" />
            </div>
            <Skeleton className="mx-(--card-spacing) h-36 rounded-xl" />
            <div className="flex flex-col gap-2 px-(--card-spacing)">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
            </div>
            <Skeleton className="mx-(--card-spacing) h-6" />
          </Widget>
        ))}
      </div>
    </Page>
  );
}

export function VenuesSkeleton() {
  return (
    <Page>
      <Header title="Venues & courts" actions={1} />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 3 }, (_, i) => (
          <Widget key={i} className="pt-0">
            <Skeleton className="h-36 rounded-none rounded-t-2xl" />
            <div className="flex flex-col gap-2 px-(--card-spacing)">
              <Skeleton className="h-5 w-2/3" />
              <Skeleton className="h-4 w-1/2" />
            </div>
            <div className="flex gap-2 px-(--card-spacing)">
              <Skeleton className="h-5 w-16 rounded-full" />
              <Skeleton className="h-5 w-20 rounded-full" />
            </div>
          </Widget>
        ))}
      </div>
    </Page>
  );
}

export function VenueDetailSkeleton() {
  return (
    <Page>
      <Header actions={2} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Skeleton className="min-h-64 rounded-2xl" />
        <Card>
          {Array.from({ length: 5 }, (_, i) => (
            <div key={i} className="flex justify-between gap-4">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-40" />
            </div>
          ))}
        </Card>
      </div>
      <Card>
        <List rows={3} />
      </Card>
    </Page>
  );
}

export function AvailabilitySkeleton() {
  return (
    <Page>
      <Header
        title="Availability & pricing"
        description="Opening hours, booking lengths, prices and blocks for each court."
        actions={2}
      />
      <Card>
        <Grid cols={7} rows={10} />
      </Card>
      <div className="grid gap-4 xl:grid-cols-3">
        <Card>
          <List rows={3} />
        </Card>
        <Card className="xl:col-span-2">
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
            {Array.from({ length: 12 }, (_, i) => (
              <Skeleton key={i} className="h-14 rounded-lg" />
            ))}
          </div>
        </Card>
      </div>
    </Page>
  );
}

export function CustomersSkeleton() {
  return (
    <Page>
      <Header
        title="Customers"
        description="Everyone who has played here in the last 60 days, best customers first."
        actions={1}
      />
      <Card>
        <Table rows={8} cols={6} />
      </Card>
    </Page>
  );
}

export function StaffSkeleton() {
  return (
    <Page>
      <Header
        title="Staff"
        description="Your team, what each person can open, and their attendance for salary."
        actions={1}
      />
      <Skeleton className="h-9 w-48 rounded-lg" />
      <Card>
        <Table rows={5} cols={5} />
      </Card>
    </Page>
  );
}

export function EarningsSkeleton() {
  return (
    <Page>
      <Header
        title="Earnings & payouts"
        description="What players paid, Yoorker's commission and what reaches your bank."
        actions={1}
      />
      <Filter />
      <Card>
        <div className="grid gap-x-10 gap-y-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
          <div className="flex flex-col gap-4">
            {Array.from({ length: 4 }, (_, i) => (
              <div key={i} className="flex justify-between">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-4 w-20" />
              </div>
            ))}
          </div>
          <Chart height="h-40" />
        </div>
      </Card>
      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <Table rows={6} cols={5} />
        </Card>
        <Card>
          <List rows={4} />
        </Card>
      </div>
    </Page>
  );
}

export function OffersSkeleton() {
  return (
    <Page>
      <Header
        title="Offers & discounts"
        description="Fill quiet hours and bring players back with discounts you control."
        actions={1}
      />
      <Stats count={3} className="sm:grid-cols-3 md:grid-cols-3 xl:grid-cols-3" />
      <Card>
        <Table rows={5} cols={5} />
      </Card>
    </Page>
  );
}

export function AnalyticsSkeleton() {
  return (
    <Page>
      <Header
        title="Analytics"
        description="When players come, what they book and what earns the most."
        actions={0}
      />
      <Filter />
      <Stats count={4} className="sm:grid-cols-2 md:grid-cols-2 xl:grid-cols-4" />
      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <Chart />
        </Card>
        <Card>
          <Grid cols={6} rows={7} />
        </Card>
      </div>
      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <Chart height="h-40" />
        </Card>
        <Card>
          <List rows={4} />
        </Card>
      </div>
    </Page>
  );
}

export function ReviewsSkeleton() {
  return (
    <Page>
      <Header
        title="Reviews"
        description="What players say after they play. Replies show on your venue page."
        actions={0}
      />
      <Card>
        <div className="flex flex-wrap items-center gap-8">
          <div className="flex flex-col gap-2">
            <Skeleton className="h-10 w-16" />
            <Skeleton className="h-4 w-24" />
          </div>
          <div className="flex min-w-48 flex-1 flex-col gap-2">
            {Array.from({ length: 5 }, (_, i) => (
              <Skeleton
                key={i}
                className="h-2.5 rounded-full"
                style={{ width: `${90 - i * 16}%` }}
              />
            ))}
          </div>
        </div>
      </Card>
      <Card>
        <List rows={4} />
      </Card>
    </Page>
  );
}

export function MarketingSkeleton() {
  return (
    <Page>
      <Header
        title="Marketing"
        description="Bring players back with WhatsApp and SMS campaigns, and share your booking link."
        actions={1}
      />
      <Stats count={4} className="sm:grid-cols-2 md:grid-cols-2 xl:grid-cols-4" />
      <Card>
        <Table rows={4} cols={5} />
      </Card>
      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <Skeleton className="h-10 rounded-lg" />
          <Skeleton className="h-24 rounded-lg" />
        </Card>
        <Card>
          <List rows={3} />
        </Card>
      </div>
    </Page>
  );
}

export function SettingsSkeleton() {
  return (
    <Page>
      <Header
        title="Settings"
        description="Your business details, money, rules for players and account security."
        actions={0}
      />
      <div className="grid items-start gap-6 lg:grid-cols-[13rem_minmax(0,1fr)]">
        <div className="flex flex-col gap-1.5">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-8 rounded-lg" />
          ))}
        </div>
        <Card>
          <div className="grid gap-4 sm:grid-cols-2">
            {Array.from({ length: 6 }, (_, i) => (
              <div key={i} className="flex flex-col gap-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-8 rounded-lg" />
              </div>
            ))}
          </div>
        </Card>
      </div>
    </Page>
  );
}

export function GenericSkeleton() {
  return (
    <Page>
      <Header actions={0} />
      <Card>
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-8 rounded-lg" />
        ))}
      </Card>
    </Page>
  );
}
