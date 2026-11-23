import type { LucideIcon } from "lucide-react";
import type { ComponentType } from "react";

export type LogoComponent = ComponentType<{ className?: string }>;

export interface NavLink {
  title: string;
  href: string;
  icon?: LucideIcon;
  badge?: string;
  shortcut?: string;
  items?: NavLink[];
  expandOnly?: boolean;
}

export interface NavGroup {
  label?: string;
  items: NavLink[];
}

export interface Workspace {
  id: string;
  name: string;
  description: string;
  logo: LogoComponent;
}

export interface ShellUser {
  name: string;
  email: string;
  avatar?: string;
  onSignOut?: () => void;
}

export interface ShellConfig {
  brand: { name: string; logo: LogoComponent };
  nav: NavGroup[];
  secondary: NavLink[];
  workspaces: Workspace[];
  workspaceLabels?: { group: string; add: string };
  user: ShellUser;
  activeWorkspaceId?: string;
  onWorkspaceSelect?: (id: string) => void;
  addWorkspaceHref?: string;
}
