import type { AnchorHTMLAttributes, ReactNode, Ref } from "react";

/**
 * The contract between the Kit and the app's router. Kit files import routing
 * only from `kit/framework`, never from `react-router` directly.
 */

export interface KitLinkProps extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> {
  href: string;
  replace?: boolean;
  ref?: Ref<HTMLAnchorElement>;
}

export type KitLink = (props: KitLinkProps) => ReactNode;

export interface KitRouter {
  push(href: string): void;
  replace(href: string): void;
  back(): void;
}
