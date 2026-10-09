import {
  asRecord,
  renderEmail,
  str,
  type BodyBlock,
  type RenderContext,
  type RenderedEmail,
} from "./base";

/** Internal alert: somebody used the contact form on the storefront. */
export function render(data: unknown, ctx: RenderContext): RenderedEmail {
  const input = asRecord(data);
  const form = asRecord(input["form"]);
  const name = str(form["name"]) || str(input["name"]) || "Visitor";
  const email = str(form["email"]) || str(input["email"]);
  const phone = str(form["phone"]) || str(input["phone"]);
  const subjectLine = str(form["subject"]) || str(input["subject"]) || "General question";
  const message = str(form["message"]) || str(input["message"]);

  const rows: [string, string][] = [
    ["From", name],
    ["Topic", subjectLine],
  ];
  if (email !== "") rows.push(["Reply to", email]);
  if (phone !== "") rows.push(["Phone", phone]);

  const blocks: BodyBlock[] = [
    { kind: "lead", text: "New message through the contact form." },
    { kind: "rows", rows },
    { kind: "quote", text: message === "" ? "No message text was provided." : message },
    { kind: "note", text: `Sent to ${ctx.shop.email}. Reply directly to the address above.` },
  ];

  return renderEmail({
    ctx,
    subject: `Contact form: ${subjectLine}`,
    heading: `Contact form: ${subjectLine}`,
    blocks,
  });
}
