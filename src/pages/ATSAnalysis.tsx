import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { toast } from "@/hooks/use-toast";
import {
  Loader2, ScanSearch, CheckCircle, AlertCircle, AlertTriangle, Info, XCircle, Lightbulb,
} from "lucide-react";

interface ATSIssue {
  category: string;
  severity: "critical" | "warning" | "suggestion";
  issue: string;
  fix: string;
}

interface ATSResult {
  atsScore: number;
  issues: ATSIssue[];
  missingKeywords: string[];
  summary: string;
}

const severityConfig = {
  critical: { icon: XCircle, color: "text-red-600", bg: "bg-red-50 border-red-200", badge: "bg-red-100 text-red-700 border-red-300" },
  warning: { icon: AlertTriangle, color: "text-amber-600", bg: "bg-amber-50 border-amber-200", badge: "bg-amber-100 text-amber-700 border-amber-300" },
  suggestion: { icon: Lightbulb, color: "text-blue-600", bg: "bg-blue-50 border-blue-200", badge: "bg-blue-100 text-blue-700 border-blue-300" },
};

const categoryLabels: Record<string, string> = {
  formatting: "Formatting",
  keywords: "Keywords",
  structure: "Structure",
  contact_info: "Contact Info",
  length: "Length",
  skills: "Skills",
  experience: "Experience",
  education: "Education",
};

function getScoreColor(score: number) {
  if (score >= 80) return "text-green-600";
  if (score >= 60) return "text-amber-600";
  return "text-red-600";
}

function getScoreLabel(score: number) {
  if (score >= 80) return "ATS Friendly ✅";
  if (score >= 60) return "Needs Improvement ⚠️";
  return "Poor ATS Compatibility ❌";
}

export default function ATSAnalysis() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [cvText, setCvText] = useState("");
  const [cvLoaded, setCvLoaded] = useState(false);
  const [result, setResult] = useState<ATSResult | null>(null);

  useEffect(() => {
    if (!user) return;
    supabase.from("profiles").select("cv_text").eq("user_id", user.id).single().then(({ data }) => {
      if (data?.cv_text) {
        setCvText(data.cv_text);
        setCvLoaded(true);
      }
    });
  }, [user]);

  const analyzeATS = async () => {
    if (!cvText.trim()) {
      toast({ title: "CV مطلوب", description: "اضف الـ CV الأول.", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("analyze-ats", {
        body: { cvText },
      });
      if (error) throw error;
      setResult(data);
      toast({ title: "تم التحليل بنجاح!" });
    } catch (err: any) {
      toast({ title: "التحليل فشل", description: err.message, variant: "destructive" });
    }
    setLoading(false);
  };

  const criticalCount = result?.issues.filter(i => i.severity === "critical").length || 0;
  const warningCount = result?.issues.filter(i => i.severity === "warning").length || 0;
  const suggestionCount = result?.issues.filter(i => i.severity === "suggestion").length || 0;

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">ATS CV Analysis</h1>
        <p className="text-muted-foreground mt-1">Check if your CV passes Applicant Tracking Systems</p>
      </div>

      {/* Input */}
      {!result && (
        <Card>
          <CardHeader>
            <CardTitle>Your CV</CardTitle>
            <CardDescription>
              {cvLoaded
                ? "CV loaded from your profile. Click analyze to check ATS compatibility."
                : "Paste your CV text below to analyze it."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {cvLoaded ? (
              <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                <CheckCircle className="h-4 w-4" />
                CV loaded from profile
              </div>
            ) : (
              <div className="flex items-center gap-2 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                <AlertCircle className="h-4 w-4" />
                No CV in profile. <a href="/settings" className="underline font-medium">Add it in Settings</a> or paste below.
              </div>
            )}

            {!cvLoaded && (
              <div className="space-y-2">
                <Label>CV / Resume Text</Label>
                <Textarea rows={8} value={cvText} onChange={(e) => setCvText(e.target.value)} placeholder="Paste your CV here..." />
              </div>
            )}

            <Button onClick={analyzeATS} disabled={loading || !cvText.trim()} size="lg">
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ScanSearch className="mr-2 h-4 w-4" />}
              Analyze ATS Compatibility
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Results */}
      {result && (
        <div className="space-y-4">
          {/* Score Card */}
          <Card>
            <CardContent className="pt-6">
              <div className="flex flex-col items-center text-center gap-3">
                <div className={`text-6xl font-bold ${getScoreColor(result.atsScore)}`}>
                  {result.atsScore}%
                </div>
                <div className="text-lg font-medium">{getScoreLabel(result.atsScore)}</div>
                <Progress value={result.atsScore} className="w-full max-w-md h-3" />
                <p className="text-sm text-muted-foreground max-w-lg">{result.summary}</p>
              </div>

              <div className="flex justify-center gap-4 mt-4">
                <div className="flex items-center gap-1 text-sm">
                  <XCircle className="h-4 w-4 text-red-600" />
                  <span className="font-medium">{criticalCount}</span> Critical
                </div>
                <div className="flex items-center gap-1 text-sm">
                  <AlertTriangle className="h-4 w-4 text-amber-600" />
                  <span className="font-medium">{warningCount}</span> Warnings
                </div>
                <div className="flex items-center gap-1 text-sm">
                  <Lightbulb className="h-4 w-4 text-blue-600" />
                  <span className="font-medium">{suggestionCount}</span> Suggestions
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Issues */}
          {result.issues.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <AlertCircle className="h-5 w-5" />
                  Issues Found ({result.issues.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {result.issues.map((issue, i) => {
                  const config = severityConfig[issue.severity];
                  const Icon = config.icon;
                  return (
                    <div key={i} className={`rounded-lg border p-3 ${config.bg}`}>
                      <div className="flex items-start gap-3">
                        <Icon className={`h-5 w-5 mt-0.5 ${config.color}`} />
                        <div className="flex-1 space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium text-sm">{issue.issue}</span>
                            <Badge variant="outline" className={`text-xs ${config.badge}`}>
                              {issue.severity}
                            </Badge>
                            <Badge variant="outline" className="text-xs">
                              {categoryLabels[issue.category] || issue.category}
                            </Badge>
                          </div>
                          <p className="text-sm text-muted-foreground flex items-start gap-1">
                            <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                            {issue.fix}
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          )}

          {/* Missing Keywords */}
          {result.missingKeywords && result.missingKeywords.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ScanSearch className="h-5 w-5" />
                  Missing Keywords
                </CardTitle>
                <CardDescription>
                  Consider adding these keywords to improve ATS matching
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {result.missingKeywords.map((kw, i) => (
                    <Badge key={i} variant="secondary" className="bg-muted">{kw}</Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          <Button variant="outline" onClick={() => setResult(null)}>
            Analyze Again
          </Button>
        </div>
      )}
    </div>
  );
}
