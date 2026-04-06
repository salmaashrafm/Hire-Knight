import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { Loader2, Save, Upload, FileText, Trash2, RotateCcw, Key } from "lucide-react";
import { DEFAULT_PROMPTS } from "@/lib/default-prompts";

export default function Settings() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [savingPrompts, setSavingPrompts] = useState(false);

  const [fullName, setFullName] = useState("");
  const [cvText, setCvText] = useState("");
  const [cvFilePath, setCvFilePath] = useState("");
  const [cvFileName, setCvFileName] = useState("");
  const [smtpHost, setSmtpHost] = useState("");
  const [smtpPort, setSmtpPort] = useState("587");
  const [smtpUser, setSmtpUser] = useState("");
  const [smtpPassword, setSmtpPassword] = useState("");
  const [openaiApiKey, setOpenaiApiKey] = useState("");

  // Prompts
  const [prompts, setPrompts] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!user) return;
    // Load profile + prompts in parallel
    Promise.all([
      supabase.from("profiles").select("*").eq("user_id", user.id).single(),
      supabase.from("user_prompts").select("prompt_key, prompt_text").eq("user_id", user.id),
    ]).then(([profileRes, promptsRes]) => {
      const data = profileRes.data;
      if (data) {
        setFullName(data.full_name || "");
        setCvText(data.cv_text || "");
        setCvFilePath((data as any).cv_file_path || "");
        setSmtpHost(data.smtp_host || "");
        setSmtpPort(String(data.smtp_port || 587));
        setSmtpUser(data.smtp_user || "");
        setOpenaiApiKey((data as any).openai_api_key || "");

      // Initialize prompts with defaults, override with user's custom ones
      const initial: Record<string, string> = {};
      for (const key of Object.keys(DEFAULT_PROMPTS)) {
        initial[key] = DEFAULT_PROMPTS[key].defaultText;
      }
      if (promptsRes.data) {
        for (const row of promptsRes.data) {
          if (row.prompt_text) initial[row.prompt_key] = row.prompt_text;
        }
      }
      setPrompts(initial);
      setLoading(false);
    });
  }, [user]);

  useEffect(() => {
    if (cvFilePath) {
      const parts = cvFilePath.split("/");
      setCvFileName(parts[parts.length - 1] || "cv.pdf");
    } else {
      setCvFileName("");
    }
  }, [cvFilePath]);

  const handleCvUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    if (file.type !== "application/pdf") {
      toast({ title: "PDF only", description: "Please upload a PDF file.", variant: "destructive" });
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast({ title: "File too large", description: "Max 10MB.", variant: "destructive" });
      return;
    }
    setUploading(true);
    const filePath = `${user.id}/${file.name}`;
    if (cvFilePath) await supabase.storage.from("cv-files").remove([cvFilePath]);
    const { error } = await supabase.storage.from("cv-files").upload(filePath, file, { upsert: true });
    if (error) {
      toast({ title: "Upload failed", description: error.message, variant: "destructive" });
      setUploading(false);
      return;
    }
    await supabase.from("profiles").update({ cv_file_path: filePath } as any).eq("user_id", user.id);
    setCvFilePath(filePath);
    toast({ title: "CV uploaded successfully!" });
    setUploading(false);
  };

  const removeCv = async () => {
    if (!user || !cvFilePath) return;
    setUploading(true);
    await supabase.storage.from("cv-files").remove([cvFilePath]);
    await supabase.from("profiles").update({ cv_file_path: "" } as any).eq("user_id", user.id);
    setCvFilePath("");
    toast({ title: "CV removed" });
    setUploading(false);
  };

  const save = async () => {
    if (!user) return;
    setSaving(true);
    const updateData: any = {
      full_name: fullName,
      cv_text: cvText,
      smtp_host: smtpHost,
      smtp_port: parseInt(smtpPort) || 587,
      smtp_user: smtpUser,
      smtp_password_encrypted: smtpPassword || undefined,
    };
    if (openaiApiKey) updateData.openai_api_key = openaiApiKey;
    const { error } = await supabase.from("profiles").update(updateData).eq("user_id", user.id);
    if (error) {
      toast({ title: "Save failed", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Settings saved" });
    }
    setSaving(false);
  };

  const savePrompts = async () => {
    if (!user) return;
    setSavingPrompts(true);
    try {
      for (const key of Object.keys(prompts)) {
        await supabase.from("user_prompts").upsert(
          { user_id: user.id, prompt_key: key, prompt_text: prompts[key] },
          { onConflict: "user_id,prompt_key" }
        );
      }
      toast({ title: "Prompts saved!" });
    } catch (err: any) {
      toast({ title: "Save failed", description: err.message, variant: "destructive" });
    }
    setSavingPrompts(false);
  };

  const resetPrompt = (key: string) => {
    setPrompts((prev) => ({ ...prev, [key]: DEFAULT_PROMPTS[key].defaultText }));
  };

  if (loading) return <p className="text-muted-foreground p-8">Loading...</p>;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground mt-1">Manage your profile, email, and AI prompts</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
          <CardDescription>Your personal information</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Full Name</Label>
            <Input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="John Doe" />
          </div>
          <div className="space-y-2">
            <Label>Default CV / Resume Text</Label>
            <Textarea rows={8} value={cvText} onChange={(e) => setCvText(e.target.value)} placeholder="Paste your CV text here to auto-fill in new applications..." />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>CV PDF File</CardTitle>
          <CardDescription>Upload your CV as a PDF — it will be attached to application emails</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {cvFilePath ? (
            <div className="flex items-center justify-between gap-3 p-3 border rounded-lg bg-muted/50">
              <div className="flex items-center gap-3">
                <FileText className="h-8 w-8 text-primary" />
                <div>
                  <p className="font-medium text-sm">{cvFileName}</p>
                  <p className="text-xs text-muted-foreground">PDF uploaded</p>
                </div>
              </div>
              <Button variant="ghost" size="icon" onClick={removeCv} disabled={uploading}>
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
          ) : (
            <div className="border-2 border-dashed rounded-lg p-6 text-center">
              <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground mb-3">Upload your CV (PDF, max 10MB)</p>
              <label>
                <input type="file" accept=".pdf" className="hidden" onChange={handleCvUpload} disabled={uploading} />
                <Button variant="outline" asChild disabled={uploading}>
                  <span>
                    {uploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
                    Choose PDF
                  </span>
                </Button>
              </label>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>SMTP Configuration</CardTitle>
          <CardDescription>Configure your email server to send applications directly</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>SMTP Host</Label>
              <Input value={smtpHost} onChange={(e) => setSmtpHost(e.target.value)} placeholder="smtp.gmail.com" />
            </div>
            <div className="space-y-2">
              <Label>Port</Label>
              <Input value={smtpPort} onChange={(e) => setSmtpPort(e.target.value)} placeholder="587" />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Username / Email</Label>
            <Input value={smtpUser} onChange={(e) => setSmtpUser(e.target.value)} placeholder="your@email.com" />
          </div>
          <div className="space-y-2">
            <Label>Password / App Password</Label>
            <Input type="password" value={smtpPassword} onChange={(e) => setSmtpPassword(e.target.value)} placeholder="Leave blank to keep current" />
          </div>
        </CardContent>
      </Card>

      <Button onClick={save} disabled={saving} className="w-full">
        {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
        Save Profile & SMTP
      </Button>

      {/* AI Prompts Section */}
      <Card>
        <CardHeader>
          <CardTitle>AI Prompts</CardTitle>
          <CardDescription>Customize the instructions sent to AI for CV analysis and email generation</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {Object.entries(DEFAULT_PROMPTS).map(([key, { label }]) => (
            <div key={key} className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>{label}</Label>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => resetPrompt(key)}
                  className="text-xs text-muted-foreground h-7"
                >
                  <RotateCcw className="mr-1 h-3 w-3" /> Reset to default
                </Button>
              </div>
              <Textarea
                rows={8}
                value={prompts[key] || ""}
                onChange={(e) => setPrompts((prev) => ({ ...prev, [key]: e.target.value }))}
                className="font-mono text-xs"
              />
            </div>
          ))}
        </CardContent>
      </Card>

      <Button onClick={savePrompts} disabled={savingPrompts} className="w-full">
        {savingPrompts ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
        Save AI Prompts
      </Button>
    </div>
  );
}
