import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { Plus, Send, Pencil, Trash2, Loader2, FileText, Copy, MessageCircle } from "lucide-react";

interface EmailTemplate {
  id: string;
  user_id: string;
  name: string;
  subject: string;
  body: string;
  is_default: boolean;
  created_at: string;
}

const PLACEHOLDERS = ["{{companyName}}", "{{jobTitle}}", "{{candidateName}}"];

function replacePlaceholders(text: string, values: Record<string, string>) {
  return text
    .replace(/\{\{companyName\}\}/g, values.companyName || "")
    .replace(/\{\{jobTitle\}\}/g, values.jobTitle || "")
    .replace(/\{\{candidateName\}\}/g, values.candidateName || "");
}

export default function Templates() {
  const { user } = useAuth();
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [loading, setLoading] = useState(true);

  // Create/Edit template
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formName, setFormName] = useState("");
  const [formSubject, setFormSubject] = useState("");
  const [formBody, setFormBody] = useState("");

  // Send dialog
  const [sendTemplate, setSendTemplate] = useState<EmailTemplate | null>(null);
  const [sendEmail, setSendEmail] = useState("");
  const [sendCompany, setSendCompany] = useState("");
  const [sendJobTitle, setSendJobTitle] = useState("");
  const [sendName, setSendName] = useState("");
  const [sendSubject, setSendSubject] = useState("");
  const [sending, setSending] = useState(false);

  const fetchTemplates = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("email_templates")
      .select("*")
      .order("is_default", { ascending: false })
      .order("created_at", { ascending: false });
    setTemplates((data as EmailTemplate[]) || []);
    setLoading(false);
  };

  useEffect(() => {
    fetchTemplates();
  }, [user]);

  // Load user profile name
  useEffect(() => {
    if (!user) return;
    supabase.from("profiles").select("full_name").eq("user_id", user.id).single().then(({ data }) => {
      if (data?.full_name) setSendName(data.full_name);
    });
  }, [user]);

  const resetForm = () => {
    setFormName("");
    setFormSubject("");
    setFormBody("");
    setEditingId(null);
    setShowForm(false);
  };

  const saveTemplate = async () => {
    if (!user || !formName.trim()) return;
    if (editingId) {
      const { error } = await supabase.from("email_templates").update({
        name: formName, subject: formSubject, body: formBody,
      }).eq("id", editingId);
      if (error) { toast({ title: "فشل الحفظ", variant: "destructive" }); return; }
    } else {
      const { error } = await supabase.from("email_templates").insert({
        user_id: user.id, name: formName, subject: formSubject, body: formBody,
      });
      if (error) { toast({ title: "فشل الإضافة", variant: "destructive" }); return; }
    }
    toast({ title: "تم الحفظ ✓" });
    resetForm();
    fetchTemplates();
  };

  const deleteTemplate = async (id: string) => {
    const { error } = await supabase.from("email_templates").delete().eq("id", id);
    if (error) { toast({ title: "فشل الحذف", variant: "destructive" }); return; }
    toast({ title: "تم الحذف" });
    fetchTemplates();
  };

  const duplicateTemplate = async (t: EmailTemplate) => {
    if (!user) return;
    const { error } = await supabase.from("email_templates").insert({
      user_id: user.id,
      name: `${t.name} (نسخة)`,
      subject: t.subject,
      body: t.body,
    });
    if (error) { toast({ title: "فشل النسخ", variant: "destructive" }); return; }
    toast({ title: "تم النسخ ✓" });
    fetchTemplates();
  };

  const handleSend = async () => {
    if (!sendTemplate || !sendEmail || !user) {
      toast({ title: "بيانات ناقصة", variant: "destructive" });
      return;
    }
    setSending(true);
    const values = { companyName: sendCompany, jobTitle: sendJobTitle, candidateName: sendName };
    const finalSubject = replacePlaceholders(sendSubject, values);
    const finalBody = replacePlaceholders(sendTemplate.body, values);

    try {
      // Create a quick application record
      const { data: appData, error: appErr } = await supabase.from("applications").insert({
        user_id: user.id,
        company_name: sendCompany || "—",
        job_title: sendJobTitle || "—",
        job_description: "",
        cv_text: "",
        generated_email_subject: finalSubject,
        generated_email_body: finalBody,
        recipient_email: sendEmail,
        status: "draft" as const,
      }).select("id").single();

      if (appErr) throw appErr;

      const { error } = await supabase.functions.invoke("send-application-email", {
        body: {
          applicationId: appData.id,
          recipientEmail: sendEmail,
          subject: finalSubject,
          body: finalBody,
        },
      });
      if (error) throw error;

      await supabase.from("applications").update({ status: "sent" as const }).eq("id", appData.id);

      toast({ title: "تم الإرسال بنجاح! ✓" });
      setSendTemplate(null);
      setSendEmail("");
      setSendCompany("");
      setSendJobTitle("");
      setSendSubject("");
    } catch (err: any) {
      toast({ title: "فشل الإرسال", description: err.message, variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  const startEdit = (t: EmailTemplate) => {
    setEditingId(t.id);
    setFormName(t.name);
    setFormSubject(t.subject);
    setFormBody(t.body);
    setShowForm(true);
  };

  if (loading) return <p className="text-muted-foreground p-8">Loading...</p>;

  const defaultTemplates = templates.filter((t) => t.is_default);
  const userTemplates = templates.filter((t) => !t.is_default);

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">قوالب الرسائل</h1>
        <Button onClick={() => { resetForm(); setShowForm(true); }} className="gap-2">
          <Plus className="h-4 w-4" /> قالب جديد
        </Button>
      </div>

      {/* Create / Edit form */}
      {showForm && (
        <Card>
          <CardHeader>
            <CardTitle>{editingId ? "تعديل القالب" : "قالب جديد"}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1">
              <Label>اسم القالب</Label>
              <Input value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="مثال: رسالة تقديم" />
            </div>
            <div className="space-y-1">
              <Label>الموضوع</Label>
              <Input value={formSubject} onChange={(e) => setFormSubject(e.target.value)} placeholder="Application for {{jobTitle}}" />
            </div>
            <div className="space-y-1">
              <Label>المحتوى</Label>
              <Textarea rows={8} value={formBody} onChange={(e) => setFormBody(e.target.value)} placeholder="Dear Hiring Manager..." />
            </div>
            <div className="flex flex-wrap gap-1 text-xs text-muted-foreground">
              المتغيرات: {PLACEHOLDERS.map((p) => <Badge key={p} variant="outline" className="text-xs">{p}</Badge>)}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={resetForm}>إلغاء</Button>
              <Button onClick={saveTemplate} disabled={!formName.trim()}>حفظ</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Default templates */}
      {defaultTemplates.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold text-muted-foreground">قوالب جاهزة</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {defaultTemplates.map((t) => (
              <TemplateCard
                key={t.id}
                template={t}
                onSend={() => { setSendTemplate(t); setSendSubject(t.subject); }}
                onDuplicate={() => duplicateTemplate(t)}
              />
            ))}
          </div>
        </div>
      )}

      {/* User templates */}
      {userTemplates.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold text-muted-foreground">قوالبي</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {userTemplates.map((t) => (
              <TemplateCard
                key={t.id}
                template={t}
                onSend={() => { setSendTemplate(t); setSendSubject(t.subject); }}
                onEdit={() => startEdit(t)}
                onDelete={() => deleteTemplate(t.id)}
                onDuplicate={() => duplicateTemplate(t)}
              />
            ))}
          </div>
        </div>
      )}

      {templates.length === 0 && !showForm && (
        <div className="text-center py-12 text-muted-foreground">
          <FileText className="h-12 w-12 mx-auto mb-3 opacity-50" />
          <p>لا يوجد قوالب بعد. أضف قالب جديد!</p>
        </div>
      )}

      {/* Send Dialog */}
      <Dialog open={!!sendTemplate} onOpenChange={(open) => !open && setSendTemplate(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>إرسال: {sendTemplate?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>إيميل المستلم *</Label>
              <Input type="email" value={sendEmail} onChange={(e) => setSendEmail(e.target.value)} placeholder="hr@company.com" />
            </div>
            <div className="space-y-1">
              <Label>اسم الشركة</Label>
              <Input value={sendCompany} onChange={(e) => setSendCompany(e.target.value)} placeholder="Google" />
            </div>
            <div className="space-y-1">
              <Label>المسمى الوظيفي</Label>
              <Input value={sendJobTitle} onChange={(e) => setSendJobTitle(e.target.value)} placeholder="Software Engineer" />
            </div>
            <div className="space-y-1">
              <Label>اسمك</Label>
              <Input value={sendName} onChange={(e) => setSendName(e.target.value)} placeholder="Your Name" />
            </div>
            <div className="space-y-1">
              <Label>الموضوع (Subject)</Label>
              <Input value={sendSubject} onChange={(e) => setSendSubject(e.target.value)} placeholder={sendTemplate ? replacePlaceholders(sendTemplate.subject, { companyName: sendCompany, jobTitle: sendJobTitle, candidateName: sendName }) : ""} />
            </div>

            {sendTemplate && (
              <div className="rounded-md bg-muted p-3 text-sm max-h-40 overflow-y-auto whitespace-pre-wrap">
                <p className="font-medium mb-1">{replacePlaceholders(sendSubject, { companyName: sendCompany, jobTitle: sendJobTitle, candidateName: sendName })}</p>
                <p className="text-muted-foreground">{replacePlaceholders(sendTemplate.body, { companyName: sendCompany, jobTitle: sendJobTitle, candidateName: sendName })}</p>
              </div>
            )}

            <Button className="w-full" onClick={handleSend} disabled={sending || !sendEmail}>
              {sending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
              إرسال الآن
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function TemplateCard({
  template,
  onSend,
  onEdit,
  onDelete,
  onDuplicate,
}: {
  template: EmailTemplate;
  onSend: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  onDuplicate?: () => void;
}) {
  return (
    <Card className="flex flex-col">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between">
          <CardTitle className="text-base">{template.name}</CardTitle>
          {template.is_default && <Badge variant="secondary" className="text-xs">جاهز</Badge>}
        </div>
        <p className="text-xs text-muted-foreground truncate">{template.subject}</p>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col justify-end">
        <p className="text-sm text-muted-foreground line-clamp-3 mb-3">{template.body}</p>
        <div className="flex gap-1.5 flex-wrap">
          <Button size="sm" onClick={onSend} className="gap-1">
            <Send className="h-3 w-3" /> إرسال
          </Button>
          {onDuplicate && (
            <Button size="sm" variant="outline" onClick={onDuplicate}>
              <Copy className="h-3 w-3" />
            </Button>
          )}
          {onEdit && (
            <Button size="sm" variant="outline" onClick={onEdit}>
              <Pencil className="h-3 w-3" />
            </Button>
          )}
          {onDelete && (
            <Button size="sm" variant="destructive" onClick={onDelete}>
              <Trash2 className="h-3 w-3" />
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
