import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useConvexMutation } from "@convex-dev/react-query";
import { toast } from "sonner";
import { storeQuery, pageHead, money, displayFees, whatsappHref, errorMessage } from "@/lib/store";
import { api } from "../../convex/_generated/api";
import { Button } from "@/components/ui/button";
import { PageNotFound } from "@/components/store-ui";
const titles: Record<string, string> = {
  about: "Your workspace shop at Abelenkpe",
  delivery: "Delivery & Abelenkpe pickup",
  warranty: "Warranty & returns",
  faq: "Common questions",
  contact: "Contact the shop",
  terms: "Order terms",
  privacy: "Privacy",
};
export const Route = createFileRoute("/$page")({
  loader: ({ params }) => {
    if (!titles[params.page]) throw notFound();
  },
  head: ({ params }) =>
    pageHead(
      titles[params.page] || "Page not found",
      "Information from MB Ventures GH, Abelenkpe, Accra.",
    ),
  component: Content,
  notFoundComponent: PageNotFound,
});
function Content() {
  const { page } = Route.useParams(),
    { data } = useQuery(storeQuery),
    s = data?.settings;
  // Fees come from settings once loaded and from the published defaults before;
  // a saved 0 is a real "free" value and must not be replaced by a default.
  const fees = displayFees(s),
    whatsapp = s ? whatsappHref(s) : null;
  return (
    <div className="page-content wrap">
      <h1 className="page-title">{titles[page]}</h1>
      <div className="mt-8 max-w-3xl space-y-7 text-sm leading-7 text-muted-foreground">
        {page === "about" && (
          <>
            <p>
              MB Ventures GH is a workspace and computer accessories shop at Abelenkpe taxi rank,
              Accra, Ghana. Shop desks, chairs, everyday accessories, stands, mounts and streaming
              equipment online or visit our shop.
            </p>
            <p>
              Our team handles orders and manually verifies every Mobile Money payment. Choose
              delivery across Ghana or collection at Abelenkpe.
            </p>
          </>
        )}
        {page === "delivery" && (
          <>
            <h2 className="text-xl text-foreground">Delivery across Ghana</h2>
            <table className="spec-table">
              <tbody>
                <tr>
                  <th>Accra Central & Abelenkpe</th>
                  <td>{money(fees.central_fee)} · Same or next day</td>
                </tr>
                <tr>
                  <th>Greater Accra</th>
                  <td>{money(fees.greater_fee)} · 1–2 business days</td>
                </tr>
                <tr>
                  <th>Other regions</th>
                  <td>{money(fees.nationwide_fee)} · 2–4 business days</td>
                </tr>
              </tbody>
            </table>
            <p>
              Greater Accra includes Tema, Kasoa, Adenta and Teshie. Free delivery on orders over{" "}
              {money(fees.free_threshold)}. Timing is an estimate, subject to location and courier
              availability.
            </p>
            <h2 className="text-xl text-foreground">Abelenkpe in-store pickup</h2>
            <p>
              Collection is free at {s?.address || "Abelenkpe taxi rank, Accra"}. Pickup orders
              require Mobile Money, confirmed by staff. Wait until your order is ready before
              visiting. Pickup is a fulfillment option, not a payment method.
            </p>
          </>
        )}
        {page === "warranty" && (
          <>
            <p>
              Our Abelenkpe shop provides warranty support. Warranty coverage, duration and returns
              eligibility vary by product and must be confirmed with the shop before purchase.
            </p>
            <p>
              Keep your order reference and receipt. If your item arrives damaged or incorrect,
              contact the shop promptly with your reference and photographs. Do not send an item
              back until the team confirms arrangements.
            </p>
          </>
        )}
        {page === "faq" &&
          [
            {
              q: "How can I pay?",
              a: "MTN MoMo, Telecel Cash or AirtelTigo Money with a transaction reference for manual staff confirmation. For delivery orders, cash can be paid when the courier arrives.",
            },
            {
              q: "Can I collect from Abelenkpe?",
              a: "Yes. Pickup from the Abelenkpe taxi rank shop is free and requires Mobile Money. Wait for payment confirmation and ready status before collecting.",
            },
            {
              q: "Do you offer nationwide delivery?",
              a: `Yes. Delivery fees depend on your zone, with free delivery on orders over ${money(fees.free_threshold)}.`,
            },
            {
              q: "Why are items marked sample?",
              a: "Catalogue prices, inventory and recipient details must be verified by the store before ordering opens. Do not transfer funds while ordering is disabled.",
            },
            {
              q: "How do I check my order?",
              a: "Use the tracking page with your order reference and the phone number entered at checkout.",
            },
          ].map((f) => (
            <details key={f.q} className="border-b border-border py-4">
              <summary className="cursor-pointer font-semibold text-foreground">{f.q}</summary>
              <p className="mt-3">{f.a}</p>
            </details>
          ))}
        {page === "contact" && (
          <>
            <p>{s?.address || "Abelenkpe taxi rank, Accra, Ghana"}</p>
            <p>{s?.hours || "Monday to Saturday, 8:00 AM to 6:00 PM"}</p>
            <p>
              <a className="underline" href={`tel:${s?.phone || "+233240000000"}`}>
                {s?.phone || "+233 24 000 0000"}
              </a>
              <br />
              {whatsapp && (
                <>
                  <a className="underline" href={whatsapp} target="_blank" rel="noreferrer">
                    Chat on WhatsApp
                  </a>
                  <br />
                </>
              )}
              <a className="underline" href={`mailto:${s?.email || "info@mbventuresghana.com"}`}>
                {s?.email || "info@mbventuresghana.com"}
              </a>
            </p>
            <p>Contact details are from the store brief and should be verified before launch.</p>
            <ContactForm />
          </>
        )}
        {page === "terms" && (
          <>
            <p>
              Prices are in Ghana cedis. Sample catalogue prices and stock are not confirmed offers.
              Ordering remains disabled until the shop verifies product information and payment
              recipient details.
            </p>
            <p>
              Mobile Money orders require a transaction reference; staff must confirm the payment
              before processing. Delivery customers may choose Cash on Delivery and pay the courier
              on arrival. Pickup from the Abelenkpe taxi rank shop requires confirmed Mobile Money
              payment.
            </p>
            <p>
              Delivery timelines are estimates. Contact the shop for changes, cancellation, returns
              and product-specific warranty terms. Final order totals are calculated by the store at
              submission.
            </p>
          </>
        )}
        {page === "privacy" && (
          <>
            <p>
              We collect your name, email, phone number, delivery address, cart items and Mobile
              Money transaction reference to fulfill and track your order. Authorized store staff
              can access order information.
            </p>
            <p>
              Your cart is saved in this browser. A receipt may be kept for the current browser
              session. Account authentication uses secure managed services. Never provide your
              Mobile Money PIN or OTP.
            </p>
            <p>
              Contact the store to request access to or correction of your customer information. A
              store-approved retention policy should be published before launch.
            </p>
          </>
        )}
        <Button asChild className="mt-5">
          <Link to="/catalogue" search={{ category: "", q: "" }}>
            Shop the catalogue
          </Link>
        </Button>
      </div>
    </div>
  );
}

