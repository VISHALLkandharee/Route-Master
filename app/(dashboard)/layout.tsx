import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();

  const { data: profile, error } = await supabase
    .from("users")
    .select(
      "full_name, business_name, avatar_url, onboarding_completed, subscription_status",
    )
    .single();

  if (error || !profile) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-50 p-6">
        <section className="max-w-md rounded-xl border bg-white p-6 text-center shadow-sm">
          <h1 className="text-lg font-semibold text-gray-900">
            We couldn’t load your account
          </h1>
          <p className="mt-2 text-sm text-gray-600">
            Your sign-in succeeded, but your profile could not be loaded. Please
            retry in a moment. If this keeps happening, contact support.
          </p>
          <a
            href="/dashboard"
            className="mt-5 inline-flex rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            Retry
          </a>
        </section>
      </main>
    );
  }

  if (!profile.onboarding_completed) {
    redirect("/onboarding");
  }

  const showPastDueBanner = profile.subscription_status === "past_due";

  return (
    <DashboardShell
      profile={{
        full_name: profile.full_name,
        business_name: profile.business_name,
        avatar_url: profile.avatar_url,
      }}
      showPastDueBanner={showPastDueBanner}
    >
      {children}
    </DashboardShell>
  );
}
