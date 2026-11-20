import type { AnchorHTMLAttributes, ReactNode, Ref } from "react";

/**
 * The contract between the Kit and the app's router. Kit files import routing
 * only from `kit/framework`, never from `react-router` directly.
 */

/** An in-app link: an anchor with a string href, routed client-side. */
export interface KitLinkProps extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> {
  href: string;
  /** Replace the current history entry instead of adding one. */
  replace?: boolean;
  ref?: Ref<HTMLAnchorElement>;
}

export type KitLink = (props: KitLinkProps) => ReactNode;

/**
 * Navigation. An href is an app path, or an absolute URL such as `https://…`
 * (a full page load).
 */
export interface KitRouter {
  push(href: string): void;
  replace(href: string): void;
  back(): void;
}
