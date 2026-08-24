import { useState } from "react";
import { useForm } from "react-hook-form";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@cral/ui";
import { AuthShell } from "../components/AuthShell.js";
import { FormField } from "../components/FormField.js";
import { register as registerAccount, verifySignupOtp } from "../lib/auth-api.js";
import { ApiClientError } from "../lib/api.js";

const TERMS_VERSION = "2026-08-24";

interface FormValues {
  full_name: string;
  phone: string;
  email: string;
  password: string;
}

export function CreateAccount(): JSX.Element {
  const navigate = useNavigate();
  const [phone, setPhone] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const {
    register: field,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>();

  const codeForm = useForm<{ code: string }>();

  async function onSubmit(values: FormValues) {
    setServerError(null);
    setSubmitting(true);
    try {
      const result = await registerAccount({
        ...values,
        role: "customer",
        accepted_terms_version: TERMS_VERSION,
      });
      setPhone(result.user.phone);
    } catch (err) {
      setServerError(err instanceof ApiClientError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  async function onVerify(values: { code: string }) {
    if (!phone) return;
    setServerError(null);
    try {
      await verifySignupOtp(phone, values.code);
      navigate("/sign-in", { state: { justVerified: true } });
    } catch (err) {
      setServerError(err instanceof ApiClientError ? err.message : "That code didn't work. Try again.");
    }
  }

  if (phone) {
    return (
      <AuthShell title="Verify your phone">
        <p className="mb-4 text-sm text-slate-600">
          We sent a 6-digit code to <strong>{phone}</strong>.
        </p>
        <form className="flex flex-col gap-4" onSubmit={codeForm.handleSubmit(onVerify)}>
          <FormField
            id="code"
            label="Verification code"
            inputMode="numeric"
            maxLength={6}
            {...codeForm.register("code", { required: "Enter the code we sent you." })}
            error={codeForm.formState.errors.code}
          />
          {serverError && <p className="text-sm text-red-600">{serverError}</p>}
          <Button type="submit">Verify</Button>
        </form>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Create your account">
      <form className="flex flex-col gap-4" onSubmit={handleSubmit(onSubmit)}>
        <FormField
          id="full_name"
          label="Full name"
          {...field("full_name", { required: "Enter your name." })}
          error={errors.full_name}
        />
        <FormField
          id="phone"
          label="Phone number"
          placeholder="+254722418903"
          {...field("phone", { required: "Enter your phone number." })}
          error={errors.phone}
        />
        <FormField
          id="email"
          label="Email"
          type="email"
          {...field("email", { required: "Enter your email." })}
          error={errors.email}
        />
        <FormField
          id="password"
          label="Password"
          type="password"
          autoComplete="new-password"
          {...field("password", {
            required: "Choose a password.",
            minLength: { value: 10, message: "At least 10 characters." },
          })}
          error={errors.password}
        />
        {serverError && <p className="text-sm text-red-600">{serverError}</p>}
        <Button type="submit" disabled={submitting}>
          {submitting ? "Creating account…" : "Create account"}
        </Button>
      </form>
      <p className="mt-4 text-sm text-slate-600">
        Already have an account?{" "}
        <Link to="/sign-in" className="font-medium text-slate-900 hover:underline">
          Sign in
        </Link>
      </p>
    </AuthShell>
  );
}
