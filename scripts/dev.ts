function log(message: string): void {
  const time = new Date().toLocaleTimeString();
  console.info(`[MinePanel ${time}] ${message}`);
}

const apiPort = Number(Bun.env.MINEPANEL_API_PORT ?? 3031);
const webPort = Number(Bun.env.MINEPANEL_WEB_PORT ?? 1421);
log(`Démarrage du service Docker local (API, port ${apiPort})…`);
const api = Bun.spawn([process.execPath, "backend/server.ts"], { stdout: "inherit", stderr: "inherit" });
const children = [api];

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    for (const child of children) child.kill(signal);
  });
}

async function waitForApi(): Promise<void> {
  const deadline = Date.now() + 10_000;
  let nextProgressLog = Date.now() + 1_000;
  while (Date.now() < deadline) {
    if (api.exitCode !== null) {
      throw new Error(`L’API locale s’est arrêtée au démarrage (code ${api.exitCode}). Vérifie backend/server.ts et les erreurs affichées ci-dessus.`);
    }
    try {
      const response = await fetch(`http://127.0.0.1:${apiPort}/api/health`);
      if (response.ok) {
        const health = await response.json() as { service?: string; pid?: number };
        if (health.service !== "minepanel-api" || health.pid !== api.pid) {
          throw new Error(`Le port ${apiPort} répond, mais ce n’est pas l’API lancée par ce processus. Arrête l’ancien processus puis relance.`);
        }
        log(`API prête sur http://127.0.0.1:${apiPort}.`);
        return;
      }
      log(`L’API répond avec le statut ${response.status}, nouvelle tentative…`);
    } catch (error) {
      if (error instanceof Error && error.message.startsWith(`Le port ${apiPort} répond`)) throw error;
      // L’API n’a pas encore ouvert son port.
    }
    if (Date.now() >= nextProgressLog) {
      log("En attente de la réponse de l’API locale…");
      nextProgressLog = Date.now() + 1_000;
    }
    await Bun.sleep(100);
  }
  throw new Error(`L’API locale n’a pas répondu sur le port ${apiPort} en 10 secondes. Vérifie que backend/server.ts démarre bien le serveur HTTP.`);
}

async function waitForWeb(web: ReturnType<typeof Bun.spawn>): Promise<void> {
  const deadline = Date.now() + 60_000;
  let nextProgressLog = Date.now() + 3_000;
  while (Date.now() < deadline) {
    if (web.exitCode !== null) throw new Error(`Vite s’est arrêté au démarrage (code ${web.exitCode}).`);
    try {
      const response = await fetch(`http://127.0.0.1:${webPort}`, { signal: AbortSignal.timeout(1_000) });
      if (response.status < 500) return;
    } catch {
      // Vite n'écoute pas encore.
    }
    if (Date.now() >= nextProgressLog) {
      log(`En attente du démarrage de Vite sur le port ${webPort}…`);
      nextProgressLog = Date.now() + 3_000;
    }
    await Bun.sleep(200);
  }
  throw new Error(`Vite n’a pas commencé à répondre sur le port ${webPort} en 60 secondes.`);
}

try {
  await waitForApi();
  log(`Démarrage de SvelteKit (http://localhost:${webPort})…`);
  const web = Bun.spawn([process.execPath, "node_modules/vite/bin/vite.js", "dev", ...process.argv.slice(2)], {
    stdout: "inherit",
    stderr: "inherit",
  });
  children.push(web);
  log("Processus Vite lancé ; attente de sa réponse HTTP…");
  await waitForWeb(web);
  log(`Interface prête sur http://localhost:${webPort}. Garde ce terminal ouvert pour voir les logs.`);
  const stopped = await Promise.race(children.map(async (child) => ({ child, code: await child.exited })));
  log(`Un service s’est arrêté (code ${stopped.code}) ; arrêt des autres processus.`);
  for (const child of children) if (child !== stopped.child) child.kill("SIGTERM");
  process.exit(stopped.code === 0 ? 0 : 1);
} catch (error) {
  for (const child of children) child.kill("SIGTERM");
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
