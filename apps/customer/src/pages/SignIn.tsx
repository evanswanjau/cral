import { useState } from "react";
import { useForm } from "react-hook-form";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@cral/ui";
import { AuthShell } from "../components/AuthShell.js";
import { FormField } from "../components/FormField.js";
import { login } from "../lib/auth-api.js";
import { setSession } from "../lib/auth.js";
import { ApiClientError } from "../lib/api.js";

interface FormValues {
  identifier: string;
  password: string;
}

export function SignIn(): JSX.Element {
  const navigate = useNavigate();
  const [serverError, setServerError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const {
    register: field,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>();

  async function onSubmit(values: FormValues) {
    setServerError(null);
    setSubmitting(true);
    try {
      const result = await login(values.identifier, values.password, deviceId());
      setSession(result);
      navigate("/");
    } catch (err) {
      if (err instanceof ApiClientError) {
        if (err.code === "account_locked") {
          setServerError("Too many failed attempts. Try again in a few minutes, or reset your password.");
        } else {
          setServerError(err.message);
        }
      } else {
        setServerError("Something went wrong. Please try again.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthShell title="Sign in">
      <form className="flex flex-col gap-4" onSubmit={handleSubmit(onSubmit)}>
        <FormField
          id="identifier"
          label="Phone or email"
          autoComplete="username"
          {...field("identifier", { required: "Enter your phone or email." })}
          error={errors.identifier}
        />
        <FormField
          id="password"
          label="Password"
          type="password"
          autoComplete="current-password"
          {...field("password", { required: "Enter your password." })}
          error={errors.password}
        />
        {serverError && <p className="text-sm text-red-600">{serverError}</p>}
        <Button type="submit" disabled={submitting}>
          {submitting ? "Signing in…" : "Sign in"}
        </Button>
      </form>
      <div className="mt-4 flex flex-col gap-1 text-sm text-slate-600">
        <Link to="/forgot-password" className="hover:underline">
          Forgot your password?
        </Link>
        <span>
          New here?{" "}
          <Link to="/create-account" className="font-medium text-slate-900 hover:underline">
            Create an account
          </Link>
        </span>
      </div>
    </AuthShell>
  );
}

function deviceId(): string {
  const KEY = "cral_customer_device_id";
  let id = window.localStorage.getItem(KEY);
  if (!id) {
    id = `dev_${crypto.randomUUID()}`;
    window.localStorage.setItem(KEY, id);
  }
  return id;
}
