import {
  asRecord,
  renderEmail,
  siteLink,
  str,
  type BodyBlock,
  type RenderContext,
  type RenderedEmail,
} from "./base";

/** Only used if email verification is switched on later (see `convex/auth.ts`). */
export function render(data: unknown, ctx: RenderContext): RenderedEmail {
  const rawUrl = str(asRecord(data)["url"]);
  const url = rawUrl === "" ? siteLink(ctx, "/account") : rawUrl;

  const blocks: BodyBlock[] = [
    { kind: "lead", text: "Confirm this address for your MB Ventures GH account." },
    { kind: "p", text: "Open the link below to finish setting up your account." },
    {
      kind: "note",
      text: "If you did not create this account, you can ignore this message.",
    },
  ];

  return renderEmail({
    ctx,
    subject: "Confirm your email address",
    heading: "Confirm your email address",
    blocks,
    cta: { href: url, label: "Confirm my email" },
  });
}
