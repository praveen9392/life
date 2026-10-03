import { useForm } from "react-hook-form";
import { Link, useNavigate } from "react-router-dom";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { Button } from "../../../components/ui/Button";
import { Input } from "../../../components/ui/Input";
import { ApiError } from "../../../services/api/httpClient";
import { useRegister } from "../hooks";

const registerSchema = z.object({
  full_name: z.string().max(200, "Name is too long").optional(),
  email: z.string().email("Enter a valid email address"),
  password: z
    .string()
    .min(10, "Use at least 10 characters")
    .max(128, "Password is too long"),
});

type RegisterForm = z.infer<typeof registerSchema>;

export default function RegisterPage() {
  const navigate = useNavigate();
  const registerMutation = useRegister();

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<RegisterForm>({ resolver: zodResolver(registerSchema) });

  const onSubmit = handleSubmit(async (values) => {
    try {
      await registerMutation.mutateAsync(values);
      void navigate("/onboarding", { replace: true });
    } catch (error) {
      if (error instanceof ApiError && error.fields) {
        for (const [field, message] of Object.entries(error.fields)) {
          setError(field as keyof RegisterForm, { message });
        }
      }
      const message = error instanceof ApiError ? error.message : "Registration failed. Please try again.";
      setError("root", { message });
    }
  });

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-semibold text-text">Create your account</h1>
          <p className="mt-1 text-sm text-text-muted">Your data stays yours, always isolated per account.</p>
        </div>
        <form onSubmit={onSubmit} className="card space-y-4" noValidate>
          <Input
            label="Name (optional)"
            autoComplete="name"
            error={errors.full_name?.message}
            {...register("full_name")}
          />
          <Input
            label="Email"
            type="email"
            autoComplete="email"
            error={errors.email?.message}
            {...register("email")}
          />
          <Input
            label="Password"
            type="password"
            autoComplete="new-password"
            helpText="At least 10 characters."
            error={errors.password?.message}
            {...register("password")}
          />
          {errors.root ? (
            <p role="alert" className="text-sm text-danger">
              {errors.root.message}
            </p>
          ) : null}
          <Button type="submit" className="w-full" isLoading={isSubmitting}>
            Create account
          </Button>
        </form>
        <p className="mt-4 text-center text-sm text-text-muted">
          Already have an account?{" "}
          <Link to="/login" className="font-medium text-accent hover:underline">
            Log in
          </Link>
        </p>
      </div>
    </div>
  );
}
