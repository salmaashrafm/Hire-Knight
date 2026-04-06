import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { encode as base64Encode } from "https://deno.land/std@0.168.0/encoding/base64.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/** Minimal SMTP client using Deno.connectTls / STARTTLS */
async function sendSmtpEmail(options: {
  host: string;
  port: number;
  username: string;
  password: string;
  from: string;
  to: string;
  subject: string;
  body: string;
  attachment?: { filename: string; content: string } | null;
}) {
  const { host, port, username, password, from, to, subject, body, attachment } = options;

  // Connect plain first then upgrade with STARTTLS
  let conn = await Deno.connect({ hostname: host, port });

  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  async function readLine(): Promise<string> {
    const buf = new Uint8Array(4096);
    let result = "";
    while (true) {
      const n = await conn.read(buf);
      if (n === null) break;
      result += decoder.decode(buf.subarray(0, n));
      if (result.includes("\r\n") && !result.match(/^\d{3}-/m)) break;
    }
    return result.trim();
  }

  async function send(cmd: string): Promise<string> {
    await conn.write(encoder.encode(cmd + "\r\n"));
    return await readLine();
  }

  // Greeting
  await readLine();
  await send(`EHLO localhost`);

  // STARTTLS
  await send("STARTTLS");
  conn = await Deno.startTls(conn, { hostname: host });

  // Re-EHLO after TLS
  await send("EHLO localhost");

  // AUTH LOGIN
  await send("AUTH LOGIN");
  await send(btoa(username));
  const authResult = await send(btoa(password));
  if (!authResult.startsWith("235")) {
    throw new Error("SMTP authentication failed: " + authResult);
  }

  await send(`MAIL FROM:<${from}>`);
  await send(`RCPT TO:<${to}>`);
  await send("DATA");

  // Build email content
  const boundary = "----=_Part_" + crypto.randomUUID().replace(/-/g, "");
  let message = "";
  message += `From: ${from}\r\n`;
  message += `To: ${to}\r\n`;
  message += `Subject: ${subject}\r\n`;
  message += `MIME-Version: 1.0\r\n`;

  if (attachment) {
    message += `Content-Type: multipart/mixed; boundary="${boundary}"\r\n\r\n`;
    message += `--${boundary}\r\n`;
    message += `Content-Type: text/plain; charset=UTF-8\r\n\r\n`;
    message += body + "\r\n\r\n";
    message += `--${boundary}\r\n`;
    message += `Content-Type: application/pdf; name="${attachment.filename}"\r\n`;
    message += `Content-Disposition: attachment; filename="${attachment.filename}"\r\n`;
    message += `Content-Transfer-Encoding: base64\r\n\r\n`;
    message += attachment.content + "\r\n";
    message += `--${boundary}--\r\n`;
  } else {
    message += `Content-Type: text/plain; charset=UTF-8\r\n\r\n`;
    message += body + "\r\n";
  }

  const dataResult = await send(message + "\r\n.");
  if (!dataResult.startsWith("250")) {
    throw new Error("SMTP send failed: " + dataResult);
  }

  await send("QUIT");
  try { conn.close(); } catch { /* ignore */ }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { applicationId, recipientEmail, subject, body } = await req.json();
    if (!applicationId || !recipientEmail || !subject || !body) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("smtp_host, smtp_port, smtp_user, smtp_password_encrypted, cv_file_path, full_name")
      .eq("user_id", user.id)
      .single();

    if (!profile?.smtp_host || !profile?.smtp_user || !profile?.smtp_password_encrypted) {
      return new Response(JSON.stringify({ error: "SMTP not configured. Please update your settings." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Download CV if available
    let attachment: { filename: string; content: string } | null = null;
    if (profile.cv_file_path) {
      const { data: fileData, error: dlError } = await supabaseAdmin.storage
        .from("cv-files")
        .download(profile.cv_file_path);

      if (!dlError && fileData) {
        const arrayBuffer = await fileData.arrayBuffer();
        const base64 = base64Encode(new Uint8Array(arrayBuffer));
        const parts = profile.cv_file_path.split("/");
        const fileName = parts[parts.length - 1] || "cv.pdf";
        attachment = { filename: fileName, content: base64 };
      }
    }

    let emailStatus = "sent";
    let errorMessage = null;

    try {
      await sendSmtpEmail({
        host: profile.smtp_host,
        port: profile.smtp_port || 587,
        username: profile.smtp_user,
        password: profile.smtp_password_encrypted,
        from: profile.smtp_user,
        to: recipientEmail,
        subject,
        body,
        attachment,
      });
    } catch (smtpErr: any) {
      emailStatus = "failed";
      errorMessage = smtpErr.message || "SMTP error";
      console.error("SMTP error:", smtpErr);
    }

    await supabase.from("email_logs").insert({
      user_id: user.id,
      application_id: applicationId,
      recipient_email: recipientEmail,
      subject,
      body,
      status: emailStatus,
      error_message: errorMessage,
    });

    if (emailStatus === "sent") {
      await supabase.from("applications").update({ status: "sent" }).eq("id", applicationId);
    }

    return new Response(JSON.stringify({ status: emailStatus, error: errorMessage }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("send-email error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
