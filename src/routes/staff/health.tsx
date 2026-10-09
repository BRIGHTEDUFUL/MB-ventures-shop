import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { convexQueryOptions } from "@/lib/convex";
import { api } from "../../../convex/_generated/api";
import { pageHead } from "@/lib/store";
import { EmptyState, Panel, QueryState } from "@/components/staff/bits";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/staff/health")({
  head: () =>
    pageHead(
      "Data health",
      "Every check the daily scan runs, what it means and exactly what to do about it.",
    ),
  component: HealthPage,
});

const SEVERITY_ORDER = ["critical", "high", "medium", "low"] as const;

/** Badge tone per severity, worst first. */
const TONE: Record<(typeof SEVERITY_ORDER)[number], string> = {
  critical: "bg-destructive/15 text-destructive",
  high: "bg-offer/15 text-offer",
  medium: "bg-link/15 text-link",
  low: "bg-muted text-muted-foreground",
};

function HealthPage() {
  const report = useQuery({
    ...convexQueryOptions(api.health.report, {}),
  });

  const data = report.data;
  const counts = SEVERITY_ORDER.map(
    (severity) =>
      [severity, data?.findings.filter((f) => f.severity === severity).length ?? 0] as const,
  );
  const total = data?.findings.length ?? 0;

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="page-title">Data health</h2>
          <p className="page-lead">
            Read-only: this scan never changes a row. Each finding says why it matters and what to
            do, and a fresh scan runs every night at 05:00.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => report.refetch()}
          disabled={report.isFetching}
        >
          {report.isFetching ? "Scanning…" : "Re-scan"}
        </Button>
      </div>

      <QueryState pending={report.isPending} error={report.isError} label="Data health" />

      {report.isPending || report.isError ? null : (
        <>
          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-5">
            {counts.map(([severity, count]) => (
              <div key={severity} className="solid-panel p-4">
                <p className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                  {severity}
                </p>
                <p
                  className={cn(
                    "mt-1 text-3xl font-semibold",
                    count > 0 && severity !== "low" && "text-destructive",
                    count > 0 && severity === "low" && "text-muted-foreground",
                    count === 0 && "text-success",
                  )}
                >
                  {count}
                </p>
              </div>
            ))}
            <div className="solid-panel p-4">
              <p className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                checked
              </p>
              <p className="mt-1 text-3xl font-semibold">{data?.checked.products ?? 0}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {data?.checked.orders ?? 0} orders · {data?.checked.categories ?? 0} categories
              </p>
            </div>
          </div>

          <div className="mt-6">
            <Panel
              title={total === 0 ? "No findings" : `${total} finding${total === 1 ? "" : "s"}`}
              description={
                total === 0
                  ? "Every check passed. Nothing needs your attention."
                  : "Worst first. Open the linked screen to fix one, then re-scan to confirm."
              }
            >
              {total === 0 ? (
                <EmptyState
                  title="Everything checks out"
                  hint="Slugs, prices, categories, photos and order links are all consistent."
                />
              ) : (
                <ul className="space-y-4">
                  {(data?.findings ?? []).map((finding) => (
                    <li key={finding.code} className="rounded-xl border border-border p-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={cn(
                            "rounded-full px-2.5 py-0.5 text-xs font-semibold uppercase",
                            TONE[finding.severity] ?? TONE.low,
                          )}
                        >
                          {finding.severity}
                        </span>
                        <h3 className="min-w-0 font-semibold">{finding.title}</h3>
                      </div>
                      <p className="mt-2 text-sm text-muted-foreground">{finding.detail}</p>
                      <p className="mt-2 text-sm">
                        <span className="font-semibold">What to do: </span>
                        {finding.fix}
                      </p>
                      {finding.subjects.length > 0 && (
                        <p className="mt-2 font-mono text-xs break-all text-muted-foreground">
                          {finding.subjects.join(", ")}
                          {finding.total > finding.subjects.length
                            ? ` …and ${finding.total - finding.subjects.length} more`
                            : ""}
                        </p>
                      )}
                      <div className="mt-3">
                        <Button variant="outline" size="sm" asChild>
                          <Link to="/staff/inventory">Open inventory</Link>
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          </div>
        </>
      )}
    </div>
  );
}
