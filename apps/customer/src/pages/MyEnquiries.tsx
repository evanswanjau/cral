import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useSeo } from "../lib/use-seo.js";
import { PageHero, Section, Card, Body } from "../components/site/marketing.js";
import { myEnquiries } from "../lib/sales-api.js";
import { Notice, SAFETY_LINE } from "../components/sale/ui.js";

/** Cars a buyer has asked about, and what each seller said back. */
export function MyEnquiries(): JSX.Element {
  useSeo({ title: "Cars I asked about", path: "/my-enquiries" });
  const { data, isLoading } = useQuery({ queryKey: ["my-sale-enquiries"], queryFn: myEnquiries });

  return (
    <div>
      <PageHero kicker="BUY A CAR" title="Cars I asked about" />
      <Section>
        <Notice>{SAFETY_LINE}</Notice>
        {isLoading && <Body>Loading...</Body>}
        {data && data.data.length === 0 && (
          <Card>
            <Body>
              You haven't asked about any cars yet. <Link to="/buy">Browse cars for sale</Link>.
            </Body>
          </Card>
        )}
        {data?.data.map((e) => (
          <Card key={e.id}>
            <div style={{ font: "600 16px/1.3 'Instrument Sans',sans-serif", color: "#0B0F1A" }}>
              {e.listing.ref && e.listing.status !== "sold" ? <Link to={`/buy/${e.listing.ref}`}>{e.listing.title}</Link> : e.listing.title}
              {e.listing.status === "sold" && <span style={{ fontWeight: 400, color: "#5A6373" }}> · sold</span>}
            </div>
            <div style={{ font: "400 13.5px/1.5 'Instrument Sans',sans-serif", color: "#5A6373", marginTop: 4 }}>You: {e.message}</div>
            {e.reply && <div style={{ font: "400 13.5px/1.5 'Instrument Sans',sans-serif", color: "#333B4A", marginTop: 4 }}>Seller: {e.reply}</div>}
            {e.seller_phone ? (
              <div style={{ font: "600 14px/1.5 'Instrument Sans',sans-serif", color: "#076945", marginTop: 6 }}>
                Seller's number: <a href={`tel:${e.seller_phone}`}>{e.seller_phone}</a>
              </div>
            ) : (
              <div style={{ font: "400 13px/1.5 'Instrument Sans',sans-serif", color: "#838C9B", marginTop: 6 }}>
                {e.status === "closed" ? "The seller closed this enquiry." : "Waiting for the seller."}
              </div>
            )}
          </Card>
        ))}
      </Section>
    </div>
  );
}
