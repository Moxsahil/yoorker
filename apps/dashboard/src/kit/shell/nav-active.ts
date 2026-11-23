import type { NavLink } from "./types";

export function isActive(pathname: string, href: string): boolean {
  if (href === "/") {
    return pathname === "/";
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function activeHref(pathname: string, links: NavLink[]): string | null {
  let best: string | null = null;
  const visit = (items: NavLink[]) => {
    for (const link of items) {
      if (isActive(pathname, link.href) && (!best || link.href.length > best.length)) {
        best = link.href;
      }
      if (link.items) {
        visit(link.items);
      }
    }
  };
  visit(links);
  return best;
}
