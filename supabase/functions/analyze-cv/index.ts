import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const DEFAULT_PROMPT = `You are a CV/job matching expert. Analyze the CV against the job description and return a JSON object with:
- candidateName: string (extract the candidate's full name from the CV)
- companyName: string (extract the company name from the job description)
- jobTitle: string (extract the job title from the job description)
- matchScore: integer 0-100
- strengths: array of strings (key matching qualifications)
- gaps: array of strings (missing or weak areas)
Be concise. Each strength/gap should be 3-8 words. If you can't find a name/company/title, use an empty string.`;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    const { cvText, jobDescription } = await req.json();
    if (!cvText || !jobDescription) {
      return new Response(JSON.stringify({ error: "cvText and jobDescription are required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Load user's custom prompt and API key if authenticated
    let systemPrompt = DEFAULT_PROMPT;
    let userOpenaiKey: string | null = null;
    if (authHeader) {
      const supabase = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_ANON_KEY")!,
        { global: { headers: { Authorization: authHeader } } }
      );
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const [promptRes, profileRes] = await Promise.all([
          supabase.from("user_prompts").select("prompt_text").eq("user_id", user.id).eq("prompt_key", "analyze_cv").single(),
          supabase.from("profiles").select("openai_api_key").eq("user_id", user.id).single(),
        ]);
        if (promptRes.data?.prompt_text) systemPrompt = promptRes.data.prompt_text;
        if (profileRes.data?.openai_api_key) userOpenaiKey = profileRes.data.openai_api_key;
      }
    }

    const OPENAI_API_KEY = userOpenaiKey || Deno.env.get("OPENAI_API_KEY");
    if (!OPENAI_API_KEY) throw new Error("OPENAI_API_KEY not configured");

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `CV:\n${cvText}\n\nJob Description:\n${jobDescription}` },
        ],
        response_format: { type: "json_object" },
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error("OpenAI error:", err);
      return new Response(JSON.stringify({ error: "AI analysis failed" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    const result = JSON.parse(data.choices[0].message.content);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("analyze-cv error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
