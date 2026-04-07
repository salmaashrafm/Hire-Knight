import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const DEFAULT_PROMPT = `You are a professional job application email writer. Write a compelling, personalized application email. Use the candidate's CV details to personalize the email — mention specific experiences, skills, and achievements from their CV. Return JSON with:
- subject: email subject line
- body: full email body (plain text, professional tone)
Sign the email with the candidate's name. Highlight strengths and address gaps constructively. Keep it concise (200-300 words).`;

async function callAI(apiKey: string, apiUrl: string, model: string, systemPrompt: string, userContent: string, temperature = 0.7) {
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
      temperature,
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
    const { companyName, jobTitle, strengths, gaps, matchScore, candidateName, cvText } = await req.json();
    if (!companyName || !jobTitle) {
      return new Response(JSON.stringify({ error: "companyName and jobTitle are required" }), {
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
          supabase.from("user_prompts").select("prompt_text").eq("user_id", user.id).eq("prompt_key", "generate_email").single(),
          supabase.from("profiles").select("openai_api_key").eq("user_id", user.id).single(),
        ]);
        if (promptRes.data?.prompt_text) systemPrompt = promptRes.data.prompt_text;
        if (profileRes.data?.openai_api_key) userOpenaiKey = profileRes.data.openai_api_key;
      }
    }

    const finalSystemPrompt = candidateName
      ? `${systemPrompt}\n\nThe candidate's name is "${candidateName}".`
      : systemPrompt;

    const userContent = `Candidate: ${candidateName}\nCompany: ${companyName}\nJob Title: ${jobTitle}\nMatch Score: ${matchScore}%\nStrengths: ${JSON.stringify(strengths)}\nGaps: ${JSON.stringify(gaps)}\n\nCandidate CV:\n${cvText || "Not provided"}`;

    const OPENAI_KEY = userOpenaiKey || Deno.env.get("OPENAI_API_KEY");
    const LOVABLE_KEY = Deno.env.get("LOVABLE_API_KEY");

    let result;
    if (OPENAI_KEY) {
      result = await callAI(OPENAI_KEY, "https://api.openai.com/v1/chat/completions", "gpt-4o-mini", finalSystemPrompt, userContent);
    } else if (LOVABLE_KEY) {
      result = await callAI(LOVABLE_KEY, "https://ai.gateway.lovable.dev/v1/chat/completions", "google/gemini-3-flash-preview", finalSystemPrompt, userContent);
    } else {
      throw new Error("No AI provider configured");
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("generate-email error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
