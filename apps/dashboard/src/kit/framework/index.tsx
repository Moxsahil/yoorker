import { useMemo } from "react";
import {
  Link as RouterLink,
  useLocation,
  useNavigate,
  useSearchParams as useRouterSearchParams,
} from "react-router";

import type { KitLinkProps, KitRouter } from "./types";

export type { KitLink, KitLinkProps, KitRouter } from "./types";

/*
 * The React Router adapter: the Kit's routing contract (./types) on top of
 * react-router, so Kit files never import a router directly.
 */

/** An in-app link. Absolute URLs (https://…) leave the app with a full page load. */
export function Link({ href, ...props }: KitLinkProps) {
  if (/^[a-z]+:/i.test(href)) {
    return <a href={href} {...props} />;
  }
  return <RouterLink to={href} {...props} />;
}

export function usePathname(): string {
  return useLocation().pathname;
}

export function useRouter(): KitRouter {
  const navigate = useNavigate();
  return useMemo(
    () => ({
      push: (href) => navigate(href),
      replace: (href) => navigate(href, { replace: true }),
      back: () => navigate(-1),
    }),
    [navigate],
  );
}

/** The current query string, read-only. Writes go through nuqs. */
export function useSearchParams(): URLSearchParams {
  return useRouterSearchParams()[0];
}
