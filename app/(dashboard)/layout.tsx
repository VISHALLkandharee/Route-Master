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
    redirect("/login");
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
