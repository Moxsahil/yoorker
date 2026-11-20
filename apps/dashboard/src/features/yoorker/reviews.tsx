import { MessageSquareTextIcon, StarIcon } from "lucide-react";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import { PageHeader } from "@/kit/ui-patterns/page-header";
import { Segmented } from "@/kit/ui-patterns/segmented";
import { StatusBadge } from "@/kit/ui-patterns/status-badge";
import { Widget, WidgetHeader } from "@/kit/widgets/widget";
import { demoReviews, type Review } from "@/lib/demo-team";
import { daysBetween } from "@/lib/period";
import { useCurrentVenue } from "@/lib/session";
import { cn } from "@/lib/utils";
import { dayLabel, todayAt } from "@/lib/yoorker";

import { SampleBadge } from "./common";

type Filter = "all" | "reply" | "low";

const initials = (name: string) =>
  name
    .split(/\s+/)
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

function Stars({ rating, className }: { rating: number; className?: string }) {
  return (
    <span
      className={cn("flex items-center gap-0.5", className)}
      role="img"
      aria-label={`${rating} out of 5 stars`}
    >
      {[1, 2, 3, 4, 5].map((n) => (
        <StarIcon
          key={n}
          className={cn(
            "size-3.5",
            n <= Math.round(rating) ? "fill-warning text-warning" : "fill-muted text-muted",
          )}
        />
      ))}
    </span>
  );
}

const when = (date: string, today: string) => {
  const days = daysBetween(date, today) - 1;
  return days === 0
    ? "Today"
    : days === 1
      ? "Yesterday"
      : days < 7
        ? `${days} days ago`
        : dayLabel(date);
};

function ReviewItem({
  review,
  today,
  onReply,
}: {
  review: Review;
  today: string;
  onReply: (text: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(review.reply ?? "");
  return (
    <li className="flex gap-3 py-5 first:pt-0 last:pb-0">
      <span
        className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium text-muted-foreground"
        aria-hidden
      >
        {initials(review.name)}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <span className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
            <span className="font-medium">{review.name}</span>
            <Stars rating={review.rating} />
          </span>
          <span className="text-xs text-muted-foreground">
            {review.court} · {when(review.date, today)}
          </span>
        </div>
        <p className="text-sm leading-relaxed">{review.text}</p>

        {review.reply && !open && (
          <div className="mt-1 rounded-lg bg-muted/50 px-3 py-2.5">
            <span className="text-xs font-medium text-muted-foreground">Your reply</span>
            <p className="mt-0.5 text-sm">{review.reply}</p>
          </div>
        )}

        {open ? (
          <div className="mt-1 flex flex-col gap-2">
            <Textarea
              rows={3}
              autoFocus
              placeholder="Thank them, or say what you're doing about it. Players see your reply."
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              maxLength={500}
            />
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-muted-foreground tabular-nums">{draft.length}/500</span>
              <span className="flex gap-2">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setDraft(review.reply ?? "");
                    setOpen(false);
                  }}
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  disabled={!draft.trim()}
                  onClick={() => {
                    onReply(draft.trim());
                    setOpen(false);
                  }}
                >
                  Post reply
                </Button>
              </span>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant={review.reply ? "ghost" : "outline"}
              className={cn(review.reply && "-ms-2")}
              onClick={() => setOpen(true)}
            >
              <MessageSquareTextIcon data-icon="inline-start" />
              {review.reply ? "Edit reply" : "Reply"}
            </Button>
            {!review.reply && review.rating <= 3 && (
              <StatusBadge tone="warning">Needs a reply</StatusBadge>
            )}
          </div>
        )}
      </div>
    </li>
  );
}

