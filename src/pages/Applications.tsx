import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PlusCircle, Search } from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";

type Application = Tables<"applications">;

const statusColors: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  sent: "bg-primary/10 text-primary",
  replied: "bg-green-100 text-green-700",
};

export default function Applications() {
  const { user } = useAuth();
  const [apps, setApps] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  useEffect(() => {
    if (!user) return;
    supabase
      .from("applications")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        setApps(data || []);
        setLoading(false);
      });
  }, [user]);

  const filtered = apps.filter((a) => {
    const matchSearch = a.company_name.toLowerCase().includes(search.toLowerCase()) || a.job_title.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === "all" || a.status === statusFilter;
    return matchSearch && matchStatus;
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Applications</h1>
          <p className="text-muted-foreground mt-1">{apps.length} total applications</p>
        </div>
        <Button asChild>
          <Link to="/new-application"><PlusCircle className="mr-2 h-4 w-4" /> New</Link>
        </Button>
      </div>

      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search by company or title..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="sent">Sent</SelectItem>
            <SelectItem value="replied">Replied</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <p className="text-muted-foreground">Loading...</p>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">No applications found.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((app) => (
            <Link key={app.id} to={`/applications/${app.id}`}>
              <Card className="hover:shadow-md transition-shadow cursor-pointer">
                <CardContent className="flex items-center justify-between py-4">
                  <div>
                    <p className="font-medium">{app.job_title}</p>
                    <p className="text-sm text-muted-foreground">{app.company_name} · {new Date(app.created_at).toLocaleDateString()}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    {app.match_score && <span className="text-sm font-medium text-primary">{app.match_score}%</span>}
                    <Badge className={statusColors[app.status]}>{app.status}</Badge>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
