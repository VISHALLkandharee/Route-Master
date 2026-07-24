"use client";

import { useState, useRef } from "react";
import Link from "next/link";
import { motion, useInView } from "framer-motion";
import {
  MapPin,
  MessageSquare,
  Package,
  Clock,
  CheckCircle2,
  ArrowRight,
  Menu,
  X,
  Navigation,
  Zap,
  Shield,
  Star,
} from "lucide-react";
import { Button } from "@/components/ui/button";

// ─── Animation helpers ────────────────────────────────────────

function FadeUp({
  children,
  delay = 0,
  className = "",
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
}) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 32 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{
        duration: 0.6,
        delay,
        ease: [0.22, 1, 0.36, 1] as [number, number, number, number],
      }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

// ─── Data ─────────────────────────────────────────────────────

const FEATURES = [
  {
    icon: Navigation,
    color: "bg-blue-100 text-blue-700",
    title: "Smart Route Optimization",
    description:
      "Add all your jobs for the day and let Routemaster calculate the most fuel-efficient driving order automatically. No more spending hours mapping routes on Google Maps.",
  },
  {
    icon: MessageSquare,
    color: "bg-green-100 text-green-700",
    title: "Automated Client SMS",
    description:
      "The moment your route is set, Routemaster texts each client their personalized arrival window automatically. Clients love the professionalism. You love not sending 8 manual texts.",
  },
  {
    icon: Package,
    color: "bg-amber-100 text-amber-700",
    title: "Supply Tracking",
    description:
      "Log what you use after each job. Routemaster tracks your inventory in real-time and alerts you when you're running low — before you show up to a job without what you need.",
  },
];

const STEPS = [
  {
    number: "01",
    title: "Add your jobs",
    description:
      "Enter your clients and what you're doing for each one. Takes 2 minutes.",
  },
  {
    number: "02",
    title: "Optimize your route",
    description:
      "One click. Routemaster calculates the best driving order and texts all your clients.",
  },
  {
    number: "03",
    title: "Drive and track",
    description:
      "Follow your optimized route, mark jobs complete, and log supplies used as you go.",
  },
];

const PROBLEMS = [
  "45 minutes mapping tomorrow's route on Google Maps every night",
  "Texting 8 clients one by one to confirm arrival times",
  "Running out of supplies mid-job because you lost track of inventory",
  "Looking unprofessional when clients have no idea when you're arriving",
];

// ─── Component ────────────────────────────────────────────────

