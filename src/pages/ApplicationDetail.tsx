import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { ArrowLeft, CheckCircle, AlertTriangle, Mail, Trash2, Send, Loader2, Pencil, MessageCircle, Phone } from "lucide-react";
import type { Tables, Enums } from "@/integrations/supabase/types";

type Application = Tables<"applications">;
type EmailLog = Tables<"email_logs">;

export default function ApplicationDetail() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [app, setApp] = useState<Application | null>(null);
  const [emails, setEmails] = useState<EmailLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [editing, setEditing] = useState(false);

  // Editable fields
  const [editSubject, setEditSubject] = useState("");
  const [editBody, setEditBody] = useState("");
  const [editRecipient, setEditRecipient] = useState("");

  useEffect(() => {
    if (!id || !user) return;
    Promise.all([
      supabase.from("applications").select("*").eq("id", id).eq("user_id", user.id).single(),
      supabase.from("email_logs").select("*").eq("application_id", id).eq("user_id", user.id).order("sent_at", { ascending: false }),
    ]).then(([{ data: appData }, { data: emailData }]) => {
      setApp(appData);
      if (appData) {
        setEditSubject(appData.generated_email_subject || "");
        setEditBody(appData.generated_email_body || "");
        setEditRecipient(appData.recipient_email || "");
      }
      setEmails(emailData || []);
      setLoading(false);
    });
  }, [id, user]);

  const updateStatus = async (status: string) => {
    if (!id) return;
    const { error } = await supabase.from("applications").update({ status: status as Enums<"application_status"> }).eq("id", id);
    if (error) {
      toast({ title: "Update failed", description: error.message, variant: "destructive" });
    } else {
      setApp((prev) => prev ? { ...prev, status: status as Enums<"application_status"> } : null);
      toast({ title: "Status updated" });
    }
  };

  const deleteApp = async () => {
    if (!id) return;
    const { error } = await supabase.from("applications").delete().eq("id", id);
    if (error) {
      toast({ title: "Delete failed", description: error.message, variant: "destructive" });
    } else {
      navigate("/applications");
    }
  };

  const saveEdits = async () => {
    if (!id) return;
    const { error } = await supabase.from("applications").update({
      generated_email_subject: editSubject,
      generated_email_body: editBody,
      recipient_email: editRecipient,
    }).eq("id", id);
    if (error) {
      toast({ title: "الحفظ فشل", description: error.message, variant: "destructive" });
    } else {
      setApp((prev) => prev ? { ...prev, generated_email_subject: editSubject, generated_email_body: editBody, recipient_email: editRecipient } : null);
      setEditing(false);
      toast({ title: "تم الحفظ" });
    }
  };

  const resendEmail = async () => {
    if (!id || !editRecipient || !editSubject || !editBody) {
      toast({ title: "بيانات ناقصة", description: "تأكد من الإيميل والموضوع والمحتوى", variant: "destructive" });
      return;
    }

    setSending(true);

    try {
      const { error: saveError } = await supabase.from("applications").update({
        generated_email_subject: editSubject,
        generated_email_body: editBody,
        recipient_email: editRecipient,
      }).eq("id", id);

      if (saveError) throw saveError;

      const sendRequest = supabase.functions.invoke("send-application-email", {
        body: {
          applicationId: id,
          recipientEmail: editRecipient,
          subject: editSubject,
          body: editBody,
        },
      }).then(({ data, error }) => {
        if (error) throw error;
        if (data?.status && data.status !== "sent") {
          const errMsg = data.error || "Email send failed";
          if (errMsg.includes("SMTP") || errMsg.includes("timeout") || errMsg.includes("timed out") || errMsg.includes("ECONNREFUSED")) {
            throw new Error("فشل الإرسال — تأكد من إعدادات SMTP في صفحة الإعدادات (السيرفر، البورت، الإيميل، والباسوورد)");
          }
          throw new Error(errMsg);
        }
        return data;
      });

      await Promise.race([
        sendRequest,
        new Promise((_, reject) => setTimeout(() => reject(new Error("انتهت مهلة الإرسال، جرّب تاني بعد شوية")), 35000)),
      ]);

      const { data: emailData } = await supabase.from("email_logs").select("*").eq("application_id", id).order("sent_at", { ascending: false });
      setEmails(emailData || []);
      setApp((prev) => prev ? { ...prev, status: "sent" as Enums<"application_status">, generated_email_subject: editSubject, generated_email_body: editBody, recipient_email: editRecipient } : null);
      setEditing(false);
      toast({ title: "تم إرسال الإيميل!" });
    } catch (err: any) {
      toast({ title: "الإرسال فشل", description: err.message, variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  if (loading) return <p className="text-muted-foreground p-8">Loading...</p>;
  if (!app) return <p className="text-muted-foreground p-8">Application not found.</p>;

  const strengths = Array.isArray(app.strengths) ? (app.strengths as string[]) : [];
  const gaps = Array.isArray(app.gaps) ? (app.gaps as string[]) : [];

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <Button variant="ghost" onClick={() => navigate("/applications")} className="gap-2">
        <ArrowLeft className="h-4 w-4" /> Back
      </Button>

      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{app.job_title}</h1>
          <p className="text-lg text-muted-foreground">{app.company_name}</p>
        </div>
        <div className="flex items-center gap-3">
          <Select value={app.status} onValueChange={updateStatus}>
            <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="sent">Sent</SelectItem>
              <SelectItem value="replied">Replied</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="destructive" size="icon" onClick={deleteApp}><Trash2 className="h-4 w-4" /></Button>
        </div>
      </div>

      {app.match_score && (
        <Card>
          <CardHeader><CardTitle className="text-sm text-muted-foreground">Match Score</CardTitle></CardHeader>
          <CardContent>
            <div className="flex items-center gap-4">
              <span className="text-4xl font-bold text-primary">{app.match_score}%</span>
              <div className="flex-1 h-3 rounded-full bg-secondary">
                <div className="h-3 rounded-full bg-primary" style={{ width: `${app.match_score}%` }} />
              </div>
            </div>

            {strengths.length > 0 && (
              <div className="mt-4">
                <h3 className="font-medium flex items-center gap-2 mb-2"><CheckCircle className="h-4 w-4 text-green-600" /> Strengths</h3>
                <div className="flex flex-wrap gap-2">
                  {strengths.map((s, i) => <Badge key={i} variant="secondary" className="bg-green-50 text-green-700">{s}</Badge>)}
                </div>
              </div>
            )}
            {gaps.length > 0 && (
              <div className="mt-4">
                <h3 className="font-medium flex items-center gap-2 mb-2"><AlertTriangle className="h-4 w-4 text-amber-500" /> Gaps</h3>
                <div className="flex flex-wrap gap-2">
                  {gaps.map((g, i) => <Badge key={i} variant="secondary" className="bg-amber-50 text-amber-700">{g}</Badge>)}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Email Section — View / Edit / Resend */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2"><Mail className="h-4 w-4" /> الإيميل</CardTitle>
            <div className="flex gap-2">
              {!editing && (
                <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
                  <Pencil className="mr-2 h-3 w-3" /> تعديل
                </Button>
              )}
              <Button size="sm" onClick={resendEmail} disabled={sending || !editRecipient}>
                {sending ? <Loader2 className="mr-2 h-3 w-3 animate-spin" /> : <Send className="mr-2 h-3 w-3" />}
                إرسال {app.status === "sent" ? "تاني" : ""}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {editing ? (
            <>
              <div className="space-y-2">
                <Label>إيميل المستلم</Label>
                <Input type="email" value={editRecipient} onChange={(e) => setEditRecipient(e.target.value)} placeholder="hr@company.com" />
              </div>
              <div className="space-y-2">
                <Label>الموضوع</Label>
                <Input value={editSubject} onChange={(e) => setEditSubject(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>المحتوى</Label>
                <Textarea rows={10} value={editBody} onChange={(e) => setEditBody(e.target.value)} />
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => { setEditing(false); setEditSubject(app.generated_email_subject || ""); setEditBody(app.generated_email_body || ""); setEditRecipient(app.recipient_email || ""); }}>إلغاء</Button>
                <Button onClick={saveEdits}>حفظ التعديلات</Button>
              </div>
            </>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">إلى: {app.recipient_email || "—"}</p>
              <p className="font-medium">{app.generated_email_subject || "لا يوجد موضوع"}</p>
              <p className="text-sm whitespace-pre-wrap">{app.generated_email_body || "لا يوجد محتوى"}</p>
            </>
          )}
        </CardContent>
      </Card>

      {emails.length > 0 && (
        <Card>
          <CardHeader><CardTitle>سجل الإيميلات</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {emails.map((e) => (
              <div key={e.id} className="flex items-center justify-between border-b pb-2 last:border-0">
                <div>
                  <p className="text-sm font-medium">{e.subject}</p>
                  <p className="text-xs text-muted-foreground">{e.recipient_email} · {new Date(e.sent_at).toLocaleString()}</p>
                </div>
                <Badge variant={e.status === "sent" ? "default" : "destructive"}>{e.status}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
