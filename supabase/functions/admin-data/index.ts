import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify user is admin
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Not authenticated");

    const { data: roleData } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .single();

    if (!roleData) {
      return new Response(JSON.stringify({ error: "Forbidden: Admin access required" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Use service role to access all data
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const url = new URL(req.url);
    const section = url.searchParams.get("section") || "overview";

    if (section === "overview") {
      const [usersRes, appsRes, emailsRes, profilesRes] = await Promise.all([
        supabaseAdmin.auth.admin.listUsers({ perPage: 1000 }),
        supabaseAdmin.from("applications").select("id, status, created_at, match_score"),
        supabaseAdmin.from("email_logs").select("id, status, sent_at"),
        supabaseAdmin.from("profiles").select("id, full_name, email, created_at"),
      ]);

      const users = usersRes.data?.users || [];
      const apps = appsRes.data || [];
      const emails = emailsRes.data || [];

      const stats = {
        totalUsers: users.length,
        totalApplications: apps.length,
        totalEmails: emails.length,
        appsByStatus: {
          draft: apps.filter(a => a.status === "draft").length,
          sent: apps.filter(a => a.status === "sent").length,
          replied: apps.filter(a => a.status === "replied").length,
        },
        emailsByStatus: {
          sent: emails.filter(e => e.status === "sent").length,
          failed: emails.filter(e => e.status === "failed").length,
        },
        avgMatchScore: apps.filter(a => a.match_score).length > 0
          ? Math.round(apps.filter(a => a.match_score).reduce((sum, a) => sum + (a.match_score || 0), 0) / apps.filter(a => a.match_score).length)
          : 0,
      };

      return new Response(JSON.stringify({ stats }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (section === "users") {
      const { data: users } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 });
      const { data: profiles } = await supabaseAdmin.from("profiles").select("*");
      const { data: apps } = await supabaseAdmin.from("applications").select("user_id, id");
      
      const userList = (users?.users || []).map(u => {
        const profile = profiles?.find(p => p.user_id === u.id);
        const appCount = apps?.filter(a => a.user_id === u.id).length || 0;
        return {
          id: u.id,
          email: u.email,
          fullName: profile?.full_name || "",
          createdAt: u.created_at,
          lastSignIn: u.last_sign_in_at,
          applicationCount: appCount,
          hasCV: !!profile?.cv_text,
          hasSMTP: !!profile?.smtp_host,
        };
      });

      return new Response(JSON.stringify({ users: userList }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (section === "applications") {
      const { data: apps } = await supabaseAdmin
        .from("applications")
        .select("id, company_name, job_title, status, match_score, created_at, user_id, recipient_email")
        .order("created_at", { ascending: false });

      const { data: profiles } = await supabaseAdmin.from("profiles").select("user_id, full_name, email");

      const appList = (apps || []).map(a => ({
        ...a,
        userName: profiles?.find(p => p.user_id === a.user_id)?.full_name || "",
        userEmail: profiles?.find(p => p.user_id === a.user_id)?.email || "",
      }));

      return new Response(JSON.stringify({ applications: appList }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (section === "emails") {
      const { data: emails } = await supabaseAdmin
        .from("email_logs")
        .select("*")
        .order("sent_at", { ascending: false });

      const { data: profiles } = await supabaseAdmin.from("profiles").select("user_id, full_name, email");

      const emailList = (emails || []).map(e => ({
        ...e,
        userName: profiles?.find(p => p.user_id === e.user_id)?.full_name || "",
        userEmail: profiles?.find(p => p.user_id === e.user_id)?.email || "",
      }));

      return new Response(JSON.stringify({ emails: emailList }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Invalid section" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("admin-data error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
