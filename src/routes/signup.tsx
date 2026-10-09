import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/signup")({
  beforeLoad: () => {
    throw redirect({ to: "/account", search: { signup: "true" } });
  },
  component: () => null,
});
