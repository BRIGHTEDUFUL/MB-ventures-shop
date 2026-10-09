import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/auth/signin")({
  beforeLoad: () => {
    throw redirect({ to: "/account" });
  },
  component: () => null,
});
