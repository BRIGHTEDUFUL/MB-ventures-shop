import { QueryClient } from "@tanstack/react-query";
import { createRouter, rootRouteId } from "@tanstack/react-router";
import { describe, expect, it } from "vitest";

import { routeTree } from "@/routeTree.gen";

// Match routes without running loaders or rendering: loaders may need a server or
// network the test run lacks, and jsdom never loads the stylesheets React waits on.
describe("App routing", () => {
  const createTestRouter = () =>
    createRouter({ routeTree, context: { queryClient: new QueryClient() } });

  it("matches a page for / instead of falling back to not found", () => {
    const router = createTestRouter();

    const matches = router.matchRoutes("/");

    expect(matches.at(-1)?.routeId).not.toBe(rootRouteId);
  });

  // The three legacy auth slugs exist only to bounce old links to /account:
  // each must resolve to its own stub (not the catch-all), and the stub's
  // beforeLoad must keep throwing the redirect TanStack carries on to
  // /account — /signup adds `?signup=true` for the sign-up form.
  it.each([
    { path: "/login", search: undefined as Record<string, string> | undefined },
    { path: "/signin", search: undefined as Record<string, string> | undefined },
    { path: "/signup", search: { signup: "true" } },
  ])("redirects $path to /account", ({ path, search }) => {
    const router = createTestRouter();

    const match = router.matchRoutes(path).at(-1);
    expect(match?.routeId).toBe(path);
    expect(match?.routeId).not.toBe(rootRouteId);

    // `matchRoutes` only matches; the redirect itself lives on the route, so
    // read it off the router's route record and run it by hand.
    const beforeLoad = (
      router.routesById as unknown as Record<
        string,
        { options: { beforeLoad?: (ctx: never, opts: never) => unknown } }
      >
    )[path]?.options.beforeLoad;
    expect(typeof beforeLoad).toBe("function");

    let thrown: unknown = null;
    try {
      beforeLoad?.({} as never, {} as never);
    } catch (error) {
      thrown = error;
    }
    // `redirect()` returns a Response carrying the navigate options, and the
    // route throws it — that is what a real navigation catches.
    expect(thrown).toBeInstanceOf(Response);
    const options = (thrown as Response & { options?: { to?: string; search?: unknown } }).options;
    expect(options?.to).toBe("/account");
    if (search !== undefined) expect(options?.search).toEqual(search);
  });
});
