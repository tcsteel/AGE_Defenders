import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
const updateService = createRequire(import.meta.url)(process.env.CASTLE_DESKTOP === "1" ? "../scripts/desktop-updates.cjs" : "../scripts/update-core.cjs").createService();

function send(res: ServerResponse, status: number, body: string, contentType = "text/plain; charset=utf-8"): void {
  res.writeHead(status, { "content-type": contentType });
  res.end(body);
}

function router(req: IncomingMessage, res: ServerResponse): void {
  const url = new URL(req.url ?? "/", "http://localhost");
  if (url.pathname.startsWith("/api/update/")) {
    void updateService.handle(req, res);
    return;
  }

  if (req.method === "GET" && /^\/(renderer\.js|shell\.js|updates\.js|ui\.css)$/.test(url.pathname)) {
    void readFile(new URL(`../public${url.pathname}`, import.meta.url), "utf8")
      .then(body => send(res, 200, body, url.pathname.endsWith(".css") ? "text/css; charset=utf-8" : "text/javascript; charset=utf-8"))
      .catch(() => send(res, 404, "Not found"));
    return;
  }
  if (req.method === "GET" && /^\/assets\/audio\/(music|ui|arrow|impact|research|victory)\.wav$/.test(url.pathname)) {
    void readFile(new URL(`../public${url.pathname}`, import.meta.url))
      .then(body => { res.writeHead(200, { "content-type": "audio/wav", "cache-control": "private, max-age=3600" }); res.end(body); })
      .catch(() => send(res, 404, "Audio not imported"));
    return;
  }

  // Only serve known imported asset names; never expose arbitrary local files.
  if (req.method === "GET" && /^\/assets\/aoe\/(castle|tower|crossbowman|pikeman|knight|mill|lumber|mining|britons|farm|dryground|drygrass|gold|stone|acacia|oak|palisade|wallstone|wallfortified|farmer|lumberjack|goldminer|stoneminer|spearman|arbalester|halberdier|cavalier|icon-(?:food|wood|gold|stone)|(?:militia|scout|archer|manatarms|longsword|crossbowman|pikeman|knight|spearman|arbalester|halberdier|cavalier|skirmisher|eliteskirmisher)(?:walk|attack))\.png$/.test(url.pathname)) {
    void readFile(new URL(`../public${url.pathname}`, import.meta.url))
      .then(body => { res.writeHead(200, { "content-type": "image/png" }); res.end(body); })
      .catch(() => send(res, 404, "Asset not imported"));
    return;
  }

  if (req.method === "GET" && url.pathname === "/") {
    void readFile(new URL("../public/index.html", import.meta.url), "utf8")
      .then(body => send(res, 200, body, "text/html; charset=utf-8"))
      .catch(() => send(res, 500, "Could not load game"));
    return;
  }

  if (req.method === "GET" && url.pathname === "/health") {
    send(res, 200, JSON.stringify({ ok: true }), "application/json; charset=utf-8");
    return;
  }

  send(res, 404, "Not found\n");
}

export function startServer(port = Number(process.env.PORT ?? 3000), host = "127.0.0.1") {
  const server = createServer(router);
  server.listen(port, host, () => {
    console.log(`Listening on http://${host}:${(server.address() as { port: number }).port}`);
  });
  return server;
}
