import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@cral/ui";
import { AuthShell } from "../components/AuthShell.js";
import { FormField } from "../components/FormField.js";
import { checkPasswordReset, resetPassword } from "../lib/auth-api.js";
import { ApiClientError } from "../lib/api.js";

interface FormValues {
  phone: string;
  code: string;
  new_password: string;
}

type CheckState = "checking" | "valid" | "expired" | "form";

export function ResetPassword(): JSX.Element {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");

  const [state, setState] = useState<CheckState>(token ? "checking" : "form");
  const [serverError, setServerError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const {
    register: field,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>();

  useEffect(() => {
    if (!token) return;
    checkPasswordReset({ token })
      .then((result) => setState(result.valid ? "valid" : "expired"))
      .catch(() => setState("expired"));
  }, [token]);

  async function onSubmit(values: FormValues) {
    setServerError(null);
    setSubmitting(true);
    try {
      await resetPassword(
        token
          ? { token, new_password: values.new_password }
          : { phone: values.phone, code: values.code, new_password: values.new_password },
      );
      navigate("/sign-in", { state: { justReset: true } });
    } catch (err) {
      if (err instanceof ApiClientError && err.code === "reset_token_expired") {
        setState("expired");
      } else if (err instanceof ApiClientError && err.code === "password_breached") {
        setServerError(err.message);
      } else {
        setServerError("Something went wrong. Please try again.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (state === "checking") {
    return (
      <AuthShell title="Checking your link…">
        <p className="text-sm text-slate-600">One moment.</p>
      </AuthShell>
    );
  }

  // This is the "expired link/code handled gracefully instead of a dead
  // end" screen the delivery plan calls out as missing from the original
  // designs (spec §26, code reset_token_expired).
  if (state === "expired") {
    return (
      <AuthShell title="This link has expired">
        <p className="text-sm text-slate-600">
          Reset links and codes only last a little while for your security. Request a new one and we'll
          get you back in.
        </p>
        <Link to="/forgot-password">
          <Button className="mt-4">Request a new link</Button>
        </Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Choose a new password">
      <form className="flex flex-col gap-4" onSubmit={handleSubmit(onSubmit)}>
        {!token && (
          <>
            <FormField
              id="phone"
              label="Phone number"
              placeholder="+254722418903"
              {...field("phone", { required: "Enter the phone number the code was sent to." })}
              error={errors.phone}
            />
            <FormField
              id="code"
              label="Code"
              inputMode="numeric"
              maxLength={6}
              {...field("code", { required: "Enter the 6-digit code." })}
              error={errors.code}
            />
          </>
        )}
        <FormField
          id="new_password"
          label="New password"
          type="password"
          autoComplete="new-password"
          {...field("new_password", {
            required: "Choose a new password.",
            minLength: { value: 10, message: "At least 10 characters." },
          })}
          error={errors.new_password}
        />
        {serverError && <p className="text-sm text-red-600">{serverError}</p>}
        <Button type="submit" disabled={submitting}>
          {submitting ? "Resetting…" : "Reset password"}
        </Button>
      </form>
    </AuthShell>
  );
}