export default function LandingPage() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [billingCycle, setBillingCycle] = useState<"monthly" | "yearly">(
    "monthly",
  );

  return (
    <div className="min-h-screen bg-white font-sans">
      {/* ── Nav ── */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-white/80 backdrop-blur-md border-b border-gray-100">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
              <MapPin className="w-4 h-4 text-white" />
            </div>
            <span className="font-bold text-gray-900">Routemaster</span>
          </Link>

          {/* Desktop nav */}
          <div className="hidden md:flex items-center gap-6">
            <a
              href="#features"
              className="text-sm text-gray-600 hover:text-gray-900 transition-colors"
            >
              Features
            </a>
            <a
              href="#how-it-works"
              className="text-sm text-gray-600 hover:text-gray-900 transition-colors"
            >
              How it works
            </a>
            <a
              href="#pricing"
              className="text-sm text-gray-600 hover:text-gray-900 transition-colors"
            >
              Pricing
            </a>
            <Link href="/login">
              <Button variant="ghost" size="sm">
                Sign In
              </Button>
            </Link>
            <Link href="/signup">
              <Button size="sm">Get Started Free</Button>
            </Link>
          </div>

          {/* Mobile menu button */}
          <button
            className="md:hidden p-2"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            {mobileMenuOpen ? (
              <X className="w-5 h-5" />
            ) : (
              <Menu className="w-5 h-5" />
            )}
          </button>
        </div>

        {/* Mobile menu */}
        {mobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            className="md:hidden bg-white border-t border-gray-100 px-4 py-4 space-y-3"
          >
            <a
              href="#features"
              className="block text-sm text-gray-600 py-2"
              onClick={() => setMobileMenuOpen(false)}
            >
              Features
            </a>
            <a
              href="#how-it-works"
              className="block text-sm text-gray-600 py-2"
              onClick={() => setMobileMenuOpen(false)}
            >
              How it works
            </a>
            <a
              href="#pricing"
              className="block text-sm text-gray-600 py-2"
              onClick={() => setMobileMenuOpen(false)}
            >
              Pricing
            </a>
            <Link href="/login" className="block">
              <Button variant="outline" size="sm" className="w-full">
                Sign In
              </Button>
            </Link>
            <Link href="/signup" className="block">
              <Button size="sm" className="w-full">
                Get Started Free
              </Button>
            </Link>
          </motion.div>
        )}
      </nav>

      {/* ── Hero ── */}
      <section className="pt-32 pb-20 px-4 max-w-6xl mx-auto">
        <div className="text-center max-w-3xl mx-auto">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5 }}
            className="inline-flex items-center gap-2 bg-blue-50 text-blue-700 text-sm font-medium px-4 py-1.5 rounded-full mb-6 border border-blue-100"
          >
            <Zap className="w-3.5 h-3.5" />
            Built for mobile service professionals
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              duration: 0.6,
              delay: 0.1,
              ease: [0.22, 1, 0.36, 1] as [number, number, number, number],
            }}
            className="text-4xl sm:text-5xl md:text-6xl font-bold text-gray-900 tracking-tight leading-tight"
          >
            Stop planning routes.{" "}
            <span className="text-blue-600">Start earning more.</span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="mt-6 text-lg text-gray-600 leading-relaxed"
          >
            Routemaster automatically optimizes your daily driving route, texts
            your clients arrival times, and tracks your supplies — so you spend
            less time planning and more time working.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}
            className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3"
          >
            <Link href="/signup">
              <Button
                size="lg"
                className="w-full sm:w-auto shadow-lg shadow-blue-200"
              >
                Start your free trial
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </Link>
            <a href="#how-it-works">
              <Button size="lg" variant="outline" className="w-full sm:w-auto">
                See how it works
              </Button>
            </a>
          </motion.div>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
            className="mt-4 text-sm text-gray-400"
          >
            14-day free trial · No credit card required
          </motion.p>
        </div>

        {/* Hero stat cards */}
        <div className="mt-16 grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-3xl mx-auto">
          {[
            {
              label: "Time saved per day",
              value: "45 min",
              icon: Clock,
              color: "text-blue-600 bg-blue-50",
            },
            {
              label: "Fuel saved monthly",
              value: "~20%",
              icon: Navigation,
              color: "text-green-600 bg-green-50",
            },
            {
              label: "Client satisfaction",
              value: "5 stars",
              icon: Star,
              color: "text-amber-600 bg-amber-50",
            },
          ].map((stat, i) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 + i * 0.1, duration: 0.5 }}
              className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm flex items-center gap-4"
            >
              <div
                className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 ${stat.color}`}
              >
                <stat.icon className="w-5 h-5" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">{stat.value}</p>
                <p className="text-xs text-gray-500">{stat.label}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ── Problem ── */}
      <section className="py-20 bg-gray-50">
        <div className="max-w-6xl mx-auto px-4">
          <FadeUp className="text-center max-w-2xl mx-auto mb-12">
            <h2 className="text-3xl font-bold text-gray-900 mb-4">
              Sound familiar?
            </h2>
            <p className="text-gray-600">
              Every night, thousands of mobile service workers waste hours on
              work that should take minutes.
            </p>
          </FadeUp>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-3xl mx-auto">
            {PROBLEMS.map((problem, i) => (
              <FadeUp key={i} delay={i * 0.08}>
                <div className="bg-white border border-gray-100 rounded-xl p-4 flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <X className="w-3 h-3 text-red-500" />
                  </div>
                  <p className="text-sm text-gray-700">{problem}</p>
                </div>
              </FadeUp>
            ))}
          </div>

          <FadeUp delay={0.4} className="text-center mt-10">
            <p className="text-lg font-semibold text-gray-900">
              Routemaster eliminates all of this.{" "}
              <span className="text-blue-600">Automatically.</span>
            </p>
          </FadeUp>
        </div>
      </section>

      {/* ── Features ── */}
      <section id="features" className="py-20 px-4 max-w-6xl mx-auto">
        <FadeUp className="text-center max-w-2xl mx-auto mb-16">
          <h2 className="text-3xl font-bold text-gray-900 mb-4">
            Everything you need. Nothing you don&apos;t.
          </h2>
          <p className="text-gray-600">
            Three powerful features designed specifically for mobile service
            professionals. Simple enough to use at 6am.
          </p>
        </FadeUp>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {FEATURES.map((feature, i) => (
            <FadeUp key={feature.title} delay={i * 0.1}>
              <div className="bg-white border border-gray-100 rounded-2xl p-6 h-full hover:shadow-md transition-shadow">
                <div
                  className={`w-12 h-12 rounded-xl flex items-center justify-center mb-4 ${feature.color}`}
                >
                  <feature.icon className="w-6 h-6" />
                </div>
                <h3 className="font-semibold text-gray-900 text-lg mb-2">
                  {feature.title}
                </h3>
                <p className="text-gray-600 text-sm leading-relaxed">
                  {feature.description}
                </p>
              </div>
            </FadeUp>
          ))}
        </div>
      </section>

      {/* ── How it works ── */}
      <section id="how-it-works" className="py-20 bg-gray-50">
        <div className="max-w-6xl mx-auto px-4">
          <FadeUp className="text-center max-w-2xl mx-auto mb-16">
            <h2 className="text-3xl font-bold text-gray-900 mb-4">
              Up and running in minutes
            </h2>
            <p className="text-gray-600">
              No complicated setup. No learning curve. Just a better workday.
            </p>
          </FadeUp>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-4xl mx-auto">
            {STEPS.map((step, i) => (
              <FadeUp key={step.number} delay={i * 0.12}>
                <div className="text-center relative">
                  <div className="w-14 h-14 bg-blue-600 text-white rounded-2xl flex items-center justify-center font-bold text-lg mx-auto mb-4">
                    {step.number}
                  </div>
                  {i < STEPS.length - 1 && (
                    <div className="hidden md:block absolute top-7 left-full w-full h-0.5 bg-blue-100 -translate-x-1/2" />
                  )}
                  <h3 className="font-semibold text-gray-900 mb-2">
                    {step.title}
                  </h3>
                  <p className="text-sm text-gray-600 leading-relaxed">
                    {step.description}
                  </p>
                </div>
              </FadeUp>
            ))}
          </div>
        </div>
      </section>

      {/* ── Pricing ── */}
      <section id="pricing" className="py-20 px-4 max-w-6xl mx-auto">
        <FadeUp className="text-center max-w-2xl mx-auto mb-10">
          <h2 className="text-3xl font-bold text-gray-900 mb-4">
            Simple, honest pricing
          </h2>
          <p className="text-gray-600">
            One plan. Everything included. Cancel any time.
          </p>
        </FadeUp>

        {/* Billing toggle */}
        <FadeUp
          delay={0.1}
          className="flex items-center justify-center gap-3 mb-10"
        >
          <span
            className={`text-sm font-medium ${billingCycle === "monthly" ? "text-gray-900" : "text-gray-400"}`}
          >
            Monthly
          </span>
          <button
            onClick={() =>
              setBillingCycle(billingCycle === "monthly" ? "yearly" : "monthly")
            }
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              billingCycle === "yearly" ? "bg-blue-600" : "bg-gray-200"
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform ${
                billingCycle === "yearly" ? "translate-x-6" : "translate-x-1"
              }`}
            />
          </button>
          <span
            className={`text-sm font-medium ${billingCycle === "yearly" ? "text-gray-900" : "text-gray-400"}`}
          >
            Yearly
            <span className="ml-1.5 bg-green-100 text-green-700 text-xs font-semibold px-2 py-0.5 rounded-full">
              Save 17%
            </span>
          </span>
        </FadeUp>

        <FadeUp delay={0.15} className="max-w-sm mx-auto">
          <div className="bg-white border-2 border-blue-600 rounded-2xl p-8 shadow-xl shadow-blue-100 text-center relative">
            <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
              <span className="bg-blue-600 text-white text-xs font-semibold px-4 py-1 rounded-full">
                14-day free trial
              </span>
            </div>

            <h3 className="font-bold text-gray-900 text-xl mb-1">
              Routemaster Pro
            </h3>
            <p className="text-gray-500 text-sm mb-6">Everything you need</p>

            <div className="mb-6">
              <span className="text-5xl font-bold text-gray-900">
                ${billingCycle === "monthly" ? "19" : "190"}
              </span>
              <span className="text-gray-500 text-sm ml-1">
                / {billingCycle === "monthly" ? "month" : "year"}
              </span>
              {billingCycle === "yearly" && (
                <p className="text-xs text-green-600 mt-1">
                  That&apos;s just $15.83/month
                </p>
              )}
            </div>

            <div className="space-y-3 mb-8 text-left">
              {[
                "Unlimited route optimization",
                "Automated client SMS notifications",
                "Supply inventory tracking",
                "AI-powered personalized messages",
                "Dashboard analytics",
                "Priority support",
              ].map((item) => (
                <div key={item} className="flex items-center gap-2.5">
                  <CheckCircle2 className="w-4 h-4 text-blue-600 flex-shrink-0" />
                  <span className="text-sm text-gray-700">{item}</span>
                </div>
              ))}
            </div>

            <Link href="/signup">
              <Button className="w-full" size="lg">
                Start free trial
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </Link>
            <p className="text-xs text-gray-400 mt-3">
              No credit card required for trial
            </p>
          </div>
        </FadeUp>
      </section>

      {/* ── CTA ── */}
      <section className="py-20 bg-blue-600">
        <div className="max-w-3xl mx-auto px-4 text-center">
          <FadeUp>
            <h2 className="text-3xl font-bold text-white mb-4">
              Ready to get your evenings back?
            </h2>
            <p className="text-blue-100 mb-8">
              Join mobile service professionals who&apos;ve stopped wasting time
              on planning and started focusing on their work.
            </p>
            <Link href="/signup">
              <Button
                size="lg"
                className="bg-white text-blue-600 hover:bg-blue-50 shadow-lg"
              >
                Start your free trial today
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </Link>
            <p className="text-blue-200 text-sm mt-4">
              14 days free · No credit card · Cancel anytime
            </p>
          </FadeUp>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="bg-gray-900 text-gray-400 py-12 px-4">
        <div className="max-w-6xl mx-auto">
          <div className="flex flex-col md:flex-row items-start justify-between gap-8 mb-8">
            <div>
              <div className="flex items-center gap-2 mb-3">
                <div className="w-7 h-7 bg-blue-600 rounded-lg flex items-center justify-center">
                  <MapPin className="w-3.5 h-3.5 text-white" />
                </div>
                <span className="font-bold text-white">Routemaster</span>
              </div>
              <p className="text-sm max-w-xs leading-relaxed">
                Route optimization, automated client notifications, and supply
                tracking for mobile service professionals.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-8 text-sm">
              <div>
                <p className="font-semibold text-white mb-3">Product</p>
                <div className="space-y-2">
                  <a
                    href="#features"
                    className="block hover:text-white transition-colors"
                  >
                    Features
                  </a>
                  <a
                    href="#pricing"
                    className="block hover:text-white transition-colors"
                  >
                    Pricing
                  </a>
                  <a
                    href="#how-it-works"
                    className="block hover:text-white transition-colors"
                  >
                    How it works
                  </a>
                </div>
              </div>
              <div>
                <p className="font-semibold text-white mb-3">Account</p>
                <div className="space-y-2">
                  <Link
                    href="/signup"
                    className="block hover:text-white transition-colors"
                  >
                    Sign up
                  </Link>
                  <Link
                    href="/login"
                    className="block hover:text-white transition-colors"
                  >
                    Sign in
                  </Link>
                </div>
              </div>
            </div>
          </div>

          <div className="border-t border-gray-800 pt-8 flex flex-col md:flex-row items-center justify-between gap-4 text-xs">
            <p>
              © {new Date().getFullYear()} Routemaster. All rights reserved.
            </p>
            <div className="flex items-center gap-1 text-gray-500">
              <Shield className="w-3 h-3" />
              <span>Secured with Stripe</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
