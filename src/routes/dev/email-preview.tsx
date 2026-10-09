import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { convexQueryOptions } from "@/lib/convex";
import { api } from "../../../convex/_generated/api";
import { pageHead } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { QueryState } from "@/components/staff/bits";

/**
 * Local-only gallery of every email template rendered from sample data.
 *
 * The data lives behind `emails.previewDev`, which answers `allowed: false`
 * unless SITE_URL points at localhost or a Convex dev deployment — so this
 * route shows a dead end in production rather than a catalogue of templates.
 */
export const Route = createFileRoute("/dev/email-preview")({
  head: () =>
    pageHead("Email preview", "Every store email template rendered from sample data (local only)."),
  component: EmailPreviewPage,
});

function EmailPreviewPage() {
  const preview = useQuery({ ...convexQueryOptions(api.emails.previewDev, {}) });
  const [selected, setSelected] = useState("");
  const [view, setView] = useState<"html" | "text">("html");

  const data = preview.data;
  const items = data?.items ?? [];

  if (preview.isPending) {
    return <div className="page-content wrap">Rendering templates…</div>;
  }

  if (!data?.allowed) {
    return (
      <div className="page-content wrap">
        <h1 className="page-title">Email preview</h1>
        <p className="page-lead">
          This gallery only answers while SITE_URL points at localhost or a Convex dev deployment.
        </p>
      </div>
    );
  }

  const active = items.find((item) => item.name === selected) ?? items[0];

  return (
    <div className="page-content wrap">
      <h1 className="page-title">Email preview</h1>
      <p className="page-lead">
        Every template rendered from sample data, exactly as a customer or staff member would
        receive it. Nothing is sent.
      </p>

      <QueryState pending={false} error={preview.isError} label="The template gallery" />

      <div className="mt-6 grid gap-6 lg:grid-cols-[16rem_minmax(0,1fr)]">
        <nav className="solid-panel h-fit p-3">
          <p className="px-2 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
            Templates
          </p>
          <ul className="mt-2 space-y-1">
            {items.map((item) => (
              <li key={item.name}>
                <button
                  type="button"
                  onClick={() => setSelected(item.name)}
                  className={`w-full rounded-lg px-2 py-2 text-left text-sm ${
                    active?.name === item.name ? "bg-muted font-semibold" : "hover:bg-muted/60"
                  }`}
                >
                  <span className="block truncate">{item.name}</span>
                  <span className="block text-xs text-muted-foreground">{item.group}</span>
                </button>
              </li>
            ))}
          </ul>
        </nav>

        <section className="solid-panel min-w-0 p-5">
          {active ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="text-lg">{active.subject}</h2>
                  <p className="text-sm text-muted-foreground">{active.name}</p>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant={view === "html" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setView("html")}
                  >
                    HTML
                  </Button>
                  <Button
                    variant={view === "text" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setView("text")}
                  >
                    Text
                  </Button>
                </div>
              </div>

              {view === "html" ? (
                <iframe
                  title={`Preview of ${active.name}`}
                  sandbox=""
                  srcDoc={active.html}
                  className="mt-4 h-[70vh] w-full rounded-xl border border-border bg-white"
                />
              ) : (
                <pre className="mt-4 h-[70vh] overflow-auto whitespace-pre-wrap rounded-xl border border-border bg-muted p-4 text-xs">
                  {active.text}
                </pre>
              )}
            </>
          ) : (
            <p className="text-sm text-muted-foreground">No templates rendered.</p>
          )}
        </section>
      </div>
    </div>
  );
}
