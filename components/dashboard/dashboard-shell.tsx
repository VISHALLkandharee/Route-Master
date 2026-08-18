"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Menu, MapPin, LogOut, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { SidebarNav } from "./sidebar-nav";
import { createClient } from "@/lib/supabase/client";
import { useUIStore } from "@/lib/store/ui-store";
import { toast } from "sonner";

interface DashboardShellProps {
  profile: {
    full_name: string;
    business_name: string | null;
    avatar_url: string | null;
  };
  children: React.ReactNode;
  showPastDueBanner?: boolean;
}

export function DashboardShell({
  profile,
  children,
  showPastDueBanner,
}: DashboardShellProps) {
  const router = useRouter();
  const supabase = createClient();
  const { isSidebarOpen, toggleSidebar } = useUIStore();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const initials = profile.full_name
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    document.cookie =
      "rm_sub_status=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
    toast.success("Signed out");
    router.push("/login");
  };

  return (
    <div className="min-h-screen flex">
      {/* Desktop Sidebar */}
      <aside
        className={`hidden md:flex flex-col border-r border-gray-200 bg-white
                    transition-all duration-200 ${
                      isSidebarOpen ? "w-64" : "w-20"
                    }`}
      >
        <div className="flex items-center gap-2 px-4 h-16 border-b border-gray-100">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center flex-shrink-0">
            <MapPin className="w-4 h-4 text-white" />
          </div>
          {isSidebarOpen && (
            <span className="font-bold text-gray-900">Routemaster</span>
          )}
        </div>

        <div className="flex-1 py-4 overflow-y-auto">
          <SidebarNav collapsed={!isSidebarOpen} />
        </div>

        <div className="p-3 border-t border-gray-100">
          <Button
            variant="ghost"
            size="sm"
            onClick={toggleSidebar}
            className="w-full justify-center"
          >
            {isSidebarOpen ? (
              <ChevronLeft className="w-4 h-4" />
            ) : (
              <ChevronRight className="w-4 h-4" />
            )}
          </Button>
        </div>
      </aside>

      {/* Main Column */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Bar */}
        <header className="h-16 border-b border-gray-200 bg-white flex items-center justify-between px-4 md:px-6">
          {/* Mobile menu trigger */}
          <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
            <SheetTrigger asChild className="md:hidden">
              <Button variant="ghost" size="icon">
                <Menu className="w-5 h-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-64 p-0">
              <div className="flex items-center gap-2 px-4 h-16 border-b border-gray-100">
                <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
                  <MapPin className="w-4 h-4 text-white" />
                </div>
                <span className="font-bold text-gray-900">Routemaster</span>
              </div>
              <div className="py-4">
                <SidebarNav onNavigate={() => setMobileNavOpen(false)} />
              </div>
            </SheetContent>
          </Sheet>

          <div className="hidden md:block">
            <p className="text-sm font-medium text-gray-900">
              {profile.business_name}
            </p>
          </div>

          {/* User menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center gap-2 outline-none">
                <Avatar className="w-8 h-8">
                  {profile.avatar_url && (
                    <AvatarImage
                      src={profile.avatar_url}
                      alt={profile.full_name}
                    />
                  )}
                  <AvatarFallback className="bg-blue-100 text-blue-700 text-xs font-semibold">
                    {initials}
                  </AvatarFallback>
                </Avatar>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>
                <p className="font-medium">{profile.full_name}</p>
                <p className="text-xs text-gray-500 font-normal">
                  {profile.business_name}
                </p>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link href="/dashboard/settings">Settings</Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={handleLogout}
                className="text-red-600 focus:text-red-600"
              >
                <LogOut className="w-4 h-4 mr-2" />
                Log out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-y-auto bg-gray-50">
          {showPastDueBanner && (
            <div className="bg-red-600 text-white text-sm text-center py-2.5 px-4 flex items-center justify-center gap-3">
              <span>
                Your payment failed. Please update your payment method to keep
                access.
              </span>
              <a
                href="/dashboard/settings"
                className="underline font-semibold hover:no-underline"
              >
                Update billing
              </a>
            </div>
          )}
          {children}
        </main>
      </div>
    </div>
  );
}
