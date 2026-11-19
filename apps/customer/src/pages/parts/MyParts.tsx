import { useEffect, useState, type CSSProperties, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiClientError } from "../../lib/api.js";
import { usePageTitle } from "../../lib/use-page-title.js";
import { COUNTIES } from "../../lib/kenya.js";
import { carName, createPartsRequest, listCars, listGarageRequests } from "../../lib/garage-api.js";
import { Field, fieldInput } from "../../components/garage/CarFields.js";
import { requestStatusLine } from "../../components/garage/YourGarageRequests.js";
import { bodyText } from "../../components/subsite/Section.js";

/**
 * `/my-parts`: ask parts dealers for a part, and the customer's parts
 * requests (Phase 5 PT1, docs/decisions/parts.md). Signed in only, from the
 * account menu and the public `/parts` landing (PT2).
 *
 * A part is quoted against the car's chassis number, so only cars in My
 * cars that carry one can be picked. Up to 5 parts dealers CRAL has
 * checked in the county get the request. The request page and the order
 * page are the garage ones, which read a parts request in its own words.
 *
 * Not from a canvas (none exists for parts yet); built from tokens.ts and
 * the garage request form.
 */

export function MyParts(): JSX.Element {
  usePageTitle("My parts");
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: cars, isLoading: carsLoading } = useQuery({ queryKey: ["my-cars"], queryFn: listCars });
  const { data: requests } = useQuery({ queryKey: ["garage-requests", "list", "part"], queryFn: () => listGarageRequests("part") });
  const withChassis = (cars?.data ?? []).filter((c) => c.chassis_number);
  const withoutChassis = (cars?.data ?? []).length - withChassis.length;

  const [carId, setCarId] = useState("");
  const [partName, setPartName] = useState("");
  const [county, setCounty] = useState("");
  const [description, setDescription] = useState("");
  const [address, setAddress] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!carId && withChassis[0]) setCarId(withChassis[0].id);
  }, [withChassis.length]); // eslint-disable-line react-hooks/exhaustive-deps

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!carId) return setError("Pick the car the part is for.");
    if (partName.trim().length < 3) return setError("Name the part, like front brake pads.");
    if (!county) return setError("Pick your county.");
    if (description.trim().length < 10) return setError("Say a little more: which side, any part number, what's wrong.");
    if (address.trim().length < 5) return setError("Enter where the part should be delivered.");
    setSending(true);
    try {
      const created = await createPartsRequest({
        car_id: carId,
        part_name: partName.trim(),
        county,
        description: description.trim(),
        delivery_address: address.trim(),
      });
      await queryClient.invalidateQueries({ queryKey: ["garage-requests"] });
      navigate(`/garage/requests/${created.id}`);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Couldn't send that. Try again.");
    } finally {
      setSending(false);
    }
  }

  const list = requests?.data ?? [];
  return (
    <div style={S.wrap}>
      <div style={S.mono}>SPARE PARTS</div>
      <h1 style={S.h1}>Ask for a part</h1>
      <p style={{ ...bodyText, maxWidth: 640 }}>
        Up to 5 parts dealers CRAL has checked in your county quote against your car&rsquo;s chassis number: genuine, OEM
        or used, delivered to you or fitted at their premises. You pay CRAL, and the dealer is paid only after you confirm
        it&rsquo;s the right part.
      </p>

      {carsLoading ? (
        <p style={bodyText}>Loading…</p>
      ) : withChassis.length === 0 ? (
        <div style={S.notice}>
          A part is quoted against the chassis number on your logbook.{" "}
          {withoutChassis > 0 ? "None of your cars has one yet." : "Add your car first."}{" "}
          <Link to="/my-cars" style={{ color: "#0F23A8", fontWeight: 600 }}>Go to My cars</Link>
        </div>
      ) : (
        <form onSubmit={(e) => void onSubmit(e)} style={S.form}>
          <Field label="Your car">
            <select style={fieldInput} value={carId} onChange={(e) => setCarId(e.target.value)}>
              {withChassis.map((c) => (
                <option key={c.id} value={c.id}>
                  {carName(c)} · {c.plate}
                </option>
              ))}
            </select>
          </Field>
          {withoutChassis > 0 && (
            <p style={{ ...bodyText, fontSize: 12 }}>
              Cars without a chassis number aren&rsquo;t listed. <Link to="/my-cars" style={{ color: "#0F23A8" }}>Add it in My cars</Link>.
            </p>
          )}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,200px),1fr))", gap: 12 }}>
            <Field label="The part">
              <input style={fieldInput} value={partName} maxLength={120} onChange={(e) => setPartName(e.target.value)} placeholder="Front brake pads" />
            </Field>
            <Field label="County">
              <select style={fieldInput} value={county} onChange={(e) => setCounty(e.target.value)}>
                <option value="">Select a county</option>
                {COUNTIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </Field>
          </div>
          <Field label="Details">
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              maxLength={2000}
              placeholder="Both sides. The old pads are worn to the metal."
              style={{ ...fieldInput, height: "auto", padding: 12, lineHeight: 1.5, resize: "vertical" }}
            />
          </Field>
          <Field label="Delivery address">
            <textarea
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              rows={2}
              maxLength={500}
              placeholder="Street, building and how to find it"
              style={{ ...fieldInput, height: "auto", padding: 12, lineHeight: 1.5, resize: "vertical" }}
            />
          </Field>
          {error && <p role="alert" style={{ ...bodyText, color: "#A50E22", margin: 0 }}>{error}</p>}
          <button type="submit" disabled={sending} style={{ ...S.primary, opacity: sending ? 0.7 : 1 }}>
            {sending ? "Sending…" : "Ask dealers for a price"}
          </button>
          <p style={{ ...bodyText, fontSize: 12, margin: 0 }}>
            Asking is free. A dealer that delivers adds the delivery price to its quote.
          </p>
        </form>
      )}

      {list.length > 0 && (
        <section style={{ marginTop: 32 }}>
          <h2 style={S.h2}>Your parts requests</h2>
          <div style={{ display: "grid", gap: 10 }}>
            {list.map((r) => (
              <Link key={r.id} to={`/garage/requests/${r.id}`} style={S.row}>
                <div style={{ flex: "1 1 220px", minWidth: 0 }}>
                  <div style={{ font: "600 14px/1.4 'Instrument Sans',sans-serif", color: "#0B0F1A", overflowWrap: "anywhere" }}>
                    {r.part_name ?? "A part"} · {r.car ? carName(r.car) : "Your car"}
                  </div>
                  <p style={{ ...bodyText, fontSize: 13 }}>{requestStatusLine(r)}</p>
                </div>
                <span style={{ font: "600 13px/1 'Instrument Sans',sans-serif", color: "#0F23A8" }}>Open ›</span>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

const S = {
  wrap: { maxWidth: 880, margin: "0 auto", padding: "clamp(24px,4vw,48px) clamp(16px,4vw,40px)" },
  mono: { font: "500 10px/1.4 'IBM Plex Mono',monospace", letterSpacing: ".1em", color: "#838C9B" },
  h1: { margin: "6px 0 10px", font: "700 clamp(24px,3.4vw,34px)/1.1 Archivo,sans-serif", fontVariationSettings: "'wdth' 108", letterSpacing: "-.02em", color: "#0B0F1A" },
  h2: { margin: "0 0 12px", font: "700 20px/1.2 Archivo,sans-serif", fontVariationSettings: "'wdth' 106", color: "#0B0F1A" },
  form: { display: "grid", gap: 12, marginTop: 20, padding: 18, background: "#FFFFFF", border: "1px solid #E4E7EC", borderRadius: 12, maxWidth: 640 },
  notice: { marginTop: 18, padding: "12px 14px", background: "#EDEFFC", border: "1px solid #C3CBF5", borderRadius: 8, font: "400 13px/1.5 'Instrument Sans',sans-serif", color: "#0F23A8" },
  primary: { height: 48, border: "none", borderRadius: 8, background: "#0F23A8", color: "#FFFFFF", font: "600 15px/1 'Instrument Sans',sans-serif", cursor: "pointer" },
  row: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    flexWrap: "wrap",
    minHeight: 44,
    padding: "14px 18px",
    background: "#FFFFFF",
    border: "1px solid #E4E7EC",
    borderRadius: 12,
    textDecoration: "none",
  },
} satisfies Record<string, CSSProperties>;
