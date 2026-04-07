import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { Loader2, Search, ExternalLink, Lightbulb, Sparkles, Globe, Briefcase } from "lucide-react";

interface SearchQuery {
  query: string;
  label: string;
  site: "google" | "linkedin" | "indeed" | "glassdoor" | "wuzzuf" | "bayt";
}

interface Suggestions {
  suggestedTitle: string;
  skills: string[];
  searchQueries: SearchQuery[];
  tips: string[];
}

const siteConfig: Record<string, { name: string; color: string; icon: string; buildUrl: (query: string) => string }> = {
  google: {
    name: "Google",
    color: "bg-blue-50 text-blue-700 border-blue-200",
    icon: "🔍",
    buildUrl: (q) => `https://www.google.com/search?q=${encodeURIComponent(q)}`,
  },
  linkedin: {
    name: "LinkedIn",
    color: "bg-sky-50 text-sky-700 border-sky-200",
    icon: "💼",
    buildUrl: (q) => `https://www.linkedin.com/jobs/search/?keywords=${encodeURIComponent(q)}`,
  },
  indeed: {
    name: "Indeed",
    color: "bg-indigo-50 text-indigo-700 border-indigo-200",
    icon: "📋",
    buildUrl: (q) => `https://www.indeed.com/jobs?q=${encodeURIComponent(q)}`,
  },
  glassdoor: {
    name: "Glassdoor",
    color: "bg-green-50 text-green-700 border-green-200",
    icon: "🏢",
    buildUrl: (q) => `https://www.glassdoor.com/Job/jobs.htm?sc.keyword=${encodeURIComponent(q)}`,
  },
  wuzzuf: {
    name: "Wuzzuf",
    color: "bg-orange-50 text-orange-700 border-orange-200",
    icon: "🇪🇬",
    buildUrl: (q) => `https://wuzzuf.net/search/jobs/?q=${encodeURIComponent(q)}`,
  },
  bayt: {
    name: "Bayt",
    color: "bg-emerald-50 text-emerald-700 border-emerald-200",
    icon: "🌍",
    buildUrl: (q) => `https://www.bayt.com/en/jobs/?keyword=${encodeURIComponent(q)}`,
  },
};

export default function JobSearch() {
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestions | null>(null);

  const generateSuggestions = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("suggest-job-searches", {});
      if (error) throw error;
      if (data.error) throw new Error(data.error);
      setSuggestions(data);
      toast({ title: "CV analyzed successfully!" });
    } catch (err: any) {
      toast({ title: "فشل التحليل", description: err.message, variant: "destructive" });
    }
    setLoading(false);
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Job Search</h1>
        <p className="text-muted-foreground mt-1">AI يحلل الـ CV بتاعك ويولد لينكات بحث جاهزة على مواقع التوظيف</p>
      </div>

      {!suggestions && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              ابدأ البحث الذكي
            </CardTitle>
            <CardDescription>
              هنحلل الـ CV بتاعك ونطلعلك لينكات بحث جاهزة على أشهر مواقع التوظيف
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={generateSuggestions} disabled={loading} size="lg">
              {loading ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <Search className="mr-2 h-5 w-5" />}
              {loading ? "جاري التحليل..." : "حلل الـ CV وابحثلي"}
            </Button>
          </CardContent>
        </Card>
      )}

      {suggestions && (
        <div className="space-y-6">
          {/* Title & Skills */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Briefcase className="h-5 w-5 text-primary" />
                {suggestions.suggestedTitle}
              </CardTitle>
              <CardDescription>المسمى الوظيفي المقترح بناءً على خبراتك</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {suggestions.skills.map((skill, i) => (
                  <Badge key={i} variant="secondary">{skill}</Badge>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Search Links */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Globe className="h-5 w-5 text-primary" />
                لينكات البحث الجاهزة
              </CardTitle>
              <CardDescription>اضغط على أي لينك وهيفتحلك صفحة البحث مباشرة</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {suggestions.searchQueries.map((sq, i) => {
                const site = siteConfig[sq.site];
                if (!site) return null;
                return (
                  <a
                    key={i}
                    href={site.buildUrl(sq.query)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-between p-3 rounded-lg border hover:bg-accent transition-colors group"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-xl">{site.icon}</span>
                      <div>
                        <div className="font-medium text-sm">{sq.label}</div>
                        <div className="text-xs text-muted-foreground">{sq.query}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className={site.color}>{site.name}</Badge>
                      <ExternalLink className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
                    </div>
                  </a>
                );
              })}
            </CardContent>
          </Card>

          {/* Tips */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Lightbulb className="h-5 w-5 text-amber-500" />
                نصائح لتحسين البحث
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2">
                {suggestions.tips.map((tip, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm">
                    <span className="text-primary font-bold mt-0.5">•</span>
                    {tip}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          <Button variant="outline" onClick={() => setSuggestions(null)}>
            إعادة التحليل
          </Button>
        </div>
      )}
    </div>
  );
}
