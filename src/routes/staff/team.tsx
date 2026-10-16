import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useConvexMutation } from "@convex-dev/react-query";
import { convexQueryOptions } from "@/lib/convex";
import { api } from "../../../convex/_generated/api";
import { errorMessage, pageHead } from "@/lib/store";
import { useSession } from "@/lib/use-session";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { EmptyState, Panel, QueryState } from "@/components/staff/bits";
import { toast } from "sonner";
import {
  PERMISSION_CATALOG,
  defaultPermissions,
  groupedPermissions,
} from "../../../convex/lib/permission-catalog";
import type { PermissionKey } from "../../../convex/schema";

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
  const setPermission = useConvexMutation(api.users.setPermission);
  const { profile } = useSession();

  const [email, setEmail] = useState("");
  const [newRole, setNewRole] = useState<"staff" | "admin">("staff");
  const [busy, setBusy] = useState(false);
  /** One permission panel open at a time — the matrix is wide. */
  const [openMember, setOpenMember] = useState<string | null>(null);

  /** Flip one permission for one member; the roster refetches itself. */
  const flip = async (userId: string, key: PermissionKey, granted: boolean | null) => {
    try {
      await setPermission({ user_id: userId, permission: key, granted });
      const label = PERMISSION_CATALOG[key].label;
      toast.success(
        granted === null
          ? `“${label}” is back to the role default.`
          : `${granted ? "Granted" : "Removed"} — ${label}.`,
      );
    } catch (err) {
      toast.error(errorMessage(err, "That permission could not be changed."));
    }
  };

  if (role.isPending) return <p className="text-sm text-muted-foreground">Checking access…</p>;

  return (
    <div>
      <h2 className="page-title">Team</h2>
      <p className="page-lead">
        Staff manage the day-to-day; admins additionally manage this team list and the store's
        settings.
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
          {team.isPending || team.isError ? null : team.data?.length ? (
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
                      <Button
                        variant="outline"
                        size="sm"
                        aria-expanded={openMember === member.id}
                        onClick={() => setOpenMember(openMember === member.id ? null : member.id)}
                      >
                        {openMember === member.id ? "Hide permissions" : "Permissions"}
                      </Button>
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
                  {openMember === member.id && (
                    <PermissionMatrix
                      member={member}
                      locked={profile?.id === member.id}
                      onFlip={flip}
                    />
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

type MatrixMember = {
  id: string;
  name: string;
  email: string;
  role: "admin" | "staff";
  /** Per-person flips recorded on `user_roles.overrides` (absent = default). */
  overrides: Partial<Record<PermissionKey, boolean>>;
};

/**
 * One member's permission matrix — the full catalogue from
 * `convex/lib/permission-catalog.ts` (pure data, the same file the backend
 * guards read), drawn as role defaults plus this person's own exceptions.
 * A tick marked “changed” is an override; its “reset” returns that one
 * permission to the role default.
 *
 * The signed-in member's own panel is read-only: the backend allows a
 * self-edit (the CLI stays the deliberate escape hatch), but a sole admin
 * clicking themselves out of `team.manage` is a corner this screen should
 * not invite them into.
 */
function PermissionMatrix({
  member,
  locked,
  onFlip,
}: {
  member: MatrixMember;
  locked: boolean;
  onFlip: (userId: string, key: PermissionKey, granted: boolean | null) => void;
}) {
  const defaults = new Set(defaultPermissions(member.role));

  return (
    <div className="mt-3 w-full basis-full rounded-xl border border-border bg-muted/40 p-4">
      <p className="text-sm font-semibold">What {member.name || member.email} may do</p>
      <p className="mt-1 text-xs text-muted-foreground">
        Ticks follow the <span className="font-medium capitalize">{member.role}</span> role;
        “changed” marks this person's own exception, and clearing it returns to the default.
      </p>

      <div className="mt-3 grid gap-x-8 gap-y-4 sm:grid-cols-2">
        {groupedPermissions().map(({ group, keys }) => (
          <div key={group}>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {group}
            </p>
            <ul className="mt-1.5 space-y-1.5">
              {keys.map((key) => {
                const overridden = key in member.overrides;
                const checked = member.overrides[key] ?? defaults.has(key);
                return (
                  <li key={key} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      id={`perm-${member.id}-${key}`}
                      checked={checked}
                      disabled={locked}
                      onCheckedChange={(state) => {
                        if (state !== "indeterminate") onFlip(member.id, key, state);
                      }}
                    />
                    <label htmlFor={`perm-${member.id}-${key}`} className="min-w-0 cursor-pointer">
                      {PERMISSION_CATALOG[key].label}
                      {overridden && <span className="ml-1 text-xs text-link">· changed</span>}
                    </label>
                    {overridden && !locked && (
                      <button
                        type="button"
                        className="ml-auto shrink-0 text-xs text-muted-foreground underline-offset-2 hover:underline"
                        onClick={() => onFlip(member.id, key, null)}
                      >
                        reset
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>

      {locked && (
        <p className="mt-3 text-xs text-muted-foreground">
          Your own panel is read-only here — ask a fellow admin for changes to your access.
        </p>
      )}
    </div>
  );
}
