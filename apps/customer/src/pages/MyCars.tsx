import { useState, type CSSProperties } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiClientError } from "../lib/api.js";
import { usePageTitle } from "../lib/use-page-title.js";
import { carName, createCar, deleteCar, listCars, updateCar, type Car } from "../lib/garage-api.js";
import { CarFields, EMPTY_CAR, carDraftProblem, toCarInput, type CarDraft } from "../components/garage/CarFields.js";
import { bodyText } from "../components/subsite/Section.js";

/**
 * `/my-cars`: the customer's own cars (Phase 4 GS2). Every garage request
 * names one of these, and GS4 hangs the service record off each. A car
 * with requests on it stays (its history does too).
 *
 * Not from a canvas; built from tokens.ts and the sub-site's idiom.
 */

function toDraft(c: Car): CarDraft {
  return { make: c.make, model: c.model, year: String(c.year), plate: c.plate, chassis_number: c.chassis_number ?? "" };
}

export function MyCars(): JSX.Element {
  usePageTitle("My cars");
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["my-cars"], queryFn: listCars });
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [draft, setDraft] = useState<CarDraft>(EMPTY_CAR);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cars = data?.data ?? [];

  function open(id: string | "new", d: CarDraft) {
    setEditing(id);
    setDraft(d);
    setError(null);
  }

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      setEditing(null);
      await queryClient.invalidateQueries({ queryKey: ["my-cars"] });
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "That didn't save. Try again.");
    } finally {
      setBusy(false);
    }
  }

  function save() {
    const problem = carDraftProblem(draft);
    if (problem) return setError(problem);
    void run(() => (editing === "new" ? createCar(toCarInput(draft)) : updateCar(editing!, toCarInput(draft))));
  }

  const form = (
    <div style={S.card}>
      <CarFields value={draft} onChange={setDraft} />
      {error && <p role="alert" style={{ ...bodyText, color: "#A50E22", marginTop: 10 }}>{error}</p>}
      <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
        <button type="button" style={S.primary} disabled={busy} onClick={save}>{busy ? "Saving…" : "Save car"}</button>
        <button type="button" style={S.secondary} onClick={() => setEditing(null)}>Cancel</button>
      </div>
    </div>
  );

  return (
    <div style={S.wrap}>
      <h1 style={S.h1}>My cars</h1>
      <p style={{ ...bodyText, maxWidth: 600 }}>
        The cars you ask garages about. Your chassis number is shown only to the garages you ask to quote.
      </p>

      <div style={{ display: "grid", gap: 10, marginTop: 20 }}>
        {isLoading && <p style={bodyText}>Loading…</p>}
        {!isLoading && cars.length === 0 && editing !== "new" && <p style={bodyText}>No cars yet.</p>}
        {cars.map((c) =>
          editing === c.id ? (
            <div key={c.id}>{form}</div>
          ) : (
            <div key={c.id} style={{ ...S.card, display: "flex", gap: 12, alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" }}>
              <div style={{ minWidth: 0 }}>
                <div style={S.title}>{carName(c)}</div>
                <div style={{ ...bodyText, fontSize: 13, fontFamily: "'IBM Plex Mono',monospace" }}>
                  {c.plate}
                  {c.chassis_number ? ` · ${c.chassis_number}` : ""}
                </div>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button type="button" style={S.secondary} onClick={() => open(c.id, toDraft(c))}>Edit</button>
                <button type="button" style={{ ...S.secondary, color: "#A50E22" }} disabled={busy} onClick={() => void run(() => deleteCar(c.id))}>
                  Remove
                </button>
              </div>
            </div>
          ),
        )}
        {editing === "new" ? form : (
          <div>
            <button type="button" style={S.primary} onClick={() => open("new", EMPTY_CAR)}>Add a car</button>
          </div>
        )}
        {error && editing === null && <p role="alert" style={{ ...bodyText, color: "#A50E22" }}>{error}</p>}
      </div>

      <p style={{ ...bodyText, marginTop: 24 }}>
        Need work done? <Link to="/garage" style={{ color: "#0F23A8", fontWeight: 600 }}>Ask garages for a price</Link>.
      </p>
    </div>
  );
}

const S = {
  wrap: { maxWidth: 880, margin: "0 auto", padding: "clamp(24px,4vw,48px) clamp(16px,4vw,40px)" },
  h1: { margin: "0 0 10px", font: "700 clamp(26px,3.6vw,36px)/1.1 Archivo,sans-serif", fontVariationSettings: "'wdth' 108", letterSpacing: "-.02em", color: "#0B0F1A" },
  title: { font: "600 16px/1.3 Archivo,sans-serif", color: "#0B0F1A" },
  card: { padding: 16, background: "#FFFFFF", border: "1px solid #E4E7EC", borderRadius: 12 },
  primary: { height: 44, padding: "0 18px", background: "#0F23A8", border: "none", borderRadius: 8, font: "600 14px/1 'Instrument Sans',sans-serif", color: "#FFFFFF", cursor: "pointer" },
  secondary: { height: 44, padding: "0 16px", background: "#FFFFFF", border: "1px solid #CDD2DA", borderRadius: 8, font: "600 14px/1 'Instrument Sans',sans-serif", color: "#0F23A8", cursor: "pointer" },
} satisfies Record<string, CSSProperties>;
