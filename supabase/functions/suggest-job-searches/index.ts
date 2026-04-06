import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Authorization required" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Not authenticated");

    // Get CV from profile
    const { data: profile } = await supabase
      .from("profiles")
      .select("cv_text, full_name")
      .eq("user_id", user.id)
      .single();

    if (!profile?.cv_text) {
      return new Response(JSON.stringify({ error: "No CV found. Please add your CV in Settings first." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("AI not configured");

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          {
            role: "system",
            content: `You are a career advisor. Analyze the CV and generate job search suggestions. Return JSON with:
- suggestedTitle: string (the best job title for this person)
- skills: array of top 5 key skills extracted from CV  
- searchQueries: array of 6 objects, each with:
  - query: string (the search query text optimized for job searching)
  - label: string (short Arabic label for display, e.g. "مطور واجهات أمامية")
  - site: string (one of: "google", "linkedin", "indeed", "glassdoor", "wuzzuf", "bayt")
- tips: array of 3 short Arabic tips for improving job search results

Make queries specific and effective. For google queries, add "jobs" or "hiring" keywords. For site-specific ones, use the format that works best on each platform. Focus on the person's actual experience level and skills.`
          },
          { role: "user", content: `CV:\n${profile.cv_text}` },
        ],
        tools: [{
          type: "function",
          function: {
            name: "job_search_suggestions",
            description: "Return job search suggestions based on CV analysis",
            parameters: {
              type: "object",
              properties: {
                suggestedTitle: { type: "string" },
                skills: { type: "array", items: { type: "string" } },
                searchQueries: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      query: { type: "string" },
                      label: { type: "string" },
                      site: { type: "string", enum: ["google", "linkedin", "indeed", "glassdoor", "wuzzuf", "bayt"] },
                    },
                    required: ["query", "label", "site"],
                  },
                },
                tips: { type: "array", items: { type: "string" } },
              },
              required: ["suggestedTitle", "skills", "searchQueries", "tips"],
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "job_search_suggestions" } },
      }),
    });

    if (!response.ok) {
      const status = response.status;
      if (status === 429) {
        return new Response(JSON.stringify({ error: "Too many requests, please try again later." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error("AI analysis failed");
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) throw new Error("No suggestions generated");

    const result = JSON.parse(toolCall.function.arguments);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("suggest-job-searches error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
