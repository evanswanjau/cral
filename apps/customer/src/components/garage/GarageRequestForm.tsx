import { useEffect, useRef, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiClientError } from "../../lib/api.js";
import { useIsAuthenticated } from "../../lib/auth.js";
import { COUNTIES } from "../../lib/kenya.js";
import { clearSessionDraft, readSessionDraft, writeSessionDraft } from "../../lib/session-draft.js";
import {
  SERVICE_LABELS,
  SERVICE_TYPES,
  carName,
  createCar,
  createGarageRequest,
  listCars,
  type ServiceType,
} from "../../lib/garage-api.js";
import { CarFields, EMPTY_CAR, Field, carDraftProblem, fieldInput, toCarInput, type CarDraft } from "./CarFields.js";

/**
 * The garage request, in the garage hero (Phase 4 GS2). Public to fill
 * in, like the tow form: a signed-out visitor's request is kept in
 * `sessionStorage` through sign-in (`?next=/garage`) and sent the moment
 * they land back. A signed-in customer picks one of My cars or adds
 * another here; a new car is saved to My cars first.
 *
 * Not from a canvas; built from tokens.ts and the towing form.
 */

const DRAFT_KEY = "cral.garage-request";
const NEW_CAR = "new";

interface Draft {
  carId: string;
  car: CarDraft;
  service: ServiceType;
  county: string;
  description: string;
}

function plateKey(p: string): string {
  return p.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function GarageRequestForm(): JSX.Element {
  const isAuthenticated = useIsAuthenticated();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [kept] = useState(() => readSessionDraft<Draft>(DRAFT_KEY));
  const { data: cars } = useQuery({ queryKey: ["my-cars"], queryFn: listCars, enabled: isAuthenticated });
  const myCars = cars?.data ?? [];

  const [carId, setCarId] = useState(kept?.carId ?? NEW_CAR);
  const [car, setCar] = useState<CarDraft>(kept?.car ?? EMPTY_CAR);
  const [service, setService] = useState<ServiceType>(kept?.service ?? "service");
  const [county, setCounty] = useState(kept?.county ?? "");
  const [description, setDescription] = useState(kept?.description ?? "");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const resumed = useRef(false);

  // A signed-in customer with cars starts on their newest one.
  useEffect(() => {
    if (!kept && carId === NEW_CAR && myCars[0]) setCarId(myCars[0].id);
  }, [myCars.length]); // eslint-disable-line react-hooks/exhaustive-deps

  async function send(d: Draft) {
    setError(null);
    setSending(true);
    try {
      let id = d.carId;
      if (id === NEW_CAR) {
        try {
          id = (await createCar(toCarInput(d.car))).id;
        } catch (err) {
          // Already in My cars: use that one.
          if (!(err instanceof ApiClientError) || err.code !== "car_exists") throw err;
          const existing = (await listCars()).data.find((c) => plateKey(c.plate) === plateKey(d.car.plate));
          if (!existing) throw err;
          id = existing.id;
        }
        await queryClient.invalidateQueries({ queryKey: ["my-cars"] });
      }
      const created = await createGarageRequest({ car_id: id, service_type: d.service, county: d.county, description: d.description });
      clearSessionDraft(DRAFT_KEY);
      await queryClient.invalidateQueries({ queryKey: ["garage-requests"] });
      navigate(`/garage/requests/${created.id}`);
    } catch (err) {
      clearSessionDraft(DRAFT_KEY);
      setError(err instanceof ApiClientError ? err.message : "Couldn't send that. Try again.");
    } finally {
      setSending(false);
    }
  }

  // Back from sign-in with a kept request: send it, once.
  useEffect(() => {
    if (!isAuthenticated || !kept || resumed.current) return;
    resumed.current = true;
    void send(kept);
  }, [isAuthenticated]); // eslint-disable-line react-hooks/exhaustive-deps

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const usingNew = carId === NEW_CAR;
    const problem = usingNew ? carDraftProblem(car) : null;
    if (problem) return setError(problem);
    if (!county) return setError("Pick the county the car is in.");
    if (description.trim().length < 10) return setError("Say a little more about what the car needs.");
    const draft: Draft = { carId, car, service, county, description: description.trim() };
    if (!isAuthenticated) {
      writeSessionDraft(DRAFT_KEY, draft);
      navigate(`/sign-in?next=${encodeURIComponent("/garage")}`);
      return;
    }
    void send(draft);
  }

  return (
    <div style={{ background: "#FFFFFF", borderRadius: 12, padding: "18px 18px 16px", boxShadow: "0 12px 32px rgba(11,15,26,.28)" }}>
      <form onSubmit={onSubmit} style={{ display: "grid", gap: 12 }}>
        {isAuthenticated && myCars.length > 0 && (
          <Field label="Your car">
            <select style={fieldInput} value={carId} onChange={(e) => setCarId(e.target.value)}>
              {myCars.map((c) => (
                <option key={c.id} value={c.id}>
                  {carName(c)} · {c.plate}
                </option>
              ))}
              <option value={NEW_CAR}>Another car</option>
            </select>
          </Field>
        )}
        {carId === NEW_CAR && <CarFields value={car} onChange={setCar} />}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,150px),1fr))", gap: 12 }}>
          <Field label="What it needs">
            <select style={fieldInput} value={service} onChange={(e) => setService(e.target.value as ServiceType)}>
              {SERVICE_TYPES.map((t) => (
                <option key={t} value={t}>{SERVICE_LABELS[t]}</option>
              ))}
            </select>
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
        <Field label="Describe the problem">
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            placeholder="Full service due, and a squeak from the front left when braking."
            style={{ ...fieldInput, height: "auto", padding: 12, lineHeight: 1.5, resize: "vertical" }}
          />
        </Field>
        {error && (
          <p role="alert" style={{ margin: 0, font: "500 13px/1.5 'Instrument Sans',sans-serif", color: "#A50E22" }}>
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={sending}
          style={{
            height: 48,
            border: "none",
            borderRadius: 8,
            background: "#0F23A8",
            color: "#FFFFFF",
            font: "600 15px/1 'Instrument Sans',sans-serif",
            cursor: sending ? "default" : "pointer",
            opacity: sending ? 0.7 : 1,
          }}
        >
          {sending ? "Sending…" : "Ask garages for a price"}
        </button>
        <p style={{ margin: 0, font: "400 12px/1.5 'Instrument Sans',sans-serif", color: "#5A6373" }}>
          Up to 5 garages CRAL has visited in your county get your request. Asking is free.
        </p>
      </form>
    </div>
  );
}