export function ReviewsPage() {
  const { courts } = useCurrentVenue();
  const today = todayAt();
  const courtNames = useMemo(() => courts.map((c) => c.name), [courts]);
  const [reviews, setReviews] = useState<Review[] | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const list = reviews ?? demoReviews(today, courtNames);

  const average = list.reduce((s, r) => s + r.rating, 0) / list.length;
  const counts = [5, 4, 3, 2, 1].map((n) => list.filter((r) => r.rating === n).length);
  const replied = list.filter((r) => r.reply).length;
  const rows = list.filter((r) =>
    filter === "reply" ? !r.reply : filter === "low" ? r.rating <= 3 : true,
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Reviews"
        description="What players say after they play. Replies show on your venue page."
        meta={<SampleBadge />}
      />

      {/* The summary runs across the top, so nothing sits beside the long list. */}
      <Widget>
        <WidgetHeader title="Rating" icon={StarIcon} />
        <div className="grid gap-6 px-(--card-spacing) md:grid-cols-[auto_minmax(0,1fr)] lg:grid-cols-[auto_minmax(0,34rem)_minmax(0,18rem)] lg:justify-between lg:gap-12">
          <div className="flex flex-col justify-center gap-1.5">
            <span className="font-mono text-5xl font-semibold tracking-tight tabular-nums">
              {average.toFixed(1)}
            </span>
            <Stars rating={average} />
            <span className="text-xs text-muted-foreground">{list.length} reviews</span>
          </div>
          <ul className="flex flex-col justify-center gap-2">
            {counts.map((count, i) => {
              const stars = 5 - i;
              return (
                <li
                  key={stars}
                  className="grid grid-cols-[1.75rem_minmax(0,1fr)_1.5rem] items-center gap-3 text-sm"
                >
                  <span className="flex items-center gap-0.5 text-muted-foreground tabular-nums">
                    {stars}
                    <StarIcon className="size-3 fill-current" />
                  </span>
                  <span className="h-2 overflow-hidden rounded-full bg-muted">
                    <span
                      className="block h-full rounded-full bg-warning"
                      style={{ width: `${(count / list.length) * 100}%` }}
                    />
                  </span>
                  <span className="text-end font-mono text-xs text-muted-foreground tabular-nums">
                    {count}
                  </span>
                </li>
              );
            })}
          </ul>
          <dl className="flex flex-col justify-center divide-y divide-border/60 md:col-span-2 lg:col-span-1">
            <div className="flex items-baseline justify-between gap-3 pb-3">
              <dt className="text-sm text-muted-foreground">You replied to</dt>
              <dd className="font-mono font-medium tabular-nums">
                {replied} of {list.length}
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-3 py-3">
              <dt className="text-sm text-muted-foreground">Waiting for a reply</dt>
              <dd className="font-mono font-medium tabular-nums">{list.length - replied}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-3 pt-3">
              <dt className="text-sm text-muted-foreground">3 stars or less</dt>
              <dd className="font-mono font-medium tabular-nums">
                {list.filter((r) => r.rating <= 3).length}
              </dd>
            </div>
          </dl>
        </div>
      </Widget>

      <Widget>
        <WidgetHeader
          title="All reviews"
          icon={MessageSquareTextIcon}
          action={
            <Segmented<Filter>
              aria-label="Which reviews"
              className="me-2 w-auto"
              value={filter}
              onChange={setFilter}
              options={[
                { value: "all", label: "All" },
                { value: "reply", label: "Not replied" },
                { value: "low", label: "3 stars or less" },
              ]}
            />
          }
        />
        {rows.length === 0 ? (
          <p className="px-(--card-spacing) py-6 text-center text-sm text-muted-foreground">
            Nothing here. You&apos;re all caught up.
          </p>
        ) : (
          <ul className="mx-(--card-spacing) divide-y divide-border/60">
            {rows.map((r) => (
              <ReviewItem
                key={r.id}
                review={r}
                today={today}
                onReply={(text) => {
                  setReviews(list.map((x) => (x.id === r.id ? { ...x, reply: text } : x)));
                  toast.add({
                    type: "success",
                    title: `Reply posted to ${r.name}`,
                  });
                }}
              />
            ))}
          </ul>
        )}
      </Widget>
    </div>
  );
}
