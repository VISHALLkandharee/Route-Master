"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { motion, AnimatePresence } from "framer-motion";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { Eye, EyeOff, Loader2, MapPin, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";

// ─── Zod Schema ───────────────────────────────────────────────

const signupSchema = z
  .object({
    fullName: z.string().min(2, "Full name must be at least 2 characters"),
    email: z.string().email("Enter a valid email address"),
    password: z.string().min(6, "Password must be at least 6 characters"),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

type SignupFormData = z.infer<typeof signupSchema>;

// ─── Animation Variants ───────────────────────────────────────

const pageVariants = {
  hidden: { opacity: 0, y: 32 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.5,
      ease: [0.22, 1, 0.36, 1] as [number, number, number, number],
    },
  },
};

const errorVariants = {
  hidden: { opacity: 0, y: -4, height: 0 },
  visible: {
    opacity: 1,
    y: 0,
    height: "auto",
    transition: { duration: 0.2 },
  },
  exit: {
    opacity: 0,
    height: 0,
    transition: { duration: 0.15 },
  },
};

// ─── Component ────────────────────────────────────────────────

export default function SignupPage() {
  const router = useRouter();
  const supabase = createClient();

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [successMode, setSuccessMode] = useState<"confirmation" | "onboarding" | null>(null);
  const [signupEmail, setSignupEmail] = useState("");
  const [isResendingConfirmation, setIsResendingConfirmation] = useState(false);
  const [shake, setShake] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SignupFormData>({
    resolver: zodResolver(signupSchema),
    defaultValues: {
      fullName: "",
      email: "",
      password: "",
      confirmPassword: "",
    },
  });

  // ─── Shake on validation error ───────────────────────────────

  const triggerShake = () => {
    setShake(true);
    setTimeout(() => setShake(false), 400);
  };

  // ─── Submit ─────────────────────────────────────────────────

  const onSubmit = async (data: SignupFormData) => {
    setSignupEmail(data.email.trim());
    let signupResult: Awaited<ReturnType<typeof supabase.auth.signUp>>;
    try {
      signupResult = await supabase.auth.signUp({
        email: data.email.trim(),
        password: data.password,
        options: {
          data: { full_name: data.fullName.trim() },
        },
      });
    } catch {
      triggerShake();
      toast.error("We couldn’t reach the sign-up service. Check your connection and try again.");
      return;
    }

    const { data: authData, error } = signupResult;

    if (error) {
      triggerShake();
      toast.error(error.message);
      return;
    }

    if (
      authData.user &&
      authData.user.identities &&
      authData.user.identities.length === 0
    ) {
      triggerShake();
      toast.error(
        "An account with this email already exists. Please sign in instead.",
      );
      return;
    }

    // Check if we got a session back
    // If email confirmation is OFF → session exists → redirect immediately
    // If email confirmation is ON → no session → show email message
    if (!authData.session) {
      setIsSuccess(true);
      setSuccessMode("confirmation");
      toast.success("Check your email to confirm your account!");
      return;
    }

    setIsSuccess(true);
    setSuccessMode("onboarding");
    toast.success("Account created successfully!");

    setTimeout(() => {
      router.replace("/onboarding");
    }, 1000);
  };

  const resendConfirmation = async () => {
    if (!signupEmail || isResendingConfirmation) return;

    setIsResendingConfirmation(true);
    let error;
    try {
      ({ error } = await supabase.auth.resend({
        type: "signup",
        email: signupEmail,
      }));
    } catch {
      setIsResendingConfirmation(false);
      toast.error("We couldn’t reach the email service. Please try again.");
      return;
    }
    setIsResendingConfirmation(false);

    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success("A new confirmation link is on its way.");
  };

  const [isGoogleLoading, setIsGoogleLoading] = useState(false);

  const handleGoogleSignUp = async () => {
    setIsGoogleLoading(true);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/callback`,
      },
    });

    if (error) {
      setIsGoogleLoading(false);
      toast.error(error.message);
    }
  };

  // ─── Render ─────────────────────────────────────────────────

  return (
    <motion.div variants={pageVariants} initial="hidden" animate="visible">
      {/* Logo + Heading */}
      <div className="text-center mb-8">
        <motion.div
          initial={{ scale: 0, rotate: -10 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{
            type: "spring",
            stiffness: 300,
            damping: 18,
            delay: 0.15,
          }}
          className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center
                     justify-center mx-auto mb-4 shadow-lg shadow-blue-200"
        >
          <MapPin className="w-8 h-8 text-white" />
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25, duration: 0.4 }}
          className="text-2xl font-bold text-gray-900 tracking-tight"
        >
          Create your account
        </motion.h1>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.35, duration: 0.4 }}
          className="text-gray-500 mt-1 text-sm"
        >
          Start optimizing your routes today
        </motion.p>
      </div>

      {/* Card */}
      <motion.div
        animate={shake ? { x: [0, -10, 10, -10, 10, 0] } : {}}
        transition={{ duration: 0.4 }}
      >
        <Card className="border-gray-100 shadow-sm">
          <CardContent className="p-6">
            <AnimatePresence mode="wait">
              {/* Success State */}
              {isSuccess ? (
                <motion.div
                  key="success"
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ type: "spring", stiffness: 300, damping: 20 }}
                  className="flex flex-col items-center py-10"
                >
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{
                      type: "spring",
                      stiffness: 400,
                      damping: 15,
                      delay: 0.1,
                    }}
                    className="w-20 h-20 bg-green-100 rounded-full flex
                               items-center justify-center mb-4"
                  >
                    <CheckCircle2 className="w-10 h-10 text-green-600" />
                  </motion.div>
                  {successMode === "confirmation" ? (
                    <>
                      <p className="text-gray-900 font-semibold text-lg">
                        Confirm your email to continue
                      </p>
                      <p className="text-gray-500 text-sm mt-2 text-center max-w-xs">
                        We sent a confirmation link to <strong>{signupEmail}</strong>. Open that link to verify your account and start setup.
                      </p>
                      <Button
                        type="button"
                        variant="outline"
                        className="mt-5"
                        onClick={resendConfirmation}
                        disabled={isResendingConfirmation}
                      >
                        {isResendingConfirmation ? "Sending..." : "Resend confirmation email"}
                      </Button>
                      <button
                        type="button"
                        onClick={() => setIsSuccess(false)}
                        className="mt-3 text-sm text-blue-600 hover:underline"
                      >
                        Use a different email
                      </button>
                    </>
                  ) : (
                    <>
                      <p className="text-green-700 font-semibold text-lg">
                        Account ready!
                      </p>
                      <p className="text-gray-500 text-sm mt-1">
                        Taking you to setup...
                      </p>
                    </>
                  )}
                </motion.div>
              ) : (
                /* Form */
                <motion.form
                  key="form"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  onSubmit={handleSubmit(onSubmit, triggerShake)}
                  className="space-y-4"
                >
                  {/* Full Name */}
                  <div className="space-y-1.5">
                    <Label htmlFor="fullName">Full Name</Label>
                    <Input
                      id="fullName"
                      placeholder="Jake Morrison"
                      autoComplete="name"
                      {...register("fullName")}
                      className={
                        errors.fullName
                          ? "border-red-400 focus-visible:ring-red-400"
                          : ""
                      }
                    />
                    <AnimatePresence>
                      {errors.fullName && (
                        <motion.p
                          variants={errorVariants}
                          initial="hidden"
                          animate="visible"
                          exit="exit"
                          className="text-red-500 text-xs"
                        >
                          {errors.fullName.message}
                        </motion.p>
                      )}
                    </AnimatePresence>
                  </div>

                  {/* Email */}
                  <div className="space-y-1.5">
                    <Label htmlFor="email">Email Address</Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="jake@grooming.com"
                      autoComplete="email"
                      {...register("email")}
                      className={
                        errors.email
                          ? "border-red-400 focus-visible:ring-red-400"
                          : ""
                      }
                    />
                    <AnimatePresence>
                      {errors.email && (
                        <motion.p
                          variants={errorVariants}
                          initial="hidden"
                          animate="visible"
                          exit="exit"
                          className="text-red-500 text-xs"
                        >
                          {errors.email.message}
                        </motion.p>
                      )}
                    </AnimatePresence>
                  </div>

                  {/* Password */}
                  <div className="space-y-1.5">
                    <Label htmlFor="password">Password</Label>
                    <div className="relative">
                      <Input
                        id="password"
                        type={showPassword ? "text" : "password"}
                        placeholder="Minimum 6 characters"
                        autoComplete="new-password"
                        {...register("password")}
                        className={`pr-10 ${
                          errors.password
                            ? "border-red-400 focus-visible:ring-red-400"
                            : ""
                        }`}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((p) => !p)}
                        className="absolute right-3 top-1/2 -translate-y-1/2
                                   text-gray-400 hover:text-gray-600
                                   transition-colors duration-150"
                      >
                        {showPassword ? (
                          <EyeOff className="w-4 h-4" />
                        ) : (
                          <Eye className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                    <AnimatePresence>
                      {errors.password && (
                        <motion.p
                          variants={errorVariants}
                          initial="hidden"
                          animate="visible"
                          exit="exit"
                          className="text-red-500 text-xs"
                        >
                          {errors.password.message}
                        </motion.p>
                      )}
                    </AnimatePresence>
                  </div>

                  {/* Confirm Password */}
                  <div className="space-y-1.5">
                    <Label htmlFor="confirmPassword">Confirm Password</Label>
                    <div className="relative">
                      <Input
                        id="confirmPassword"
                        type={showConfirmPassword ? "text" : "password"}
                        placeholder="Repeat your password"
                        autoComplete="new-password"
                        {...register("confirmPassword")}
                        className={`pr-10 ${
                          errors.confirmPassword
                            ? "border-red-400 focus-visible:ring-red-400"
                            : ""
                        }`}
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirmPassword((p) => !p)}
                        className="absolute right-3 top-1/2 -translate-y-1/2
                                   text-gray-400 hover:text-gray-600
                                   transition-colors duration-150"
                      >
                        {showConfirmPassword ? (
                          <EyeOff className="w-4 h-4" />
                        ) : (
                          <Eye className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                    <AnimatePresence>
                      {errors.confirmPassword && (
                        <motion.p
                          variants={errorVariants}
                          initial="hidden"
                          animate="visible"
                          exit="exit"
                          className="text-red-500 text-xs"
                        >
                          {errors.confirmPassword.message}
                        </motion.p>
                      )}
                    </AnimatePresence>
                  </div>

                  {/* Submit Button */}
                  <div className="pt-1">
                    <Button
                      type="submit"
                      disabled={isSubmitting}
                      className="w-full"
                    >
                      {isSubmitting ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Creating account...
                        </>
                      ) : (
                        "Create Account →"
                      )}
                    </Button>
                  </div>
                </motion.form>
              )}
            </AnimatePresence>

            {!isSuccess && (
              <>
                <div className="relative my-5">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-gray-100" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-white px-2 text-gray-400">
                      Or sign up with
                    </span>
                  </div>
                </div>

                <Button
                  type="button"
                  variant="outline"
                  onClick={handleGoogleSignUp}
                  disabled={isSubmitting || isGoogleLoading}
                  className="w-full border-gray-200 hover:bg-gray-50 text-gray-700"
                >
                  {isGoogleLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Connecting to Google...
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4 mr-2" viewBox="0 0 24 24">
                        <path
                          fill="#4285F4"
                          d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                        />
                        <path
                          fill="#34A853"
                          d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                        />
                        <path
                          fill="#FBBC05"
                          d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                        />
                        <path
                          fill="#EA4335"
                          d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                        />
                      </svg>
                      Sign up with Google
                    </>
                  )}
                </Button>
              </>
            )}
          </CardContent>
          <p className="text-center text-xs text-gray-400 mt-4">
            By signing up, you agree to our{" "}
            <Link href="/terms" className="underline hover:text-gray-600">
              Terms
            </Link>{" "}
            and{" "}
            <Link href="/privacy" className="underline hover:text-gray-600">
              Privacy Policy
            </Link>
          </p>
        </Card>
      </motion.div>

      {/* Login Link */}
      {!isSuccess && (
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
          className="text-center text-sm text-gray-500 mt-6"
        >
          Already have an account?{" "}
          <Link
            href="/login"
            className="text-blue-600 font-medium hover:underline underline-offset-4"
          >
            Sign in
          </Link>
        </motion.p>
      )}
    </motion.div>
  );
}
