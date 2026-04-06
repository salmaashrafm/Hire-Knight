import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PlusCircle, FileText, Send, MessageSquare, TrendingUp } from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";

type Application = Tables<"applications">;

const statusColors: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  sent: "bg-primary/10 text-primary",
  replied: "bg-green-100 text-green-700",
};

export default function Dashboard() {
  const { user } = useAuth();
  const [apps, setApps] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);

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

  const total = apps.length;
  const drafts = apps.filter((a) => a.status === "draft").length;
  const sent = apps.filter((a) => a.status === "sent").length;
  const replied = apps.filter((a) => a.status === "replied").length;
  const avgScore = total > 0 ? Math.round(apps.reduce((s, a) => s + (a.match_score || 0), 0) / total) : 0;

  const stats = [
    { label: "Total Applications", value: total, icon: FileText, color: "text-primary" },
    { label: "Drafts", value: drafts, icon: FileText, color: "text-muted-foreground" },
    { label: "Sent", value: sent, icon: Send, color: "text-primary" },
    { label: "Replied", value: replied, icon: MessageSquare, color: "text-green-600" },
  ];

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground mt-1">Track your job applications at a glance</p>
        </div>
        <Button asChild>
          <Link to="/new-application"><PlusCircle className="mr-2 h-4 w-4" /> New Application</Link>
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => (
          <Card key={s.label}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{s.label}</CardTitle>
              <s.icon className={`h-4 w-4 ${s.color}`} />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{s.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {avgScore > 0 && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Average Match Score</CardTitle>
            <TrendingUp className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{avgScore}%</div>
            <div className="mt-2 h-2 w-full rounded-full bg-secondary">
              <div className="h-2 rounded-full bg-primary transition-all" style={{ width: `${avgScore}%` }} />
            </div>
          </CardContent>
        </Card>
      )}

      <div>
        <h2 className="text-xl font-semibold mb-4">Recent Applications</h2>
        {loading ? (
          <p className="text-muted-foreground">Loading...</p>
        ) : apps.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <p className="text-muted-foreground mb-4">No applications yet. Start by creating your first one!</p>
              <Button asChild><Link to="/new-application"><PlusCircle className="mr-2 h-4 w-4" /> Create Application</Link></Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {apps.slice(0, 5).map((app) => (
              <Link key={app.id} to={`/applications/${app.id}`}>
                <Card className="hover:shadow-md transition-shadow cursor-pointer">
                  <CardContent className="flex items-center justify-between py-4">
                    <div>
                      <p className="font-medium">{app.job_title}</p>
                      <p className="text-sm text-muted-foreground">{app.company_name}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      {app.match_score && (
                        <span className="text-sm font-medium text-primary">{app.match_score}%</span>
                      )}
                      <Badge className={statusColors[app.status]}>{app.status}</Badge>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
