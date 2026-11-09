import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useSeo } from "../lib/use-seo.js";
import { PageHero, Section, Card, Body } from "../components/site/marketing.js";
import { kes, myListings } from "../lib/sales-api.js";
import { Button, Notice, StatusChip } from "../components/sale/ui.js";

/** A private seller's cars for sale - the account's "Listing" tab in the canvas. */
export function MyListings(): JSX.Element {
  useSeo({ title: "Your cars for sale", path: "/my-listings" });
  const { data, isLoading } = useQuery({ queryKey: ["my-sale-listings"], queryFn: myListings });
  const atLimit = data?.seller.limit != null && data.data.filter((l) => !["sold", "withdrawn", "expired", "removed"].includes(l.status)).length >= data.seller.limit;

  return (
    <div>
      <PageHero kicker="SELL A CAR" title="Your cars for sale" />
      <Section>
        {data && !data.seller.cleared && data.seller.reason && <Notice>{data.seller.reason}</Notice>}
        <div style={{ marginBottom: 16 }}>
          {atLimit ? (
            <Body>You have {data?.seller.limit} cars on the go - the most a private account can have at once.</Body>
          ) : (
            <Link to="/sell/new" style={{ textDecoration: "none" }}>
              <Button>List another car</Button>
            </Link>
          )}
        </div>
        {isLoading && <Body>Loading...</Body>}
        {data && data.data.length === 0 && (
          <Card>
            <Body>Nothing listed yet.</Body>
          </Card>
        )}
        {data?.data.map((l) => (
          <Link key={l.id} to={`/my-listings/${l.id}`} style={{ textDecoration: "none", display: "block" }}>
            <Card>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
                <div>
                  <div style={{ font: "600 16px/1.3 'Instrument Sans',sans-serif", color: "#0B0F1A" }}>{l.title}</div>
                  <div style={{ font: "400 13px/1.5 'Instrument Sans',sans-serif", color: "#5A6373" }}>
                    {kes(l.asking_price)} · {l.car.registration}
                    {l.enquiries.new > 0 ? ` · ${l.enquiries.new} new ${l.enquiries.new === 1 ? "enquiry" : "enquiries"}` : ""}
                  </div>
                </div>
                <StatusChip status={l.status} />
              </div>
            </Card>
          </Link>
        ))}
      </Section>
    </div>
  );
}
