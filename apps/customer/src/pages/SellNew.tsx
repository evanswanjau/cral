import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useSeo } from "../lib/use-seo.js";
import { ApiClientError } from "../lib/api.js";
import { PageHero, Section, Card } from "../components/site/marketing.js";
import { EMPTY_FORM, createListing, myListings, type SaleForm } from "../lib/sales-api.js";
import { SaleFormFields, saleFormIncomplete } from "../components/sale/SaleFormFields.js";
import { Button, Notice } from "../components/sale/ui.js";

/** A private seller starts a listing (docs/plans/car-sales.md). Photos and the logbook come next, on the listing's own page. */
export function SellNew(): JSX.Element {
  useSeo({ title: "List a car for sale", path: "/sell/new" });
  const navigate = useNavigate();
  const { data: mine } = useQuery({ queryKey: ["my-sale-listings"], queryFn: myListings });
  const [form, setForm] = useState<SaleForm>(EMPTY_FORM);
  const [showErrors, setShowErrors] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (saleFormIncomplete(form)) {
      setShowErrors(true);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const created = await createListing(form);
      navigate(`/my-listings/${created.id}`);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Couldn't save that. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <PageHero
        kicker="SELL A CAR"
        title="Tell buyers about the car."
        sub="Describe it honestly. Next you add the logbook and eight photos, and a person reads them before the advert goes live. Buyers never see your number unless you share it."
      />
      <Section>
        {mine?.seller.type === "merchant" && (
          <Notice tone="blue">You have a merchant account - list cars for sale from the merchant portal's "For sale" page instead.</Notice>
        )}
        {mine && !mine.seller.cleared && mine.seller.reason && (
          <Notice>{mine.seller.reason} You can prepare the listing now; it goes live once that is done.</Notice>
        )}
        {error && <Notice tone="red">{error}</Notice>}
        <Card>
          <SaleFormFields value={form} onChange={setForm} showErrors={showErrors} />
          <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", marginTop: 8 }}>
            <Button onClick={() => void save()} disabled={saving}>{saving ? "Saving..." : "Save and add photos"}</Button>
            {showErrors && saleFormIncomplete(form) && (
              <span style={{ font: "600 13px/1 'Instrument Sans',sans-serif", color: "#D81E32" }}>Check the highlighted fields.</span>
            )}
          </div>
        </Card>
      </Section>
    </div>
  );
}
