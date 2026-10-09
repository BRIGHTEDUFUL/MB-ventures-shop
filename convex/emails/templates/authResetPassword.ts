import {
  asRecord,
  renderEmail,
  siteLink,
  str,
  type BodyBlock,
  type RenderContext,
  type RenderedEmail,
} from "./base";

/**
 * Password reset mail. The link carries the one-time code as `?code=` on the
 * account page, which is where the reset form lives.
 */
export function render(data: unknown, ctx: RenderContext): RenderedEmail {
  const input = asRecord(data);
  const rawUrl = str(input["url"]);
  const url = rawUrl === "" ? siteLink(ctx, "/account") : rawUrl;
  const expires = str(input["expires"], "60 minutes");

  const blocks: BodyBlock[] = [
    { kind: "lead", text: "We received a request to reset the password for your account." },
    { kind: "p", text: "Open the link below to choose a new password." },
    { kind: "note", text: `The link stops working after ${expires}.` },
    {
      kind: "note",
      text: "If you did not ask for this, you can ignore this message. Your password stays unchanged.",
    },
  ];

  return renderEmail({
    ctx,
    subject: "Reset your MB Ventures GH password",
    heading: "Reset your password",
    blocks,
    cta: { href: url, label: "Choose a new password" },
  });
}
