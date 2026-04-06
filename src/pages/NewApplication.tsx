import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { Loader2, Sparkles, Mail, Send, CheckCircle, AlertTriangle, AlertCircle } from "lucide-react";

export default function NewApplication() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [cvLoaded, setCvLoaded] = useState(false);

  // Form — company & title auto-filled by AI
  const [companyName, setCompanyName] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [jobDescription, setJobDescription] = useState("");
  const [cvText, setCvText] = useState("");
  const [candidateName, setCandidateName] = useState("");
  const [recipientEmail, setRecipientEmail] = useState("");

  // Analysis
  const [matchScore, setMatchScore] = useState<number | null>(null);
  const [strengths, setStrengths] = useState<string[]>([]);
  const [gaps, setGaps] = useState<string[]>([]);

  // Email
  const [emailSubject, setEmailSubject] = useState("");
  const [emailBody, setEmailBody] = useState("");

  // Load CV + name from profile on mount
  useEffect(() => {
    if (!user) return;
    supabase.from("profiles").select("cv_text, full_name").eq("user_id", user.id).single().then(({ data }) => {
      if (data?.cv_text) {
        setCvText(data.cv_text);
        setCvLoaded(true);
      }
      if (data?.full_name) setCandidateName(data.full_name);
    });
  }, [user]);

  const analyzeCV = async () => {
    if (!jobDescription.trim() || !cvText.trim()) {
      toast({ title: "معلومات ناقصة", description: "من فضلك اضف الـ CV ووصف الوظيفة.", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("analyze-cv", {
        body: { cvText, jobDescription },
      });
      if (error) throw error;
      setMatchScore(data.matchScore);
      setStrengths(data.strengths || []);
      setGaps(data.gaps || []);
      // Auto-fill from AI extraction
      if (data.candidateName && !candidateName) setCandidateName(data.candidateName);
      if (data.companyName) setCompanyName(data.companyName);
      if (data.jobTitle) setJobTitle(data.jobTitle);
      setStep(2);
      toast({ title: "التحليل اكتمل!" });
    } catch (err: any) {
      toast({ title: "التحليل فشل", description: err.message, variant: "destructive" });
    }
    setLoading(false);
  };

  const generateEmail = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-email", {
        body: { companyName, jobTitle, strengths, gaps, matchScore, candidateName, cvText },
      });
      if (error) throw error;
      setEmailSubject(data.subject);
      setEmailBody(data.body);
      setStep(3);
      toast({ title: "تم إنشاء الإيميل!" });
    } catch (err: any) {
      toast({ title: "الإنشاء فشل", description: err.message, variant: "destructive" });
    }
    setLoading(false);
  };

  const saveApplication = async (status: "draft" | "sent") => {
    if (!user) return;
    setLoading(true);
    try {
      const { data: app, error } = await supabase.from("applications").insert({
        user_id: user.id,
        company_name: companyName,
        job_title: jobTitle,
        job_description: jobDescription,
        cv_text: cvText,
        match_score: matchScore,
        strengths: strengths as any,
        gaps: gaps as any,
        generated_email_subject: emailSubject,
        generated_email_body: emailBody,
        recipient_email: recipientEmail,
        status,
      }).select().single();

      if (error) throw error;

      if (status === "sent" && recipientEmail) {
        const { error: sendErr } = await supabase.functions.invoke("send-application-email", {
          body: {
            applicationId: app.id,
            recipientEmail,
            subject: emailSubject,
            body: emailBody,
          },
        });
        if (sendErr) {
          toast({ title: "إرسال الإيميل فشل", description: sendErr.message, variant: "destructive" });
        } else {
          toast({ title: "تم إرسال الطلب!" });
        }
      } else {
        toast({ title: "تم الحفظ كمسودة" });
      }
      navigate("/applications");
    } catch (err: any) {
      toast({ title: "الحفظ فشل", description: err.message, variant: "destructive" });
    }
    setLoading(false);
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">New Application</h1>
        <p className="text-muted-foreground mt-1">Analyze, generate, and send in 3 steps</p>
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-2">
        {[1, 2, 3].map((s) => (
          <div key={s} className="flex items-center gap-2">
            <div className={`h-8 w-8 rounded-full flex items-center justify-center text-sm font-medium ${step >= s ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
              {s}
            </div>
            {s < 3 && <div className={`h-0.5 w-8 ${step > s ? "bg-primary" : "bg-muted"}`} />}
          </div>
        ))}
        <span className="ml-2 text-sm text-muted-foreground">
          {step === 1 ? "Analyze" : step === 2 ? "Review & Generate" : "Review & Send"}
        </span>
      </div>

      {/* Step 1: Just paste job description — CV comes from profile */}
      {step === 1 && (
        <Card>
          <CardHeader>
            <CardTitle>Job Description</CardTitle>
            <CardDescription>Paste the job description — your CV is loaded from your profile settings</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {cvLoaded ? (
              <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                <CheckCircle className="h-4 w-4" />
                CV loaded from profile{candidateName && ` — ${candidateName}`}
              </div>
            ) : (
              <div className="flex items-center gap-2 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                <AlertCircle className="h-4 w-4" />
                No CV found in profile. <a href="/settings" className="underline font-medium">Add it in Settings</a>, or paste below.
              </div>
            )}

            <div className="space-y-2">
              <Label>Job Description</Label>
              <Textarea rows={8} value={jobDescription} onChange={(e) => setJobDescription(e.target.value)} placeholder="Paste the full job description here..." />
            </div>

            {!cvLoaded && (
              <div className="space-y-2">
                <Label>Your CV / Resume Text</Label>
                <Textarea rows={6} value={cvText} onChange={(e) => setCvText(e.target.value)} placeholder="Paste your CV text here..." />
              </div>
            )}

            <Button onClick={analyzeCV} disabled={loading || !jobDescription.trim() || !cvText.trim()}>
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
              Analyze Match
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Step 2: Analysis Results + auto-filled company/title (editable) */}
      {step === 2 && (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Match Analysis</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-4">
                <div className="text-4xl font-bold text-primary">{matchScore}%</div>
                <div className="flex-1">
                  <div className="h-3 w-full rounded-full bg-secondary">
                    <div className="h-3 rounded-full bg-primary transition-all" style={{ width: `${matchScore}%` }} />
                  </div>
                </div>
              </div>

              {/* Editable auto-filled fields */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Company Name</Label>
                  <Input value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder="Auto-detected..." />
                </div>
                <div className="space-y-2">
                  <Label>Job Title</Label>
                  <Input value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} placeholder="Auto-detected..." />
                </div>
              </div>

              {strengths.length > 0 && (
                <div>
                  <h3 className="font-medium flex items-center gap-2 mb-2"><CheckCircle className="h-4 w-4 text-green-600" /> Strengths</h3>
                  <div className="flex flex-wrap gap-2">
                    {strengths.map((s, i) => <Badge key={i} variant="secondary" className="bg-green-50 text-green-700 border-green-200">{s}</Badge>)}
                  </div>
                </div>
              )}

              {gaps.length > 0 && (
                <div>
                  <h3 className="font-medium flex items-center gap-2 mb-2"><AlertTriangle className="h-4 w-4 text-amber-500" /> Gaps</h3>
                  <div className="flex flex-wrap gap-2">
                    {gaps.map((g, i) => <Badge key={i} variant="secondary" className="bg-amber-50 text-amber-700 border-amber-200">{g}</Badge>)}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
          <div className="flex gap-3">
            <Button variant="outline" onClick={() => setStep(1)}>Back</Button>
            <Button onClick={generateEmail} disabled={loading || !companyName || !jobTitle}>
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Mail className="mr-2 h-4 w-4" />}
              Generate Email
            </Button>
          </div>
        </div>
      )}

      {/* Step 3: Email & Send */}
      {step === 3 && (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Application Email</CardTitle>
              <CardDescription>Review and edit the generated email before sending</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Recipient Email</Label>
                <Input type="email" value={recipientEmail} onChange={(e) => setRecipientEmail(e.target.value)} placeholder="hr@company.com" />
              </div>
              <div className="space-y-2">
                <Label>Subject</Label>
                <Input value={emailSubject} onChange={(e) => setEmailSubject(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Email Body</Label>
                <Textarea rows={12} value={emailBody} onChange={(e) => setEmailBody(e.target.value)} />
              </div>
            </CardContent>
          </Card>
          <div className="flex gap-3">
            <Button variant="outline" onClick={() => setStep(2)}>Back</Button>
            <Button variant="outline" onClick={() => saveApplication("draft")} disabled={loading}>
              Save as Draft
            </Button>
            <Button onClick={() => saveApplication("sent")} disabled={loading || !recipientEmail}>
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
              Send Application
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