/**
 * Contact form on `/contact`. One mutation queues two messages: an alert to
 * the shop inbox and an acknowledgement to whoever wrote in. Both go through
 * the shared pipeline, so in dry-run they are rendered and logged rather than
 * transmitted — `/admin/emails` shows them either way.
 */
function ContactForm() {
  const submitContact = useConvexMutation(api.contact.submit);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  return (
    <form
      className="solid-panel mt-6 p-5 text-sm text-foreground"
      onSubmit={(e) => {
        e.preventDefault();
        setBusy(true);
        void submitContact({ name, email, subject, message })
          .then(() => {
            setName("");
            setEmail("");
            setSubject("");
            setMessage("");
            toast.success("Message sent. We reply during opening hours.");
          })
          .catch((error: unknown) =>
            toast.error(errorMessage(error, "Your message could not be sent.")),
          )
          .finally(() => setBusy(false));
      }}
    >
      <h2 className="text-lg">Write to the shop</h2>
      <p className="mt-1 text-muted-foreground">
        Ask about an order, a product or a warranty — we answer during opening hours.
      </p>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <label>
          Your name
          <input
            required
            minLength={2}
            autoComplete="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <label>
          Email
          <input
            required
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
      </div>
      <label className="mt-4 block">
        Topic
        <input
          placeholder="Order question, product detail, warranty…"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
        />
      </label>
      <label className="mt-4 block">
        Message
        <textarea
          required
          minLength={10}
          maxLength={2000}
          rows={5}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
        />
      </label>
      <Button className="mt-4" disabled={busy}>
        {busy ? "Sending…" : "Send message"}
      </Button>
    </form>
  );
}
