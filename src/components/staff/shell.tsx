import { useEffect, useState, type ReactNode } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import {
  Boxes,
  ClipboardList,
  History,
  LayoutDashboard,
  Mail,
  MoreHorizontal,
  Package,
  Palette,
  Tags,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
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
  { to: "/admin/emails", label: "Emails", icon: Mail, admin: true },
];

/** The four thumb-sized slots in the mobile bottom bar; the rest live under More. */
const PRIMARY_TABS = ["/staff", "/staff/orders", "/staff/products"];

const itemClass =
  "flex items-center gap-2 rounded-xl px-3.5 py-3 text-sm font-medium whitespace-nowrap text-muted-foreground transition-colors hover:bg-muted hover:text-foreground";

/**
 * Bottom tab bar for the hub on phones — four targets sized for a thumb, with
 * everything else in a bottom sheet. It only renders below 768px (see
 * `.staff-mobile-nav` in `src/styles.css`), where the sidebar collapses to a
 * horizontal scroller that would otherwise compete for the same screen space.
 */
function StaffMobileNav({ items }: { items: NavItem[] }) {
  const [open, setOpen] = useState(false);
  const pathname = useRouterState({ select: (state) => state.location.pathname });

  // Navigating by any route (including Back) closes the sheet.
  useEffect(() => setOpen(false), [pathname]);

  const isActive = (item: NavItem) =>
    item.end ? pathname === item.to : pathname === item.to || pathname.startsWith(`${item.to}/`);
  const primary = items.filter((item) => PRIMARY_TABS.includes(item.to));
  const rest = items.filter((item) => !PRIMARY_TABS.includes(item.to));

  return (
    <>
      <nav className="staff-mobile-nav" aria-label="Store hub">
        {primary.map((item) => (
          <Link
            key={item.to}
            to={item.to as "/staff"}
            {...(item.end ? { activeOptions: { exact: true } } : {})}
            data-status={isActive(item) ? "active" : undefined}
          >
            <item.icon aria-hidden />
            <span>{item.label}</span>
          </Link>
        ))}
        <button type="button" aria-expanded={open} onClick={() => setOpen(true)}>
          <MoreHorizontal aria-hidden />
          <span>More</span>
        </button>
      </nav>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" className="max-h-[75vh] overflow-y-auto rounded-t-3xl">
          <SheetHeader>
            <SheetTitle>More</SheetTitle>
            <SheetDescription>The rest of the store hub.</SheetDescription>
          </SheetHeader>
          <ul className="mt-4 grid gap-1">
            {rest.map((item) => (
              <li key={item.to}>
                <Link
                  to={item.to as "/staff"}
                  {...(item.end ? { activeOptions: { exact: true } } : {})}
                  className={itemClass}
                  activeProps={{ className: cn(itemClass, "bg-primary text-primary-foreground") }}
                  onClick={() => setOpen(false)}
                >
                  <item.icon className="size-4 shrink-0" aria-hidden />
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </SheetContent>
      </Sheet>
    </>
  );
}

/**
 * Shell for every hub page: identity + role up top, sidebar navigation on
 * large screens and the page itself. On phones the sidebar is replaced by the
 * bottom tab bar above.
 */
export function StaffShell({ role, children }: { role: "admin" | "staff"; children: ReactNode }) {
  const items = NAV.filter((item) => !item.admin || role === "admin");
  return (
    <div className="page-content wrap staff-shell">
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

      {/* `grid-cols-1` is `minmax(0, 1fr)`, which clamps the content column to
          the screen. A bare `grid` would give it an `auto` track that sizes to
          max-content and lets long order rows push the page sideways. */}
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[13.5rem_minmax(0,1fr)]">
        <nav aria-label="Store hub" className="hidden lg:block lg:sticky lg:top-6 lg:self-start">
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

      <StaffMobileNav items={items} />
    </div>
  );
}
