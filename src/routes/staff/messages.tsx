import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useConvexMutation } from "@convex-dev/react-query";
import { convexQueryOptions } from "@/lib/convex";
import { api } from "../../../convex/_generated/api";
import { errorMessage, pageHead } from "@/lib/store";
import { EmptyState, QueryState } from "@/components/staff/bits";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import type { Id } from "../../../convex/_generated/dataModel";
import { CheckCheck, Clock, Mail, MessageSquare, Phone, Reply } from "lucide-react";

export const Route = createFileRoute("/staff/messages")({
  head: () =>
    pageHead(
      "Customer Inquiries",
      "Review and respond to messages submitted through the contact form.",
    ),
  component: MessagesPage,
});

type MessageStatus = "all" | "unread" | "read" | "replied";

const STATUS_FILTERS: { value: MessageStatus; label: string }[] = [
  { value: "all", label: "All inquiries" },
  { value: "unread", label: "Unread" },
  { value: "read", label: "Read" },
  { value: "replied", label: "Replied" },
];

const STATUS_BADGE: Record<string, string> = {
  unread: "bg-offer/20 text-offer border-offer/30",
  read: "bg-muted text-muted-foreground border-border",
  replied: "bg-success/20 text-success border-success/30",
};

function formatGhanaPhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.startsWith("0") && digits.length === 10) {
    return `233${digits.slice(1)}`;
  }
  if (digits.startsWith("233")) return digits;
  return digits;
}

function MessagesPage() {
  const [status, setStatus] = useState<MessageStatus>("all");
  const [search, setSearch] = useState("");

  const messagesQuery = useQuery({
    ...convexQueryOptions(api.contact.list, {
      ...(status !== "all" ? { status } : {}),
      limit: 100,
    }),
  });

  const unreadCountQuery = useQuery({
    ...convexQueryOptions(api.contact.unreadCount, {}),
  });

  const markRead = useConvexMutation(api.contact.markRead);
  const markReplied = useConvexMutation(api.contact.markReplied);

  const messages = messagesQuery.data ?? [];
  const filtered = messages.filter((m) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      m.name.toLowerCase().includes(q) ||
      m.email.toLowerCase().includes(q) ||
      (m.phone && m.phone.toLowerCase().includes(q)) ||
      m.subject.toLowerCase().includes(q) ||
      m.message.toLowerCase().includes(q)
    );
  });

  const handleMarkRead = async (id: Id<"contact_messages">) => {
    try {
      await markRead({ id });
      toast.success("Message marked as read");
    } catch (err) {
      toast.error(errorMessage(err, "That message could not be marked as read."));
    }
  };

  const handleMarkReplied = async (id: Id<"contact_messages">) => {
    try {
      await markReplied({ id });
      toast.success("Message marked as replied");
    } catch (err) {
      toast.error(errorMessage(err, "That message could not be marked as replied."));
    }
  };

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="page-title flex items-center gap-2.5">
            <MessageSquare className="h-6 w-6 text-foreground" />
            Customer inquiries
            {(unreadCountQuery.data ?? 0) > 0 ? (
              <span className="rounded-full bg-offer/20 px-2.5 py-0.5 text-xs font-semibold text-offer">
                {unreadCountQuery.data} unread
              </span>
            ) : null}
          </h2>
          <p className="page-lead">
            Messages and inquiries sent by shoppers via the contact form. All alerts also go to{" "}
            <strong>info@mbventuresgh.com</strong>.
          </p>
        </div>
      </div>

      <div className="toolbar mt-6">
        <input
          aria-label="Search messages"
          placeholder="Search customer, email, phone or message content..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="min-w-[280px]"
        />
        <select
          aria-label="Filter status"
          value={status}
          onChange={(e) => setStatus(e.target.value as MessageStatus)}
        >
          {STATUS_FILTERS.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
        </select>
      </div>

      <div className="mt-6">
        <QueryState
          pending={messagesQuery.isPending}
          error={messagesQuery.isError}
          label="Customer messages"
        />

        {messagesQuery.isPending ? null : filtered.length === 0 ? (
          <EmptyState
            title="No inquiries found"
            hint="Customer contact form submissions appear here instantly."
          />
        ) : (
          <div className="space-y-4">
            {filtered.map((msg) => {
              const ghanaWaNumber = msg.phone ? formatGhanaPhone(msg.phone) : null;

              return (
                <div
                  key={msg.id}
                  className={`rounded-2xl border transition-all ${
                    msg.status === "unread"
                      ? "border-offer/40 bg-card shadow-sm"
                      : "border-border bg-card/60"
                  } p-5`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold capitalize ${
                            STATUS_BADGE[msg.status] ?? STATUS_BADGE["read"]
                          }`}
                        >
                          {msg.status}
                        </span>
                        <h3 className="font-semibold text-foreground">{msg.subject}</h3>
                      </div>

                      <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                        <span className="font-medium text-foreground">{msg.name}</span>
                        <span className="flex items-center gap-1">
                          <Mail className="h-3 w-3" />
                          <a
                            href={`mailto:${msg.email}?subject=Re: ${encodeURIComponent(msg.subject)}`}
                            className="hover:underline"
                          >
                            {msg.email}
                          </a>
                        </span>
                        {msg.phone ? (
                          <span className="flex items-center gap-1">
                            <Phone className="h-3 w-3" />
                            <a href={`tel:${msg.phone}`} className="hover:underline">
                              {msg.phone}
                            </a>
                          </span>
                        ) : null}
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {new Date(msg.created_at).toLocaleString()}
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      {msg.status === "unread" ? (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => void handleMarkRead(msg.id)}
                          className="h-8 text-xs"
                        >
                          <CheckCheck className="mr-1 h-3.5 w-3.5" />
                          Mark read
                        </Button>
                      ) : null}

                      {msg.status !== "replied" ? (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => void handleMarkReplied(msg.id)}
                          className="h-8 text-xs"
                        >
                          <Reply className="mr-1 h-3.5 w-3.5" />
                          Mark replied
                        </Button>
                      ) : null}

                      <Button variant="default" size="sm" asChild className="h-8 text-xs">
                        <a
                          href={`mailto:${msg.email}?subject=Re: ${encodeURIComponent(msg.subject)}&body=${encodeURIComponent(`Hi ${msg.name},\n\nThank you for reaching out to MB Ventures GH regarding "${msg.subject}".\n\n`)}`}
                        >
                          <Mail className="mr-1 h-3.5 w-3.5" />
                          Email reply
                        </a>
                      </Button>

                      {ghanaWaNumber ? (
                        <Button
                          variant="secondary"
                          size="sm"
                          asChild
                          className="h-8 text-xs bg-success/15 text-success hover:bg-success/25"
                        >
                          <a
                            href={`https://wa.me/${ghanaWaNumber}?text=${encodeURIComponent(`Hi ${msg.name}, thank you for contacting MB Ventures GH regarding: ${msg.subject}`)}`}
                            target="_blank"
                            rel="noreferrer"
                          >
                            WhatsApp
                          </a>
                        </Button>
                      ) : null}
                    </div>
                  </div>

                  <div className="mt-4 rounded-xl border border-border/60 bg-muted/30 p-4 text-sm leading-relaxed text-foreground whitespace-pre-wrap">
                    {msg.message}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
