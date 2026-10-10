import { useEffect, useState, type ReactNode } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useAuthActions } from "@convex-dev/auth/react";
import {
  Boxes,
  ClipboardList,
  HeartPulse,
  History,
  LayoutDashboard,
  LogOut,
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
import { useSession } from "@/lib/use-session";
import { cn } from "@/lib/utils";

type NavItem = {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  end?: boolean;
  admin?: boolean;
};

/**
 * Grouped so the hub reads the way the work does — selling, the catalogue
 * behind it, then the shop's own settings. Group labels render only in the
 * sidebar; the mobile sheet keeps a flat list, because a thumb does not care.
 */
const NAV_GROUPS: { title: string; items: NavItem[] }[] = [
  {
    title: "Selling",
    items: [
      { to: "/staff", label: "Dashboard", icon: LayoutDashboard, end: true },
      { to: "/staff/orders", label: "Orders", icon: ClipboardList },
    ],
  },
  {
    title: "Catalogue",
    items: [
      { to: "/staff/products", label: "Products", icon: Package },
      { to: "/staff/categories", label: "Categories", icon: Tags },
      { to: "/staff/inventory", label: "Inventory", icon: Boxes },
    ],
  },
  {
    title: "Shop settings",
    items: [
      { to: "/staff/customization", label: "Customization", icon: Palette },
      { to: "/staff/health", label: "Data health", icon: HeartPulse },
      { to: "/staff/activity", label: "Activity", icon: History },
      { to: "/staff/team", label: "Team", icon: Users, admin: true },
      { to: "/admin/emails", label: "Emails", icon: Mail, admin: true },
    ],
  },
];

const NAV: NavItem[] = NAV_GROUPS.flatMap((group) => group.items);

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
 * Shell for every hub page: who is signed in up top with a way out, grouped
 * sidebar navigation on large screens and the page itself. On phones the
 * sidebar is replaced by the bottom tab bar above.
 */
export function StaffShell({ role, children }: { role: "admin" | "staff"; children: ReactNode }) {
  const items = NAV.filter((item) => !item.admin || role === "admin");
  const { profile } = useSession();
  const { signOut } = useAuthActions();
  const navigate = useNavigate();

  const who = profile?.name?.trim() || profile?.email?.trim() || "Staff member";
  const initials = who
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");

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
        <div className="flex flex-wrap items-center gap-3">
          {/* Who is on the till right now — and the door out, so nobody has
              to visit /account just to sign off. */}
          <span className="hidden items-center gap-2.5 sm:flex">
            <span
              aria-hidden
              className="grid size-8 shrink-0 place-items-center rounded-full bg-primary text-xs font-semibold text-primary-foreground"
            >
              {initials || "·"}
            </span>
            <span className="max-w-[14rem] truncate text-sm text-muted-foreground">{who}</span>
          </span>
          <Button variant="outline" size="sm" asChild>
            <Link to="/">View storefront</Link>
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={async () => {
              await signOut();
              void navigate({ to: "/account" });
            }}
          >
            <LogOut aria-hidden />
            Sign out
          </Button>
        </div>
      </header>

      {/* `grid-cols-1` is `minmax(0, 1fr)`, which clamps the content column to
          the screen. A bare `grid` would give it an `auto` track that sizes to
          max-content and lets long order rows push the page sideways. */}
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[13.5rem_minmax(0,1fr)]">
        <nav aria-label="Store hub" className="hidden lg:block lg:sticky lg:top-6 lg:self-start">
          <ul className="flex flex-col gap-5">
            {NAV_GROUPS.map((group) => {
              const groupItems = group.items.filter((item) => !item.admin || role === "admin");
              if (groupItems.length === 0) return null;
              return (
                <li key={group.title}>
                  <p className="mb-1.5 px-3.5 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
                    {group.title}
                  </p>
                  <ul className="flex flex-col gap-1">
                    {groupItems.map((item) => (
                      <li key={item.to}>
                        <Link
                          to={item.to as "/staff"}
                          {...(item.end ? { activeOptions: { exact: true } } : {})}
                          className={itemClass}
                          activeProps={{
                            className: cn(
                              itemClass,
                              "bg-primary text-primary-foreground shadow-sm",
                            ),
                          }}
                        >
                          <item.icon className="size-4 shrink-0" aria-hidden />
                          {item.label}
                        </Link>
                      </li>
                    ))}
                  </ul>
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
