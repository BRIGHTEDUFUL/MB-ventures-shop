import "@testing-library/jest-dom/vitest";

/**
 * Two environments share this suite: jsdom for UI and rule tests, the Convex
 * edge runtime for `convex-test`. The DOM helpers only apply to the former.
 */
if (typeof window !== "undefined") {
  Object.defineProperty(window, "scrollTo", {
    writable: true,
    value: () => {},
  });

  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => {},
    }),
  });
}
