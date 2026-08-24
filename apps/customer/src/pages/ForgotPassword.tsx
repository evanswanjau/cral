import { useState } from "react";
import { useForm } from "react-hook-form";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@cral/ui";
import { AuthShell } from "../components/AuthShell.js";
import { FormField } from "../components/FormField.js";
import { forgotPassword } from "../lib/auth-api.js";

interface FormValues {
  identifier: string;
}

export function ForgotPassword(): JSX.Element {
  const navigate = useNavigate();
  const [sent, setSent] = useState(false);
  const [identifier, setIdentifier] = useState("");
  const {
    register: field,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>();

  async function onSubmit(values: FormValues) {
    // Always shows the same neutral confirmation, whether or not an account
    // exists for this identifier (spec §6) — never surface a lookup error here.
    await forgotPassword(values.identifier).catch(() => undefined);
    setIdentifier(values.identifier);
    setSent(true);
  }

  if (sent) {
    return (
      <AuthShell title="Check your phone or email">
        <p className="text-sm text-slate-600">
          If an account exists for <strong>{identifier}</strong>, we've sent instructions to reset the
          password. A text message code expires in 10 minutes; an email link expires in 30.
        </p>
        <Button className="mt-4" onClick={() => navigate("/reset-password")}>
          I have a code
        </Button>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Forgot your password?">
      <form className="flex flex-col gap-4" onSubmit={handleSubmit(onSubmit)}>
        <FormField
          id="identifier"
          label="Phone or email"
          {...field("identifier", { required: "Enter your phone or email." })}
          error={errors.identifier}
        />
        <Button type="submit">Send instructions</Button>
      </form>
      <p className="mt-4 text-sm text-slate-600">
        <Link to="/sign-in" className="hover:underline">
          Back to sign in
        </Link>
      </p>
    </AuthShell>
  );
}
