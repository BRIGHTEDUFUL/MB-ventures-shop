import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { useConvexAction, useConvexMutation } from "@convex-dev/react-query";
import { convexQueryOptions } from "@/lib/convex";
import { api } from "../../../convex/_generated/api";
import { useSession } from "@/lib/use-session";
import { errorMessage, pageHead } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState, QueryState, Stat } from "@/components/staff/bits";
import { StaffShell } from "@/components/staff/shell";

/**
 * Email operations console.
 *
 * Until the Web3Forms access key exists the whole page runs against dry-run
 * rows: every message is rendered and stored, none is transmitted. The banner
 * is the single place that states which mode the deployment is in.
 */
export const Route = createFileRoute("/admin/emails")({
  head: () =>
    pageHead(
      "Emails",
      "Dry-run status, delivery log, previews and suppression list for the store.",
    ),
  component: EmailsPage,
});

const STATUS_FILTERS = [
  { value: "", label: "All statuses" },
  { value: "queued", label: "Queued" },
  { value: "sent", label: "Sent" },
  { value: "skipped_dry_run", label: "Dry run" },
  { value: "failed", label: "Failed" },
  { value: "delivered", label: "Delivered" },
  { value: "bounced", label: "Bounced" },
  { value: "complained", label: "Complained" },
];

const STATUS_STYLE: Record<string, string> = {
  queued: "bg-muted text-muted-foreground",
  sent: "bg-link/15 text-link",
  skipped_dry_run: "bg-offer/15 text-offer",
  failed: "bg-destructive/15 text-destructive",
  delivered: "bg-success/15 text-success",
  bounced: "bg-destructive/15 text-destructive",
  complained: "bg-destructive/15 text-destructive",
};

function EmailsPage() {
  const { session, loading } = useSession();
  const role = useQuery({ ...convexQueryOptions(api.users.myRole, {}), enabled: !!session });

  if (loading || (session && role.isPending)) {
    return <div className="page-content wrap">Checking access…</div>;
  }
  if (!session) {
    return (
      <Gate title="Emails" message="Sign in with your admin account to review the delivery log.">
        <Button asChild>
          <Link to="/account" search={{ next: "/admin/emails" }}>
            Sign in
          </Link>
        </Button>
      </Gate>
    );
  }
  if (role.data !== "admin") {
    return (
      <Gate
        title="Emails"
        message="This console is limited to store admins. Ask the store owner to grant access."
      >
        <Button asChild variant="outline">
          <Link to="/staff">Back to the store hub</Link>
        </Button>
      </Gate>
    );
  }
  return (
    <StaffShell role="admin">
      <EmailsConsole />
    </StaffShell>
  );
}

/** Full-page explanation used while access is being settled. */
function Gate({
  title,
  message,
  children,
}: {
  title: string;
  message: string;
  children: ReactNode;
}) {
  return (
    <div className="page-content wrap">
      <h1 className="page-title">{title}</h1>
      <p className="page-lead">{message}</p>
      <div className="mt-6">{children}</div>
    </div>
  );
}

