import { NuqsAdapter } from "nuqs/adapters/react-router/v7";
import { lazy, Suspense, type ComponentType } from "react";
import { createBrowserRouter, Outlet, useParams } from "react-router";

import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/toast";
import { TooltipProvider } from "@/components/ui/tooltip";
import { THEME } from "@/config/theme";
import { AuthShell } from "@/features/auth/auth-shell";
import { ErrorScreen } from "@/features/errors/error-screen";
import { YoorkerShell } from "@/features/shell/yoorker-shell";
import { CustomizerProvider } from "@/kit/customizer/customizer-provider";
import { QueryProvider } from "@/kit/data/query-provider";

/** A page's tab title, "Bookings · Yoorker". React puts <title> in the document head. */
function Title({ children }: { children: string }) {
  return <title>{`${children} · Yoorker`}</title>;
}

/**
 * Each page is its own chunk, loaded when it is first opened. Navigations run as transitions,
 * so the current page stays on screen until the next one is ready.
 */
function page<M>(title: string, load: () => Promise<M>, pick: (module: M) => ComponentType) {
  const Page = lazy(() => load().then((module) => ({ default: pick(module) })));
  return function TitledPage() {
    return (
      <>
        <Title>{title}</Title>
        <Page />
      </>
    );
  };
}

const Overview = page(
  "Overview",
  () => import("@/features/yoorker/overview"),
  (m) => m.OverviewPage,
);
const Bookings = page(
  "Bookings",
  () => import("@/features/yoorker/bookings"),
  (m) => m.BookingsPage,
);
const Live = page(
  "Live board",
  () => import("@/features/yoorker/live"),
  (m) => m.LivePage,
);
const Venues = page(
  "Venues & courts",
  () => import("@/features/yoorker/venues"),
  (m) => m.VenuesPage,
);
const NewVenue = page(
  "Add venue",
  () => import("@/features/yoorker/new-venue"),
  (m) => m.NewVenuePage,
);
const Availability = page(
  "Availability & pricing",
  () => import("@/features/yoorker/availability"),
  (m) => m.AvailabilityPage,
);
const Customers = page(
  "Customers",
  () => import("@/features/yoorker/customers"),
  (m) => m.CustomersPage,
);
const Staff = page(
  "Staff",
  () => import("@/features/yoorker/staff"),
  (m) => m.StaffPage,
);
const Earnings = page(
  "Earnings & payouts",
  () => import("@/features/yoorker/earnings"),
  (m) => m.EarningsPage,
);
const Offers = page(
  "Offers & discounts",
  () => import("@/features/yoorker/offers"),
  (m) => m.OffersPage,
);
const Analytics = page(
  "Analytics",
  () => import("@/features/yoorker/analytics"),
  (m) => m.AnalyticsPage,
);
const Reviews = page(
  "Reviews",
  () => import("@/features/yoorker/reviews"),
  (m) => m.ReviewsPage,
);
const Marketing = page(
  "Marketing",
  () => import("@/features/yoorker/marketing"),
  (m) => m.MarketingPage,
);
const Settings = page(
  "Settings",
  () => import("@/features/yoorker/settings"),
  (m) => m.SettingsPage,
);
const VenueDetail = page(
  "Venue",
  () => import("@/features/yoorker/venues"),
  (m) =>
    function VenueRoute() {
      return <m.VenueDetailPage venueId={useParams().venueId!} />;
    },
);
const SignIn = page(
  "Sign in",
  () => import("@/features/auth/yoorker-sign-in"),
  (m) => m.YoorkerSignIn,
);

/** App-wide providers, inside the router so they can read and write the address. */
function Root() {
  return (
    <ThemeProvider defaultTheme="system">
      <NuqsAdapter>
        <QueryProvider>
          <CustomizerProvider theme={THEME}>
            <TooltipProvider>
              <Toaster>
                <Outlet />
              </Toaster>
            </TooltipProvider>
          </CustomizerProvider>
        </QueryProvider>
      </NuqsAdapter>
    </ThemeProvider>
  );
}

export const router = createBrowserRouter([
  {
    element: <Root />,
    children: [
      {
        path: "sign-in",
        element: (
          <AuthShell>
            <Suspense>
              <SignIn />
            </Suspense>
          </AuthShell>
        ),
      },
      {
        element: (
          <YoorkerShell>
            <Suspense>
              <Outlet />
            </Suspense>
          </YoorkerShell>
        ),
        children: [
          { index: true, element: <Overview /> },
          { path: "bookings", element: <Bookings /> },
          { path: "live", element: <Live /> },
          { path: "venues", element: <Venues /> },
          { path: "venues/new", element: <NewVenue /> },
          { path: "venues/:venueId", element: <VenueDetail /> },
          { path: "availability", element: <Availability /> },
          { path: "customers", element: <Customers /> },
          { path: "staff", element: <Staff /> },
          { path: "earnings", element: <Earnings /> },
          { path: "offers", element: <Offers /> },
          { path: "analytics", element: <Analytics /> },
          { path: "reviews", element: <Reviews /> },
          { path: "marketing", element: <Marketing /> },
          { path: "settings", element: <Settings /> },
        ],
      },
      {
        path: "*",
        element: (
          <>
            <Title>Page not found</Title>
            <ErrorScreen
              code="404"
              title="Page not found"
              description="We could not find that page. It may have moved, or the link may be mistyped."
            />
          </>
        ),
      },
    ],
  },
]);
