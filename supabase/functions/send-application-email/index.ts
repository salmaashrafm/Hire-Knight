import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { encode as base64Encode } from "https://deno.land/std@0.168.0/encoding/base64.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SMTP_TIMEOUT_MS = 10000;
const SEND_TIMEOUT_MS = 30000;

type SmtpConnection = Deno.Conn | Deno.TlsConn;

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  let timeoutId: number | undefined;

  return await new Promise<T>((resolve, reject) => {
    timeoutId = setTimeout(() => reject(new Error(`${label} timed out`)), timeoutMs);

    promise
      .then((value) => {
        if (timeoutId) clearTimeout(timeoutId);
        resolve(value);
      })
      .catch((error) => {
        if (timeoutId) clearTimeout(timeoutId);
        reject(error);
      });
  });
}

async function readSmtpResponse(conn: SmtpConnection, decoder: TextDecoder): Promise<string> {
  const buffer = new Uint8Array(2048);
  let response = "";

  while (true) {
    const bytesRead = await withTimeout(conn.read(buffer), SMTP_TIMEOUT_MS, "SMTP read");

    if (bytesRead === null) {
      throw new Error("SMTP connection closed unexpectedly");
    }

    response += decoder.decode(buffer.subarray(0, bytesRead));

    const lines = response.split("\r\n").filter(Boolean);
    const lastLine = lines[lines.length - 1];

    if (lastLine && /^\d{3} /.test(lastLine)) {
      return response.trim();
    }
  }
}

function escapeSmtpBody(text: string) {
  return text
    .replace(/\r?\n/g, "\r\n")
    .split("\r\n")
    .map((line) => (line.startsWith(".") ? `.${line}` : line))
    .join("\r\n");
}

function wrapBase64(base64: string) {
  return base64.match(/.{1,76}/g)?.join("\r\n") ?? base64;
}

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

  let conn: SmtpConnection | null = null;
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  const sendCommand = async (command: string, expectedCodes: string[]) => {
    if (!conn) throw new Error("SMTP connection not initialized");
    await withTimeout(conn.write(encoder.encode(`${command}\r\n`)), SMTP_TIMEOUT_MS, `SMTP write (${command})`);
    const response = await readSmtpResponse(conn, decoder);

    if (!expectedCodes.some((code) => response.startsWith(code))) {
      throw new Error(`SMTP command failed (${command}): ${response}`);
    }

    return response;
  };

  try {
    conn = await withTimeout(Deno.connect({ hostname: host, port }), SMTP_TIMEOUT_MS, "SMTP connect");

    const greeting = await readSmtpResponse(conn, decoder);
    if (!greeting.startsWith("220")) {
      throw new Error(`SMTP greeting failed: ${greeting}`);
    }

    await sendCommand("EHLO localhost", ["250"]);
    await sendCommand("STARTTLS", ["220"]);

    conn = await withTimeout(Deno.startTls(conn as Deno.Conn, { hostname: host }), SMTP_TIMEOUT_MS, "SMTP STARTTLS");

    await sendCommand("EHLO localhost", ["250"]);
    await sendCommand("AUTH LOGIN", ["334"]);
    await sendCommand(btoa(username), ["334"]);
    await sendCommand(btoa(password), ["235"]);
    await sendCommand(`MAIL FROM:<${from}>`, ["250"]);
    await sendCommand(`RCPT TO:<${to}>`, ["250", "251"]);
    await sendCommand("DATA", ["354"]);

    const boundary = `----=_Part_${crypto.randomUUID().replace(/-/g, "")}`;
    const escapedBody = escapeSmtpBody(body);
    const wrappedAttachment = attachment ? wrapBase64(attachment.content) : null;

    let message = "";
    message += `From: ${from}\r\n`;
    message += `To: ${to}\r\n`;
    message += `Subject: ${subject}\r\n`;
    message += `MIME-Version: 1.0\r\n`;

    if (attachment && wrappedAttachment) {
      message += `Content-Type: multipart/mixed; boundary="${boundary}"\r\n\r\n`;
      message += `--${boundary}\r\n`;
      message += `Content-Type: text/plain; charset=UTF-8\r\n`;
      message += `Content-Transfer-Encoding: 8bit\r\n\r\n`;
      message += `${escapedBody}\r\n\r\n`;
      message += `--${boundary}\r\n`;
      message += `Content-Type: application/pdf; name="${attachment.filename}"\r\n`;
      message += `Content-Disposition: attachment; filename="${attachment.filename}"\r\n`;
      message += `Content-Transfer-Encoding: base64\r\n\r\n`;
      message += `${wrappedAttachment}\r\n`;
      message += `--${boundary}--\r\n`;
    } else {
      message += `Content-Type: text/plain; charset=UTF-8\r\n`;
      message += `Content-Transfer-Encoding: 8bit\r\n\r\n`;
      message += `${escapedBody}\r\n`;
    }

    if (!conn) throw new Error("SMTP connection missing before DATA payload");
    await withTimeout(conn.write(encoder.encode(`${message}\r\n.\r\n`)), SMTP_TIMEOUT_MS, "SMTP write (message)");

    const dataResponse = await readSmtpResponse(conn, decoder);
    if (!dataResponse.startsWith("250")) {
      throw new Error(`SMTP send failed: ${dataResponse}`);
    }

    await sendCommand("QUIT", ["221"]);
  } finally {
    try {
      conn?.close();
    } catch {
      // ignore close errors
    }
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { applicationId, recipientEmail, subject, body } = await req.json();
    if (!applicationId || !recipientEmail || !subject || !body) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("smtp_host, smtp_port, smtp_user, smtp_password_encrypted, cv_file_path")
      .eq("user_id", user.id)
      .single();

    if (!profile?.smtp_host || !profile?.smtp_user || !profile?.smtp_password_encrypted) {
      return new Response(JSON.stringify({ error: "SMTP not configured. Please update your settings." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let attachment: { filename: string; content: string } | null = null;
    if (profile.cv_file_path) {
      const { data: fileData, error: downloadError } = await supabaseAdmin.storage
        .from("cv-files")
        .download(profile.cv_file_path);

      if (!downloadError && fileData) {
        const arrayBuffer = await fileData.arrayBuffer();
        const fileName = profile.cv_file_path.split("/").pop() || "cv.pdf";
        attachment = {
          filename: fileName,
          content: base64Encode(new Uint8Array(arrayBuffer)),
        };
      }
    }

    console.log(`Preparing application email. attachmentIncluded=${Boolean(attachment)} filename=${attachment?.filename ?? "none"}`);

    let emailStatus = "sent";
    let errorMessage: string | null = null;

    try {
      await withTimeout(
        sendSmtpEmail({
          host: profile.smtp_host,
          port: profile.smtp_port || 587,
          username: profile.smtp_user,
          password: profile.smtp_password_encrypted,
          from: profile.smtp_user,
          to: recipientEmail,
          subject,
          body,
          attachment,
        }),
        SEND_TIMEOUT_MS,
        "SMTP send",
      );
    } catch (smtpError) {
      emailStatus = "failed";
      errorMessage = smtpError instanceof Error ? smtpError.message : "SMTP error";
      console.error("SMTP error:", smtpError);
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

    return new Response(JSON.stringify({
      status: emailStatus,
      error: errorMessage,
      attachmentIncluded: Boolean(attachment),
      attachmentFilename: attachment?.filename ?? null,
    }), {
      status: emailStatus === "sent" ? 200 : 502,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("send-email error:", error);

    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : "Unknown error",
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});