function EmailsConsole() {
  const [status, setStatus] = useState("");
  const [template, setTemplate] = useState("");
  const [q, setQ] = useState("");
  const [previewId, setPreviewId] = useState("");
  const [testTemplate, setTestTemplate] = useState("order-received");
  const [testTo, setTestTo] = useState("");
  const [testResult, setTestResult] = useState<{
    logId: string;
    status: string;
    subject: string;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [suppression, setSuppression] = useState("");

  const config = useQuery({ ...convexQueryOptions(api.emails.config, {}) });
  const logs = useQuery({
    ...convexQueryOptions(api.emails.list, { status, template, q, limit: 100 }),
  });
  const suppressed = useQuery({ ...convexQueryOptions(api.emails.suppressed, {}) });
  const preview = useQuery({
    ...convexQueryOptions(api.emails.preview, { id: previewId }),
    enabled: previewId !== "",
  });

  const sendTest = useConvexAction(api.emails.sendTest);
  const removeSuppression = useConvexMutation(api.emails.removeSuppression);
  const addSuppression = useConvexMutation(api.emails.addSuppression);

  const mode = config.data?.mode ?? "dry-run";
  const summary = config.data?.summary;
  const templates = config.data?.templates ?? [];

  const runTest = async () => {
    const to = testTo.trim();
    if (to === "") {
      setNotice("Enter the address that should receive the test message.");
      return;
    }
    setBusy(true);
    setNotice("");
    try {
      const result = await sendTest({ template: testTemplate, to });
      setTestResult({
        logId: result.logId,
        status: result.status,
        subject: result.rendered.subject,
      });
      toast.success("Test message processed.");
    } catch (error) {
      setNotice(errorMessage(error, "The test message could not be processed."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <h2 className="page-title">Emails</h2>
      <p className="page-lead">
        Every outbound message the store produces: order confirmations, payment notices, staff
        alerts, password resets and contact-form mail.
      </p>

      {/* Mode banner — the one place that says whether anything really sends. */}
      <div
        className={
          mode === "live"
            ? "mt-5 rounded-xl border border-success/40 bg-success/10 px-5 py-4 text-sm"
            : "mt-5 rounded-xl border border-offer/40 bg-offer/10 px-5 py-4 text-sm"
        }
      >
        <p className="font-semibold">
          {mode === "live"
            ? "Live mode: Web3Forms is configured and messages are forwarded to the shop inbox."
            : "Dry-run mode: messages are rendered and logged, nothing leaves the server."}
        </p>
        <p className="mt-1 text-muted-foreground">
          {mode === "live"
            ? `Forwarded by api.web3forms.com · daily limit ${config.data?.dailyLimit ?? "-"}`
            : "Add WEB3FORMS_ACCESS_KEY to go live. No code changes are needed."}
          {config.data?.logCodes ? " · one-time auth codes are stored for local development" : ""}
        </p>
        {config.data?.devPreview ? (
          <p className="mt-1">
            <Link className="underline" to="/dev/email-preview">
              Open the template preview
            </Link>
          </p>
        ) : null}
      </div>

      <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          label="Sent today"
          value={summary ? summary.sentToday : "–"}
          sub={summary ? `of ${summary.limit} allowed today` : "counting…"}
          tone="success"
        />
        <Stat
          label="Queued"
          value={summary ? summary.queued : "–"}
          sub="waiting on the scheduler"
        />
        <Stat
          label="Dry run"
          value={summary ? summary.dryRunToday : "–"}
          sub="rendered, never transmitted"
          tone="offer"
        />
        <Stat
          label="Failed"
          value={summary ? summary.failedToday : "–"}
          sub="rejected or over the daily limit"
        />
      </div>

      <section className="solid-panel mt-6 p-5">
        <h3 className="text-lg">Send a test message</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Renders the selected template with sample data and pushes it through the real delivery
          path.
        </p>
        <div className="toolbar mt-4">
          <select
            aria-label="Test template"
            value={testTemplate}
            onChange={(e) => setTestTemplate(e.target.value)}
          >
            {templates.map((t) => (
              <option key={t.name} value={t.name}>
                {t.name} ({t.group})
              </option>
            ))}
          </select>
          <input
            aria-label="Test recipient"
            placeholder="you@example.com"
            value={testTo}
            onChange={(e) => setTestTo(e.target.value)}
          />
          <Button onClick={() => void runTest()} disabled={busy}>
            {busy ? "Processing…" : "Send test"}
          </Button>
        </div>
        {notice ? (
          <p role="alert" className="mt-3 text-sm text-destructive">
            {notice}
          </p>
        ) : null}
        {testResult ? (
          <div className="mt-4 rounded-xl border border-border p-4 text-sm">
            <p className="font-semibold">{testResult.subject}</p>
            <p className="mt-1 text-muted-foreground">Stored with status {testResult.status}.</p>
            <Button
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={() => setPreviewId(testResult.logId)}
            >
              Preview this message
            </Button>
          </div>
        ) : null}
      </section>

      <section className="solid-panel mt-6 p-5">
        <h3 className="text-lg">Delivery log</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Newest first. Dry-run rows keep the rendered body so it can be inspected here.
        </p>
        <div className="toolbar mt-4">
          <input
            aria-label="Search emails"
            placeholder="Search recipient, subject or error"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <select
            aria-label="Filter by status"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            {STATUS_FILTERS.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>
          <select
            aria-label="Filter by template"
            value={template}
            onChange={(e) => setTemplate(e.target.value)}
          >
            <option value="">All templates</option>
            {templates.map((t) => (
              <option key={t.name} value={t.name}>
                {t.name}
              </option>
            ))}
          </select>
        </div>

        <div className="mt-5">
          <QueryState pending={logs.isPending} error={logs.isError} label="The delivery log" />
          {logs.isPending ? null : logs.data?.length ? (
            <ul className="divide-y divide-border rounded-2xl border border-border bg-card">
              {logs.data.map((row) => (
                <li key={row.id} className="flex flex-wrap items-center gap-3 px-5 py-3 text-sm">
                  <span
                    className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                      STATUS_STYLE[row.status] ?? "bg-muted text-muted-foreground"
                    }`}
                  >
                    {row.status === "skipped_dry_run" ? "dry run" : row.status}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{row.subject}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {row.template} · to {row.to} · {new Date(row.created_at).toLocaleString()}
                      {row.error ? ` · ${row.error}` : ""}
                    </span>
                  </span>
                  <Button variant="outline" size="sm" onClick={() => setPreviewId(row.id)}>
                    Preview
                  </Button>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              title="No messages match"
              hint="Order confirmations, staff alerts and password resets appear here as soon as they are queued."
            />
          )}
        </div>
      </section>

      <section className="solid-panel mt-6 p-5">
        <h3 className="text-lg">Suppressed recipients</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Addresses that are never emailed: complaints and manual opt-outs. Order mail stops
          silently for these recipients.
        </p>
        <div className="toolbar mt-4">
          <input
            aria-label="Suppressed address"
            placeholder="address@example.com"
            value={suppression}
            onChange={(e) => setSuppression(e.target.value)}
          />
          <Button
            variant="outline"
            onClick={() => {
              void addSuppression({ email: suppression.trim() })
                .then(() => {
                  setSuppression("");
                  setNotice("");
                  toast.success("Recipient suppressed.");
                })
                .catch((error: unknown) =>
                  setNotice(errorMessage(error, "Could not suppress that address.")),
                );
            }}
          >
            Suppress
          </Button>
        </div>
        <div className="mt-4">
          <QueryState
            pending={suppressed.isPending}
            error={suppressed.isError}
            label="The suppression list"
          />
          {suppressed.isPending ? null : suppressed.data?.length ? (
            <ul className="divide-y divide-border rounded-2xl border border-border bg-card">
              {suppressed.data.map((row) => (
                <li key={row.id} className="flex flex-wrap items-center gap-3 px-5 py-3 text-sm">
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">{row.email}</span>
                    <span className="block text-xs text-muted-foreground">
                      {row.reason} · {row.source}
                    </span>
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      void removeSuppression({ id: row.id })
                        .then(() => toast.success("Delivery to that address is allowed again."))
                        .catch((error: unknown) =>
                          setNotice(errorMessage(error, "Could not remove that entry.")),
                        );
                    }}
                  >
                    Remove
                  </Button>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title="Nobody is suppressed" hint="Complaints land here automatically." />
          )}
        </div>
      </section>

      <PreviewDialog
        open={previewId !== ""}
        onOpenChange={(open) => {
          if (!open) setPreviewId("");
        }}
        subject={preview.data?.subject ?? ""}
        html={preview.data?.html ?? ""}
        text={preview.data?.text ?? ""}
        pending={preview.isPending}
        error={preview.isError}
      />
    </div>
  );
}

/** Sandboxed iframe + text toggle; the HTML never runs in this page's origin. */
function PreviewDialog({
  open,
  onOpenChange,
  subject,
  html,
  text,
  pending,
  error,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  subject: string;
  html: string;
  text: string;
  pending: boolean;
  error: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Preview</DialogTitle>
          <DialogDescription className="truncate">{subject}</DialogDescription>
        </DialogHeader>
        <QueryState pending={pending} error={error} label="The preview" />
        {pending || error ? null : html === "" && text === "" ? (
          <EmptyState
            title="That message is no longer stored"
            hint="It may have aged out of the delivery log, or the filter changed underneath you."
          />
        ) : (
          <Tabs defaultValue="html">
            <TabsList>
              <TabsTrigger value="html">HTML</TabsTrigger>
              <TabsTrigger value="text">Text</TabsTrigger>
            </TabsList>
            <TabsContent value="html">
              <iframe
                title="Email preview"
                sandbox=""
                srcDoc={html}
                className="h-[60vh] w-full rounded-xl border border-border bg-white"
              />
            </TabsContent>
            <TabsContent value="text">
              <pre className="h-[60vh] overflow-auto whitespace-pre-wrap rounded-xl border border-border bg-muted p-4 text-xs">
                {text}
              </pre>
            </TabsContent>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  );
}
