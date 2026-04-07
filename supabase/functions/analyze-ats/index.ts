import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ATS_PROMPT = `You are an ATS (Applicant Tracking System) expert. Analyze the given CV/resume text for ATS compatibility and return a JSON object with:

- atsScore: integer 0-100 (how well this CV would pass ATS screening)
- issues: array of objects, each with:
  - category: string (one of: "formatting", "keywords", "structure", "contact_info", "length", "skills", "experience", "education")
  - severity: string (one of: "critical", "warning", "suggestion")
  - issue: string (brief description of the problem, 5-15 words)
  - fix: string (specific actionable fix, 10-25 words)
- missingKeywords: array of strings (important keywords commonly expected but missing)
- summary: string (2-3 sentence overall assessment)

Check for:
1. Missing or incomplete contact information
2. Lack of quantifiable achievements
3. Missing important sections (summary, skills, experience, education)
4. Poor keyword optimization
5. Formatting issues that ATS can't parse (tables, images, headers/footers references)
6. Too short or too long
7. Missing action verbs
8. Gaps in employment without explanation
9. Inconsistent date formats
10. Missing industry-specific keywords

Be thorough but practical. Each issue should have a clear, actionable fix.`;

async function callAI(apiKey: string, apiUrl: string, model: string, systemPrompt: string, userContent: string) {
  const response = await fetch(apiUrl, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userContent },
      ],
      response_format: { type: "json_object" },
      temperature: 0.3,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    console.error("AI error:", err);
    throw new Error(`AI call failed (${response.status})`);
  }

  const data = await response.json();
  return JSON.parse(data.choices[0].message.content);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    const { cvText } = await req.json();
    
    if (!cvText) {
      return new Response(JSON.stringify({ error: "cvText is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let userOpenaiKey: string | null = null;
    if (authHeader) {
      const supabase = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_ANON_KEY")!,
        { global: { headers: { Authorization: authHeader } } }
      );
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data } = await supabase.from("profiles").select("openai_api_key").eq("user_id", user.id).single();
        if (data?.openai_api_key) userOpenaiKey = data.openai_api_key;
      }
    }

    const userContent = `CV/Resume:\n${cvText}`;

    const OPENAI_KEY = userOpenaiKey || Deno.env.get("OPENAI_API_KEY");
    const LOVABLE_KEY = Deno.env.get("LOVABLE_API_KEY");

    let result;
    if (OPENAI_KEY) {
      result = await callAI(OPENAI_KEY, "https://api.openai.com/v1/chat/completions", "gpt-4o-mini", ATS_PROMPT, userContent);
    } else if (LOVABLE_KEY) {
      result = await callAI(LOVABLE_KEY, "https://ai.gateway.lovable.dev/v1/chat/completions", "google/gemini-3-flash-preview", ATS_PROMPT, userContent);
    } else {
      throw new Error("No AI provider configured");
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("analyze-ats error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
