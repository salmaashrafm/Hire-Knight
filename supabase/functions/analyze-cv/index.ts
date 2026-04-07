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
    const { cvText, jobDescription } = await req.json();
    if (!cvText || !jobDescription) {
      return new Response(JSON.stringify({ error: "cvText and jobDescription are required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

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

    const userContent = `CV:\n${cvText}\n\nJob Description:\n${jobDescription}`;

    // Try OpenAI first (user key or env), fallback to Lovable AI
    const OPENAI_KEY = userOpenaiKey || Deno.env.get("OPENAI_API_KEY");
    const LOVABLE_KEY = Deno.env.get("LOVABLE_API_KEY");

    let result;
    if (OPENAI_KEY) {
      result = await callAI(OPENAI_KEY, "https://api.openai.com/v1/chat/completions", "gpt-4o-mini", systemPrompt, userContent);
    } else if (LOVABLE_KEY) {
      result = await callAI(LOVABLE_KEY, "https://ai.gateway.lovable.dev/v1/chat/completions", "google/gemini-3-flash-preview", systemPrompt, userContent);
    } else {
      throw new Error("No AI provider configured");
    }

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
