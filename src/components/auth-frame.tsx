import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { MapPin, Truck, Wallet } from "lucide-react";
import { storeQuery } from "@/lib/store";
import { images, imageSize } from "@/lib/store-images";

type AuthFrameProps = {
  /** The page's single h1, rendered above the form column. */
  title: string;
  lead?: ReactNode;
  /** Widens the form column for the signed-in account view (orders, addresses). */
  wide?: boolean;
  children?: ReactNode;
};

/**
 * The shell behind `/account` and the `/staff` gate: the shop's own photo,
 * wordmark and facts beside the form, so signing in never leaves the store's
 * visual world. The panel repeats only what the footer already states — the
 * address, the delivery reach and the payment methods — so it can never claim
 * something the rest of the shop does not.
 *
 * Below 900px the split stops fitting, so the panel folds into a branded band
 * above the form and the copy under it steps aside.
 */
export function AuthFrame({ title, lead, wide, children }: AuthFrameProps) {
  const { data } = useQuery(storeQuery);
  const photo = images[data?.settings.setup_image ?? "workspace"];
  return (
    <div className="page-content wrap auth-page">
      <div className="auth-card glass" data-wide={wide ? "" : undefined}>
        <aside className="auth-brand">
          <img className="auth-brand-photo" src={photo} alt="" />
          <Link to="/" className="auth-lockup">
            <img src={images["logo"]} {...imageSize("logo")} alt="" />
            <span className="brand-text">
              MB VENTURES<span className="auth-lockup-gh"> GH</span>
              <small>YOUR WORKSPACE STORE</small>
            </span>
          </Link>
          <div className="auth-brand-foot">
            <p>
              Computer accessories, desks and chairs. A real shop at Abelenkpe, Accra, with delivery
              across Ghana.
            </p>
            <ul className="auth-facts">
              <li>
                <MapPin aria-hidden />
                Abelenkpe, Accra
              </li>
              <li>
                <Truck aria-hidden />
                Delivery across Ghana
              </li>
              <li>
                <Wallet aria-hidden />
                Pay on pickup or delivery
              </li>
            </ul>
          </div>
        </aside>
        <section className="auth-panel">
          <div className="auth-panel-inner">
            <h1 className="auth-title">{title}</h1>
            {lead ? <p className="auth-lead">{lead}</p> : null}
            {children}
          </div>
        </section>
      </div>
    </div>
  );
}
