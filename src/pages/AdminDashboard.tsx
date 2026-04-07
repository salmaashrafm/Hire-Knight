import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "@/hooks/use-toast";
import { Loader2, Users, FileText, Mail, BarChart3, CheckCircle, XCircle, Clock } from "lucide-react";
import { Navigate } from "react-router-dom";

interface Stats {
  totalUsers: number;
  totalApplications: number;
  totalEmails: number;
  appsByStatus: { draft: number; sent: number; replied: number };
  emailsByStatus: { sent: number; failed: number };
  avgMatchScore: number;
}

interface AdminUser {
  id: string;
  email: string;
  fullName: string;
  createdAt: string;
  lastSignIn: string | null;
  applicationCount: number;
  hasCV: boolean;
  hasSMTP: boolean;
}

interface AdminApp {
  id: string;
  company_name: string;
  job_title: string;
  status: string;
  match_score: number | null;
  created_at: string;
  user_id: string;
  recipient_email: string | null;
  userName: string;
  userEmail: string;
}

interface AdminEmail {
  id: string;
  recipient_email: string;
  subject: string;
  status: string;
  error_message: string | null;
  sent_at: string;
  userName: string;
  userEmail: string;
}

export default function AdminDashboard() {
  const { user } = useAuth();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("overview");

  const [stats, setStats] = useState<Stats | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [apps, setApps] = useState<AdminApp[]>([]);
  const [emails, setEmails] = useState<AdminEmail[]>([]);
  const [sectionLoading, setSectionLoading] = useState(false);

  // Check admin role
  useEffect(() => {
    if (!user) return;
    supabase.from("user_roles").select("role").eq("user_id", user.id).eq("role", "admin").single()
      .then(({ data }) => {
        setIsAdmin(!!data);
        setLoading(false);
      });
  }, [user]);

  const fetchSection = async (section: string) => {
    setSectionLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("admin-data", {
        body: null,
        headers: { "Content-Type": "application/json" },
      });
      // Use query params approach via direct fetch
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-data?section=${section}`,
        {
          headers: {
            Authorization: `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
        }
      );
      if (!response.ok) throw new Error("Failed to fetch admin data");
      const result = await response.json();

      if (section === "overview") setStats(result.stats);
      if (section === "users") setUsers(result.users);
      if (section === "applications") setApps(result.applications);
      if (section === "emails") setEmails(result.emails);
    } catch (err: any) {
      toast({ title: "خطأ", description: err.message, variant: "destructive" });
    }
    setSectionLoading(false);
  };

  useEffect(() => {
    if (isAdmin) fetchSection(activeTab);
  }, [isAdmin, activeTab]);

  if (loading) return <div className="flex items-center justify-center min-h-[400px]"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;
  if (!isAdmin) return <Navigate to="/" replace />;

  const formatDate = (d: string) => new Date(d).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Admin Dashboard</h1>
        <p className="text-muted-foreground mt-1">Monitor all users, applications, and emails</p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="overview" className="flex items-center gap-2"><BarChart3 className="h-4 w-4" />Overview</TabsTrigger>
          <TabsTrigger value="users" className="flex items-center gap-2"><Users className="h-4 w-4" />Users</TabsTrigger>
          <TabsTrigger value="applications" className="flex items-center gap-2"><FileText className="h-4 w-4" />Applications</TabsTrigger>
          <TabsTrigger value="emails" className="flex items-center gap-2"><Mail className="h-4 w-4" />Emails</TabsTrigger>
        </TabsList>

        {sectionLoading && (
          <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        )}

        {/* Overview */}
        <TabsContent value="overview">
          {stats && !sectionLoading && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Total Users</CardTitle></CardHeader>
                  <CardContent><div className="text-3xl font-bold">{stats.totalUsers}</div></CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Total Applications</CardTitle></CardHeader>
                  <CardContent><div className="text-3xl font-bold">{stats.totalApplications}</div></CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Emails Sent</CardTitle></CardHeader>
                  <CardContent><div className="text-3xl font-bold">{stats.totalEmails}</div></CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Avg Match Score</CardTitle></CardHeader>
                  <CardContent><div className="text-3xl font-bold">{stats.avgMatchScore}%</div></CardContent>
                </Card>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Card>
                  <CardHeader><CardTitle className="text-base">Applications by Status</CardTitle></CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="flex items-center gap-2 text-sm"><Clock className="h-4 w-4 text-muted-foreground" />Draft</span>
                      <Badge variant="secondary">{stats.appsByStatus.draft}</Badge>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="flex items-center gap-2 text-sm"><CheckCircle className="h-4 w-4 text-green-600" />Sent</span>
                      <Badge variant="secondary">{stats.appsByStatus.sent}</Badge>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="flex items-center gap-2 text-sm"><Mail className="h-4 w-4 text-blue-600" />Replied</span>
                      <Badge variant="secondary">{stats.appsByStatus.replied}</Badge>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader><CardTitle className="text-base">Email Delivery</CardTitle></CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="flex items-center gap-2 text-sm"><CheckCircle className="h-4 w-4 text-green-600" />Sent Successfully</span>
                      <Badge variant="secondary">{stats.emailsByStatus.sent}</Badge>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="flex items-center gap-2 text-sm"><XCircle className="h-4 w-4 text-red-600" />Failed</span>
                      <Badge variant="secondary">{stats.emailsByStatus.failed}</Badge>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          )}
        </TabsContent>

        {/* Users */}
        <TabsContent value="users">
          {!sectionLoading && (
            <Card>
              <CardContent className="pt-6">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Applications</TableHead>
                      <TableHead>CV</TableHead>
                      <TableHead>SMTP</TableHead>
                      <TableHead>Joined</TableHead>
                      <TableHead>Last Login</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {users.map(u => (
                      <TableRow key={u.id}>
                        <TableCell className="font-medium">{u.fullName || "—"}</TableCell>
                        <TableCell>{u.email}</TableCell>
                        <TableCell><Badge variant="secondary">{u.applicationCount}</Badge></TableCell>
                        <TableCell>{u.hasCV ? <CheckCircle className="h-4 w-4 text-green-600" /> : <XCircle className="h-4 w-4 text-muted-foreground" />}</TableCell>
                        <TableCell>{u.hasSMTP ? <CheckCircle className="h-4 w-4 text-green-600" /> : <XCircle className="h-4 w-4 text-muted-foreground" />}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{formatDate(u.createdAt)}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{u.lastSignIn ? formatDate(u.lastSignIn) : "Never"}</TableCell>
                      </TableRow>
                    ))}
                    {users.length === 0 && (
                      <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">No users found</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Applications */}
        <TabsContent value="applications">
          {!sectionLoading && (
            <Card>
              <CardContent className="pt-6">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>User</TableHead>
                      <TableHead>Company</TableHead>
                      <TableHead>Job Title</TableHead>
                      <TableHead>Score</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Date</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {apps.map(a => (
                      <TableRow key={a.id}>
                        <TableCell>
                          <div className="text-sm font-medium">{a.userName || "—"}</div>
                          <div className="text-xs text-muted-foreground">{a.userEmail}</div>
                        </TableCell>
                        <TableCell className="font-medium">{a.company_name}</TableCell>
                        <TableCell>{a.job_title}</TableCell>
                        <TableCell>{a.match_score ? `${a.match_score}%` : "—"}</TableCell>
                        <TableCell>
                          <Badge variant={a.status === "sent" ? "default" : a.status === "replied" ? "secondary" : "outline"}>
                            {a.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">{formatDate(a.created_at)}</TableCell>
                      </TableRow>
                    ))}
                    {apps.length === 0 && (
                      <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">No applications found</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Emails */}
        <TabsContent value="emails">
          {!sectionLoading && (
            <Card>
              <CardContent className="pt-6">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>User</TableHead>
                      <TableHead>Recipient</TableHead>
                      <TableHead>Subject</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Error</TableHead>
                      <TableHead>Date</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {emails.map(e => (
                      <TableRow key={e.id}>
                        <TableCell>
                          <div className="text-sm font-medium">{e.userName || "—"}</div>
                          <div className="text-xs text-muted-foreground">{e.userEmail}</div>
                        </TableCell>
                        <TableCell>{e.recipient_email}</TableCell>
                        <TableCell className="max-w-[200px] truncate">{e.subject}</TableCell>
                        <TableCell>
                          <Badge variant={e.status === "sent" ? "default" : "destructive"}>
                            {e.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="max-w-[150px] truncate text-sm text-muted-foreground">{e.error_message || "—"}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{formatDate(e.sent_at)}</TableCell>
                      </TableRow>
                    ))}
                    {emails.length === 0 && (
                      <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">No emails found</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
