import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { Order } from "@/lib/store";

/** Card container shared by every hub page (matches the store's panel look). */
export function Panel({
  title,
  description,
  actions,
  children,
  className,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("solid-panel mb-6", className)}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-xl">{title}</h2>
          {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
      <div className="mt-5">{children}</div>
    </section>
  );
}

/**
 * Save row shared by every hub form. Below 768px it sticks to the bottom just
 * above the staff tab bar, so the primary action stays reachable no matter how
 * long the form is — the main thing a desktop-only layout gets wrong on a phone.
 */
export function FormActions({
  busy,
  children,
  note,
}: {
  busy?: boolean;
  children: ReactNode;
  note?: ReactNode;
}) {
  return (
    <div className="form-actions" aria-busy={busy || undefined}>
      {note && <p className="text-xs text-muted-foreground">{note}</p>}
      <div className="flex flex-wrap gap-3">{children}</div>
    </div>
  );
}

/** One dashboard number with an optional tone. */
export function Stat({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: ReactNode;
  sub?: string;
  tone?: "success" | "offer" | "plain";
}) {
  return (
    <div className="solid-panel p-5">
      <p className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
        {label}
      </p>
      <p
        className={cn(
          "mt-2 text-3xl font-semibold",
          tone === "success" && "text-success",
          tone === "offer" && "text-offer",
        )}
      >
        {value}
      </p>
      {sub && <p className="mt-1 text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

const STATUS_STYLE: Record<Order["status"], string> = {
  received: "bg-muted text-muted-foreground",
  processing: "bg-link/15 text-link",
  ready: "bg-link/15 text-link",
  dispatched: "bg-link/15 text-link",
  completed: "bg-success/15 text-success",
  cancelled: "bg-destructive/15 text-destructive",
};

const PAYMENT_STYLE: Record<Order["payment_status"], string> = {
  pending: "bg-offer/15 text-offer",
  confirmed: "bg-success/15 text-success",
  rejected: "bg-destructive/15 text-destructive",
};

export function StatusPill({ status }: { status: Order["status"] }) {
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize",
        STATUS_STYLE[status],
      )}
    >
      {status}
    </span>
  );
}

export function PaymentPill({ payment }: { payment: Order["payment_status"] }) {
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize",
        PAYMENT_STYLE[payment],
      )}
    >
      {payment}
    </span>
  );
}

/** Friendly state when a list is empty (or filtered to nothing). */
export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-dashed border-border px-6 py-10 text-center">
      <p className="font-semibold">{title}</p>
      {hint && <p className="mt-1 text-sm text-muted-foreground">{hint}</p>}
    </div>
  );
}

/** Consistent async/error states for hub queries. */
export function QueryState({
  pending,
  error,
  label,
}: {
  pending: boolean;
  error: boolean;
  label: string;
}) {
  if (pending) return <p className="text-sm text-muted-foreground">Loading {label}…</p>;
  if (error) return <p role="alert">{label} could not load. Reload the page to try again.</p>;
  return null;
}
