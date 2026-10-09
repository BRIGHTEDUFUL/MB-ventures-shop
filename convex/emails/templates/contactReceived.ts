import {
  asRecord,
  renderEmail,
  str,
  type BodyBlock,
  type RenderContext,
  type RenderedEmail,
} from "./base";

/** Acknowledgement sent to whoever wrote in through the contact form. */
export function render(data: unknown, ctx: RenderContext): RenderedEmail {
  const input = asRecord(data);
  const form = asRecord(input["form"]);
  const name = str(form["name"]) || str(input["name"]) || "there";
  const subjectLine = str(form["subject"]) || str(input["subject"]) || "your message";

  const blocks: BodyBlock[] = [
    { kind: "lead", text: `Thanks ${name}, we have your message.` },
    {
      kind: "p",
      text: `We reply to contact form messages during opening hours: ${ctx.shop.hours}.`,
    },
    { kind: "rows", rows: [["Topic", subjectLine]] },
    { kind: "note", text: "For anything urgent, call the shop on the number below." },
  ];

  return renderEmail({
    ctx,
    subject: "We have your message",
    heading: "We have your message",
    blocks,
  });
}
