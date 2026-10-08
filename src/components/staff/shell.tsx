import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import {
  Boxes,
  ClipboardList,
  History,
  LayoutDashboard,
  Package,
  Palette,
  Tags,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type NavItem = {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  end?: boolean;
  admin?: boolean;
};

const NAV: NavItem[] = [
  { to: "/staff", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/staff/orders", label: "Orders", icon: ClipboardList },
  { to: "/staff/products", label: "Products", icon: Package },
  { to: "/staff/categories", label: "Categories", icon: Tags },
  { to: "/staff/inventory", label: "Inventory", icon: Boxes },
  { to: "/staff/customization", label: "Customization", icon: Palette },
  { to: "/staff/activity", label: "Activity", icon: History },
  { to: "/staff/team", label: "Team", icon: Users, admin: true },
];

const itemClass =
  "flex items-center gap-2 rounded-xl px-3.5 py-2.5 text-sm font-medium whitespace-nowrap text-muted-foreground transition-colors hover:bg-muted hover:text-foreground";

/**
 * Shell for every hub page: identity + role up top, sidebar navigation on
 * large screens (horizontal scroller on mobile) and the page itself.
 */
export function StaffShell({ role, children }: { role: "admin" | "staff"; children: ReactNode }) {
  const items = NAV.filter((item) => !item.admin || role === "admin");
  return (
    <div className="page-content wrap">
      <header className="mb-7 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="m-0 text-2xl">Store hub</h1>
          <span
            className={cn(
              "rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize",
              role === "admin"
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground",
            )}
          >
            {role}
          </span>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link to="/">View storefront</Link>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link to="/account">Account</Link>
          </Button>
        </div>
      </header>

      <div className="grid gap-8 lg:grid-cols-[13.5rem_minmax(0,1fr)]">
        <nav aria-label="Store hub" className="lg:sticky lg:top-6 lg:self-start">
          <ul className="flex gap-2 overflow-x-auto pb-2 lg:flex-col lg:overflow-visible lg:pb-0">
            {items.map((item) => {
              const base = itemClass;
              const active = cn(base, "bg-primary text-primary-foreground shadow-sm");
              return (
                <li key={item.to}>
                  <Link
                    to={item.to as "/staff"}
                    {...(item.end ? { activeOptions: { exact: true } } : {})}
                    className={base}
                    activeProps={{ className: active }}
                  >
                    <item.icon className="size-4 shrink-0" aria-hidden />
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
        <div className="min-w-0">{children}</div>
      </div>
    </div>
  );
}
