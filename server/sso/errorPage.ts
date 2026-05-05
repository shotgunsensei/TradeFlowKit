function escape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function renderSsoErrorPage(opts: {
  title: string;
  message: string;
  code?: string;
}): string {
  const title = escape(opts.title);
  const message = escape(opts.message);
  const code = opts.code ? escape(opts.code) : "";

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>${title} — TradeFlowKit</title>
<meta name="robots" content="noindex" />
<style>
  :root { color-scheme: light dark; }
  body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #f8fafc; color: #0f172a; }
  @media (prefers-color-scheme: dark) { body { background: #0b1220; color: #e2e8f0; } .card { background: #111827 !important; border-color: #1f2937 !important; } .muted { color: #94a3b8 !important; } }
  main { min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 24px; }
  .card { max-width: 460px; width: 100%; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 32px; box-shadow: 0 1px 2px rgba(0,0,0,0.04); }
  h1 { margin: 0 0 12px; font-size: 22px; font-weight: 600; }
  p { margin: 0 0 20px; line-height: 1.55; }
  .muted { color: #64748b; font-size: 13px; margin-top: 24px; }
  a.btn { display: inline-block; background: #2563eb; color: #ffffff; padding: 10px 18px; border-radius: 8px; text-decoration: none; font-weight: 500; }
  a.btn:hover { background: #1d4ed8; }
</style>
</head>
<body>
<main>
  <div class="card" data-testid="sso-error-card">
    <h1 data-testid="text-sso-error-title">${title}</h1>
    <p data-testid="text-sso-error-message">${message}</p>
    <a class="btn" href="/auth" data-testid="link-back-to-login">Back to sign in</a>
    ${code ? `<p class="muted" data-testid="text-sso-error-code">Reference: ${code}</p>` : ""}
  </div>
</main>
</body>
</html>`;
}
