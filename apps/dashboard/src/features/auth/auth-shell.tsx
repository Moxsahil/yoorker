import { CheckIcon } from "lucide-react";

import { Link } from "@/kit/framework";
import { BrandCredit, BrandLogo } from "@/components/chronicle/brand-logo";
import { DEV_NOTES } from "@/lib/dev-notes";

const POINTS = [
  "Online bookings, walk-ins and cash on one calendar",
  "Your own hours, slot lengths and prices for every court",
  "Know what each court is doing right now",
];
const PANEL = "/auth/panel.webp";
const DEMO_NOTE = "Local demo: sign in with your mobile. The code is printed in the API terminal.";

/**
 * Chronicle's auth frame: a quiet slate panel beside the form on wide screens,
 * the form alone on small ones. The panel art is one 68 KB webp, no shader.
 */
export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-svh bg-background lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      <aside className="relative isolate hidden flex-col justify-between overflow-hidden bg-(--auth-panel) p-10 text-(--auth-panel-foreground) lg:flex">
        <img
          src={PANEL}
          alt=""
          decoding="async"
          className="absolute inset-0 -z-10 size-full object-cover"
        />
        <Link href="/" className="w-fit">
          <BrandLogo />
        </Link>
        <div className="mt-auto flex max-w-md flex-col gap-6 pb-10">
          <p className="text-3xl leading-tight font-semibold tracking-tight text-balance">
            Run your turf from one screen.
          </p>
          <ul className="flex flex-col gap-3 text-sm opacity-80">
            {POINTS.map((point) => (
              <li key={point} className="flex gap-3">
                <CheckIcon className="mt-0.5 size-4 shrink-0" aria-hidden />
                {point}
              </li>
            ))}
          </ul>
        </div>
        <div className="flex items-end justify-between gap-4 text-xs">
          {DEV_NOTES && <p className="opacity-60">{DEMO_NOTE}</p>}
          <BrandCredit className="text-(--auth-panel-foreground)/70 hover:text-(--auth-panel-foreground)" />
        </div>
      </aside>

      <main className="flex flex-col px-4 py-8 sm:px-8">
        <Link href="/" className="w-fit lg:hidden">
          <BrandLogo />
        </Link>
        <div className="flex flex-1 items-center justify-center py-10">
          <div className="w-full max-w-sm">{children}</div>
        </div>
        <div className="flex flex-col items-center gap-2 lg:hidden">
          {DEV_NOTES && <p className="text-center text-xs text-muted-foreground">{DEMO_NOTE}</p>}
          <BrandCredit />
        </div>
      </main>
    </div>
  );
}

export function AuthHeader({
  title,
  description,
}: {
  title: string;
  description: React.ReactNode;
}) {
  return (
    <div className="mb-8 flex flex-col gap-2">
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      <p className="text-sm text-muted-foreground">{description}</p>
    </div>
  );
}
