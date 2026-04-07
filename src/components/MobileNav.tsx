import { Link, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { LayoutDashboard, PlusCircle, List, Settings, LogOut, Menu, Briefcase, FileText, Search, ScanSearch, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

const navItems = [
  { label: "Dashboard", icon: LayoutDashboard, path: "/" },
  { label: "New Application", icon: PlusCircle, path: "/new-application" },
  { label: "Applications", icon: List, path: "/applications" },
  { label: "Templates", icon: FileText, path: "/templates" },
  { label: "Job Search", icon: Search, path: "/job-search" },
  { label: "ATS Analysis", icon: ScanSearch, path: "/ats-analysis" },
  { label: "Settings", icon: Settings, path: "/settings" },
];

export default function MobileNav() {
  const { pathname } = useLocation();
  const { signOut, user } = useAuth();
  const [open, setOpen] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    if (!user) return;
    supabase.from("user_roles").select("role").eq("user_id", user.id).eq("role", "admin").single()
      .then(({ data }) => setIsAdmin(!!data));
  }, [user]);

  const allItems = isAdmin
    ? [...navItems, { label: "Admin", icon: ShieldCheck, path: "/admin" }]
    : navItems;

  return (
    <header className="md:hidden flex items-center justify-between p-4 border-b bg-card">
      <Link to="/" className="flex items-center gap-2">
        <Briefcase className="h-5 w-5 text-primary" />
         <span className="font-bold">Hire Knight</span>
      </Link>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <Button variant="ghost" size="icon"><Menu className="h-5 w-5" /></Button>
        </SheetTrigger>
        <SheetContent side="left" className="w-64 p-0">
          <div className="p-6 border-b">
            <div className="flex items-center gap-2">
              <Briefcase className="h-5 w-5 text-primary" />
              <span className="font-bold">Hire Knight</span>
            </div>
          </div>
          <nav className="p-3 space-y-1">
            {allItems.map((item) => (
              <Link
                key={item.path}
                to={item.path}
                onClick={() => setOpen(false)}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                  pathname === item.path ? "bg-accent text-primary" : "text-muted-foreground hover:bg-accent"
                )}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="p-3 border-t mt-auto">
            <Button variant="ghost" onClick={() => { signOut(); setOpen(false); }} className="w-full justify-start gap-3">
              <LogOut className="h-4 w-4" /> Sign Out
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </header>
  );
}
