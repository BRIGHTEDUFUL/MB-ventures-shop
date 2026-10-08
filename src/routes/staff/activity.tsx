import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { convexQueryOptions } from "@/lib/convex";
import { api } from "../../../convex/_generated/api";
import { pageHead } from "@/lib/store";
import { EmptyState, QueryState } from "@/components/staff/bits";

export const Route = createFileRoute("/staff/activity")({
  head: () => pageHead("Activity", "Audit trail of catalogue, settings, stock and team changes."),
  component: ActivityPage,
});

const ACTION_LABEL: Record<string, string> = {
  "product.create": "Product",
  "product.update": "Product",
  "product.delete": "Product",
  "product.bulk": "Products",
  "category.create": "Category",
  "category.update": "Category",
  "category.delete": "Category",
  "inventory.adjust": "Stock",
  "settings.update": "Settings",
  "settings.finance": "Money",
  "role.grant": "Team",
  "role.change": "Team",
  "role.revoke": "Team",
};

function ActivityPage() {
  const activity = useQuery({ ...convexQueryOptions(api.activity.recent, { limit: 100 }) });

  return (
    <div>
      <h2 className="page-title">Activity</h2>
      <p className="page-lead">
        Who changed what, newest first. Order timelines live on each order page; this covers the
        catalogue, stock, settings and team.
      </p>

      <div className="mt-6">
        <QueryState pending={activity.isPending} error={activity.isError} label="Activity" />
        {activity.isPending ? null : activity.data?.length ? (
          <ul className="divide-y divide-border rounded-2xl border border-border bg-card">
            {activity.data.map((entry, i) => (
              <li key={i} className="flex flex-wrap items-start gap-3 px-5 py-4">
                <span className="mt-0.5 shrink-0 rounded-full bg-muted px-2.5 py-0.5 text-xs font-semibold">
                  {ACTION_LABEL[entry.action] ?? entry.action}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm">{entry.summary}</span>
                  <span className="block text-xs text-muted-foreground">
                    {entry.actor_name} · {new Date(entry.created_at).toLocaleString()}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
            title="No activity recorded yet"
            hint="Product, stock, settings and team changes appear here."
          />
        )}
      </div>
    </div>
  );
}
