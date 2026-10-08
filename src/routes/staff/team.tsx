import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useConvexMutation } from "@convex-dev/react-query";
import { convexQueryOptions } from "@/lib/convex";
import { api } from "../../../convex/_generated/api";
import { errorMessage, pageHead } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { EmptyState, Panel, QueryState } from "@/components/staff/bits";
import { toast } from "sonner";

export const Route = createFileRoute("/staff/team")({
  head: () => pageHead("Team", "Grant, change or revoke staff and admin access."),
  component: TeamPage,
});

function TeamPage() {
  const role = useQuery({ ...convexQueryOptions(api.users.myRole, {}) });
  const team = useQuery({
    ...convexQueryOptions(api.users.team, {}),
    enabled: role.data === "admin" || role.data === "staff",
  });
  const addStaff = useConvexMutation(api.users.addStaff);
  const setRole = useConvexMutation(api.users.setRole);
  const revokeRole = useConvexMutation(api.users.revokeRole);

  const [email, setEmail] = useState("");
  const [newRole, setNewRole] = useState<"staff" | "admin">("staff");
  const [busy, setBusy] = useState(false);

  if (role.isPending) return <p className="text-sm text-muted-foreground">Checking access…</p>;

  return (
    <div>
      <h2 className="page-title">Team</h2>
      <p className="page-lead">
        Staff manage the day-to-day; admins additionally control delivery fees, Mobile Money details
        and this team list.
      </p>

      <QueryState pending={team.isPending} error={team.isError} label="Team" />

      {role.data === "admin" && (
        <div className="mt-6">
          <Panel
            title="Grant access"
            description="The person needs an account first (email sign-up)."
          >
            <form
              className="flex flex-wrap items-end gap-3"
              onSubmit={async (e) => {
                e.preventDefault();
                setBusy(true);
                try {
                  await addStaff({ email, role: newRole });
                  toast.success(`${email} now has ${newRole} access`);
                  setEmail("");
                } catch (err) {
                  toast.error(errorMessage(err, "Access could not be granted."));
                } finally {
                  setBusy(false);
                }
              }}
            >
              <label className="min-w-[16rem] flex-1">
                Email of an existing account
                <input
                  required
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="worker@example.com"
                />
              </label>
              <label>
                Role
                <select
                  value={newRole}
                  onChange={(e) => setNewRole(e.target.value as typeof newRole)}
                >
                  <option value="staff">Staff</option>
                  <option value="admin">Admin</option>
                </select>
              </label>
              <Button disabled={busy}>{busy ? "Working…" : "Grant access"}</Button>
            </form>
          </Panel>
        </div>
      )}

      <div className="mt-6">
        <Panel title="Access list" description="Everyone who can sign in to the store hub.">
          {team.isPending ? null : team.data?.length ? (
            <ul className="divide-y divide-border">
              {team.data.map((member) => (
                <li key={member.id} className="flex flex-wrap items-center gap-3 py-3">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-semibold uppercase">
                    {(member.name || member.email).slice(0, 1)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{member.name || "—"}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {member.email}
                      {member.phone && ` · ${member.phone}`}
                    </span>
                  </span>
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ${
                      member.role === "admin"
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {member.role}
                  </span>
                  {role.data === "admin" && (
                    <span className="flex gap-2">
                      {member.role === "staff" ? (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={async () => {
                            try {
                              await setRole({ user_id: member.id, role: "admin" });
                              toast.success(`${member.email} is now an admin`);
                            } catch (err) {
                              toast.error(errorMessage(err, "Role could not be changed."));
                            }
                          }}
                        >
                          Make admin
                        </Button>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={async () => {
                            try {
                              await setRole({ user_id: member.id, role: "staff" });
                              toast.success(`${member.email} is now staff`);
                            } catch (err) {
                              toast.error(errorMessage(err, "Role could not be changed."));
                            }
                          }}
                        >
                          Make staff
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive"
                        onClick={async () => {
                          if (
                            !window.confirm(
                              `Remove ${member.email}'s access to the store hub? They keep their customer account.`,
                            )
                          ) {
                            return;
                          }
                          try {
                            await revokeRole({ user_id: member.id });
                            toast.success("Access removed");
                          } catch (err) {
                            toast.error(errorMessage(err, "Access could not be removed."));
                          }
                        }}
                      >
                        Remove
                      </Button>
                    </span>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title="No team members found" />
          )}
        </Panel>
      </div>
    </div>
  );
}
