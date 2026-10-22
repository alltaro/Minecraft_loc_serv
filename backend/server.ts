import { createHash, randomBytes, randomUUID } from "node:crypto";
import { mkdtemp, readFile, readdir, rm, stat, writeFile, rename } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const HOST = "127.0.0.1";
const PORT = Number(Bun.env.MINEPANEL_API_PORT ?? 3031);
const STATE_PATH = join(import.meta.dir, "..", ".minepanel-state.json");
const VERSIONS_PATH = join(import.meta.dir, "..", "versions");
const SESSION_COOKIE = "minepanel_session";
const SESSION_DAYS = 30;
const INVITATION_TTL = 15 * 60 * 1000;
const NAME_PATTERN = /^[A-Za-z0-9_.-]{1,64}$/;
const PLAYER_PATTERN = /^[A-Za-z0-9_]{3,16}$/;
const MOJANG_VERSION_MANIFEST = "https://piston-meta.mojang.com/mc/game/version_manifest_v2.json";

type User = { id: string; username: string; passwordHash: string };
type Invitation = { serverName: string; ownerId: string; expiresAt: number };
type State = {
  users: User[];
  sessions: Record<string, { userId: string; expiresAt: number }>;
  owners: Record<string, string>;
  collaborators: Record<string, string[]>;
  invitations: Record<string, Invitation>;
};
type DockerContainer = { name: string; image: string; state: string; ports: string };
type MinecraftVersion = { id: string; label: string; type: "release" | "snapshot" };

function looksLikeMinecraft(container: DockerContainer): boolean {
  return /minecraft/i.test(container.image) || /minecraft/i.test(container.name) || /->25565\/tcp/.test(container.ports);
}

const emptyState = (): State => ({ users: [], sessions: {}, owners: {}, collaborators: {}, invitations: {} });

async function loadState(): Promise<State> {
  try {
    const saved = JSON.parse(await readFile(STATE_PATH, "utf8")) as Partial<State>;
    return {
      users: Array.isArray(saved.users) ? saved.users : [],
      sessions: saved.sessions ?? {},
      owners: saved.owners ?? {},
      collaborators: saved.collaborators ?? {},
      invitations: saved.invitations ?? {},
    };
  } catch (error) {
    if ((error as { code?: string }).code !== "ENOENT") throw error;
    return emptyState();
  }
}

let state = await loadState();
let stateWrite = Promise.resolve();

function saveState(): Promise<void> {
  stateWrite = stateWrite.then(async () => {
    const temporary = `${STATE_PATH}.${process.pid}.tmp`;
    await writeFile(temporary, JSON.stringify(state, null, 2), { mode: 0o600 });
    await rename(temporary, STATE_PATH);
  });
  return stateWrite;
}

function log(message: string): void {
  console.info(`[MinePanel API ${new Date().toLocaleTimeString()}] ${message}`);
}

class HttpError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}

function json(data: unknown, status = 200, headers: HeadersInit = {}): Response {
  return Response.json(data, { status, headers });
}

function parseCookies(header: string | null): Record<string, string> {
  const cookies: Record<string, string> = {};
  for (const part of (header ?? "").split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0) continue;
    const key = part.slice(0, separator).trim();
    try { cookies[key] = decodeURIComponent(part.slice(separator + 1).trim()); } catch { /* Ignore malformed cookies. */ }
  }
  return cookies;
}

function publicUser(user: User) { return { id: user.id, username: user.username }; }

function requireUser(request: Request): User {
  const token = parseCookies(request.headers.get("cookie"))[SESSION_COOKIE];
  const session = token ? state.sessions[token] : undefined;
  if (!session || session.expiresAt <= Date.now()) {
    if (token && session) { delete state.sessions[token]; void saveState(); }
    throw new HttpError(401, "Connecte-toi pour continuer.");
  }
  const user = state.users.find((candidate) => candidate.id === session.userId);
  if (!user) throw new HttpError(401, "Session invalide. Reconnecte-toi.");
  return user;
}

async function requestJson(request: Request): Promise<Record<string, unknown>> {
  try {
    const value: unknown = await request.json();
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error();
    return value as Record<string, unknown>;
  } catch {
    throw new HttpError(400, "Corps JSON invalide.");
  }
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) throw new HttpError(400, `${label} est requis.`);
  return value.trim();
}

function validateServerName(value: unknown): string {
  const name = requiredString(value, "Le nom du serveur");
  if (!NAME_PATTERN.test(name)) throw new HttpError(400, "Le nom doit contenir au plus 64 caractères : lettres, chiffres, point, tiret ou souligné.");
  return name;
}

type VersionCatalog = { versions: MinecraftVersion[]; source: "mojang" | "local" };
let versionCatalogCache: { expiresAt: number; value: VersionCatalog } | null = null;

async function localMinecraftVersions(): Promise<MinecraftVersion[]> {
  let files;
  try { files = await readdir(VERSIONS_PATH, { withFileTypes: true }); }
  catch (error) {
    if ((error as { code?: string }).code === "ENOENT") return [];
    throw error;
  }
  const versions = await Promise.all(files.filter((file) => file.isFile() && /^\d+(?:\.\d+){1,2}\.json$/.test(file.name)).map(async (file) => {
    try {
      const record = JSON.parse(await readFile(join(VERSIONS_PATH, file.name), "utf8")) as { id?: unknown; label?: unknown };
      if (typeof record.id !== "string" || `${record.id}.json` !== file.name || !/^\d+(?:\.\d+){1,2}$/.test(record.id)) return null;
      return { id: record.id, label: typeof record.label === "string" ? record.label : `Minecraft ${record.id}`, type: "release" as const };
    } catch { return null; }
  }));
  return versions.filter((version): version is MinecraftVersion => version !== null)
    .sort((a, b) => b.id.localeCompare(a.id, undefined, { numeric: true }));
}

async function versionCatalog(): Promise<VersionCatalog> {
  if (versionCatalogCache && versionCatalogCache.expiresAt > Date.now()) return versionCatalogCache.value;
  const localVersions = await localMinecraftVersions();
  try {
    const response = await fetch(MOJANG_VERSION_MANIFEST, { signal: AbortSignal.timeout(10_000) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const manifest = await response.json() as {
      latest?: { release?: string };
      versions?: Array<{ id?: unknown; type?: unknown }>;
    };
    if (!Array.isArray(manifest.versions)) throw new Error("Manifest Minecraft invalide");
    const toVersion = (entry: { id?: unknown; type?: unknown }): MinecraftVersion | null => {
      if ((entry.type !== "release" && entry.type !== "snapshot") || typeof entry.id !== "string" || !/^[A-Za-z0-9._-]{1,40}$/.test(entry.id)) return null;
      const type = entry.type;
      const suffix = type === "snapshot" ? " (snapshot)" : entry.id === manifest.latest?.release ? " (dernière version)" : "";
      return { id: entry.id, label: `Minecraft Java ${entry.id}${suffix}`, type };
    };
    const officialEntries = manifest.versions.map(toVersion).filter((version): version is MinecraftVersion => version !== null);
    const officialReleaseVersions = officialEntries.filter((version) => version.type === "release");
    const officialSnapshotVersions = officialEntries.filter((version) => version.type === "snapshot");
    const officialIds = new Set(officialEntries.map((version) => version.id));
    const extraLocalVersions = localVersions.filter((version) => !officialIds.has(version.id));
    const value: VersionCatalog = {
      // Keep locally curated versions available if Mojang has not published
      // them yet, while using the official manifest for the full release list.
      versions: [
        ...[...extraLocalVersions, ...officialReleaseVersions].sort((a, b) => b.id.localeCompare(a.id, undefined, { numeric: true })),
        ...officialSnapshotVersions,
      ],
      source: "mojang",
    };
    versionCatalogCache = { expiresAt: Date.now() + 6 * 60 * 60 * 1000, value };
    log(`Catalogue Mojang chargé : ${officialReleaseVersions.length} versions stables et ${officialSnapshotVersions.length} snapshots Java.`);
    return value;
  } catch (error) {
    log(`Catalogue Mojang indisponible (${error instanceof Error ? error.message : String(error)}) ; utilisation des versions locales.`);
    const value: VersionCatalog = { versions: localVersions, source: "local" };
    versionCatalogCache = { expiresAt: Date.now() + 60 * 1000, value };
    return value;
  }
}

async function availableMinecraftVersions(): Promise<MinecraftVersion[]> {
  return (await versionCatalog()).versions;
}

async function docker(args: string[], options: { allowFailure?: boolean; progressLabel?: string } = {}) {
  const child = Bun.spawn(["docker", ...args], {
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  });
  if (options.progressLabel) log(options.progressLabel);
  const stdoutReader = child.stdout.getReader();
  let stdoutText = "";
  const stdoutPromise = (async () => {
    const decoder = new TextDecoder();
    let pending = "";
    let lastLine = "";
    while (true) {
      const { value, done } = await stdoutReader.read();
      if (done) break;
      const decoded = decoder.decode(value, { stream: true });
      stdoutText += decoded;
      pending += decoded;
      const lines = pending.split(/[\r\n]+/);
      pending = lines.pop() ?? "";
      for (const line of lines) {
        const clean = line.trim();
        if (options.progressLabel && clean && clean !== lastLine) {
          log(`${options.progressLabel} ${clean}`);
          lastLine = clean;
        }
      }
    }
    const finalChunk = decoder.decode();
    stdoutText += finalChunk;
    pending += finalChunk;
    if (options.progressLabel && pending.trim() && pending.trim() !== lastLine) log(`${options.progressLabel} ${pending.trim()}`);
    return stdoutText;
  })();
  const stderrReader = child.stderr.getReader();
  let stderrText = "";
  const stderrPromise = (async () => {
    const decoder = new TextDecoder();
    let pending = "";
    let lastLine = "";
    while (true) {
      const { value, done } = await stderrReader.read();
      if (done) break;
      const decoded = decoder.decode(value, { stream: true });
      stderrText += decoded;
      pending += decoded;
      const lines = pending.split(/[\r\n]+/);
      pending = lines.pop() ?? "";
      for (const line of lines) {
        const clean = line.trim();
        if (options.progressLabel && clean && clean !== lastLine) {
          log(`${options.progressLabel} ${clean}`);
          lastLine = clean;
        }
      }
    }
    const finalChunk = decoder.decode();
    stderrText += finalChunk;
    pending += finalChunk;
    if (pending.trim()) {
      if (options.progressLabel && pending.trim() !== lastLine) log(`${options.progressLabel} ${pending.trim()}`);
    }
  })();
  const [stdout, stderr, code] = await Promise.all([
    stdoutPromise,
    stderrPromise.then(() => stderrText),
    child.exited,
  ]);
  if (code !== 0 && !options.allowFailure) {
    const detail = stderr.trim() || stdout.trim() || `code ${code}`;
    throw new HttpError(500, `Commande Docker échouée : ${detail}`);
  }
  return { stdout: stdout.trimEnd(), stderr: stderr.trim(), code };
}

async function waitForMinecraftReady(name: string, timeoutMs = 10 * 60 * 1000, since?: string): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastProgressLine = "";
  log(`Installation et démarrage de Minecraft dans ${name}…`);
  while (Date.now() < deadline) {
    const [statusResult, logs] = await Promise.all([
      docker(["inspect", "--format", "{{.State.Status}}", name], { allowFailure: true }),
      docker(["logs", "--tail", "40", ...(since ? ["--since", since] : []), name], { allowFailure: true }),
    ]);
    const status = statusResult.stdout.trim().toLowerCase();
    const combinedLogs = `${logs.stdout}\n${logs.stderr}`;
    if (/Done \([^)]+\)! For help, type ["']?help["']?/i.test(combinedLogs)) {
      log(`Minecraft est prêt dans ${name}.`);
      return;
    }
    if (status === "restarting" || status === "exited" || status === "dead") {
      const details = combinedLogs.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).slice(-12).join("\n").slice(-1800);
      throw new HttpError(502, `Le serveur ${name} n’a pas terminé son démarrage (état Docker : ${status}).${details ? `\nDernières lignes du journal :\n${details}` : " Consulte le journal du conteneur Docker."}`);
    }
    const progressLine = combinedLogs.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).at(-1) ?? "";
    if (progressLine && progressLine !== lastProgressLine) {
      log(`[${name}] ${progressLine}`);
      lastProgressLine = progressLine;
    }
    await Bun.sleep(2000);
  }
  throw new HttpError(504, `Le démarrage de ${name} dépasse 10 minutes. Le conteneur reste disponible ; consulte ses journaux avant de réessayer.`);
}

async function createMinecraftServer(user: User, nameValue: unknown, versionValue: unknown, typeValue: unknown, modFiles: File[]) {
  const name = validateServerName(nameValue);
  const version = requiredString(versionValue, "La version de Minecraft");
  const serverType = typeof typeValue === "string" && typeValue.trim() ? typeValue.trim().toUpperCase() : "VANILLA";
  if (serverType !== "VANILLA" && serverType !== "NEOFORGE") throw new HttpError(400, "Type de serveur invalide.");
  const versions = await availableMinecraftVersions();
  const selectedVersion = versions.find((item) => item.id === version);
  if (!selectedVersion) throw new HttpError(400, "Cette version Minecraft n’est pas disponible dans le catalogue officiel.");
  if (modFiles.length && serverType !== "NEOFORGE") throw new HttpError(400, "Les mods nécessitent un serveur NeoForge.");
  if (serverType === "NEOFORGE" && selectedVersion.type === "snapshot") throw new HttpError(400, "NeoForge est proposé uniquement pour les versions stables de Minecraft.");
  if (modFiles.length > 30) throw new HttpError(413, "Tu peux sélectionner au maximum 30 mods à la création.");
  let totalBytes = 0;
  const names = new Set<string>();
  for (const file of modFiles) {
    if (!/^[A-Za-z0-9_. -]+\.jar$/i.test(file.name)) throw new HttpError(400, `Fichier de mod invalide : ${file.name}. Seuls les fichiers .jar sont acceptés à la création.`);
    if (file.size === 0 || file.size > 100 * 1024 * 1024) throw new HttpError(413, `${file.name} est vide ou dépasse 100 Mo.`);
    const normalizedName = file.name.toLowerCase();
    if (names.has(normalizedName)) throw new HttpError(400, `Le mod ${file.name} est sélectionné plusieurs fois.`);
    names.add(normalizedName);
    totalBytes += file.size;
  }
  if (totalBytes > 500 * 1024 * 1024) throw new HttpError(413, "La taille totale des mods dépasse 500 Mo.");

  const containers = await listDockerContainers();
  if (containers.some((container) => container.name === name)) throw new HttpError(409, `Un conteneur nommé ${name} existe déjà.`);
  const occupied = new Set(containers.flatMap((container) => [...container.ports.matchAll(/:(\d+)->25565\/tcp/g)].map((match) => Number(match[1]))));
  let port = 38000;
  while (occupied.has(port) && port < 65535) port++;
  if (occupied.has(port)) throw new HttpError(503, "Aucun port public disponible.");

  const image = "itzg/minecraft-server:latest";
  if ((await docker(["image", "inspect", image], { allowFailure: true })).code !== 0) {
    await docker(["pull", image], { progressLabel: "Téléchargement initial de l’image Minecraft :" });
  }
  const typeEnvironment = ["-e", `TYPE=${serverType}`, "-e", `VERSION=${version}`];
  const loaderEnvironment = serverType === "NEOFORGE" ? ["-e", "NEOFORGE_VERSION=latest"] : [];
  await docker([
    "create", "--name", name, "--restart", "unless-stopped",
    "-e", "EULA=TRUE", "-e", "ENABLE_RCON=TRUE", ...typeEnvironment, ...loaderEnvironment,
    "-p", `${port}:25565`, "-v", `${name}-data:/data`, image,
  ], { progressLabel: `Préparation du conteneur ${name} (${serverType}, Minecraft ${version}) :` });
  state.owners[name] = user.id;
  await saveState();
  log(`Conteneur ${name} préparé pour ${serverType} Minecraft ${version} par ${user.username}`);

  await docker([
    "run", "--rm", "--volumes-from", name,
    "-e", "EULA=TRUE", ...typeEnvironment, ...loaderEnvironment,
    "-e", "SETUP_ONLY=TRUE", image,
  ], { progressLabel: `Installation des fichiers ${serverType === "NEOFORGE" ? "NeoForge" : "Vanilla"} dans ${name} :` });

  if (modFiles.length) {
    await docker([
      "run", "--rm", "--volumes-from", name,
      "--entrypoint", "mkdir", image, "-p", "/data/mods",
    ]);
    const temp = await mkdtemp(join(tmpdir(), "minepanel-create-mods-"));
    try {
      for (const file of modFiles) {
        const filename = file.name;
        const sourcePath = join(temp, filename);
        await writeFile(sourcePath, new Uint8Array(await file.arrayBuffer()));
        await docker(["cp", sourcePath, `${name}:/data/mods/${filename}`], { progressLabel: `Copie du mod ${filename} :` });
      }
    } finally {
      await rm(temp, { recursive: true, force: true });
    }
  }

  const startedAt = new Date(Date.now() - 1000).toISOString();
  await docker(["start", name], { progressLabel: `Démarrage initial de ${name} :` });
  await waitForMinecraftReady(name, 10 * 60 * 1000, startedAt);
  log(`Serveur ${name} prêt sur le port ${port}.`);
  return port;
}

type ServerCreationJob = {
  userId: string;
  createdAt: number;
  status: "running" | "complete" | "error";
  port?: number;
  error?: string;
};
const serverCreationJobs = new Map<string, ServerCreationJob>();

function startServerCreationJob(user: User, name: unknown, version: unknown, serverType: unknown, mods: File[]): string {
  const id = randomBytes(18).toString("base64url");
  const job: ServerCreationJob = { userId: user.id, createdAt: Date.now(), status: "running" };
  serverCreationJobs.set(id, job);
  // Keep the upload request short-lived. NeoForge setup and the first server
  // start can take several minutes, which exceeds browser/proxy request limits.
  void createMinecraftServer(user, name, version, serverType, mods).then((port) => {
    job.status = "complete";
    job.port = port;
  }).catch((error) => {
    job.status = "error";
    job.error = error instanceof Error ? error.message : "Impossible de créer le serveur.";
    console.error(`[MinePanel API] Création du serveur échouée : ${job.error}`);
  });
  const now = Date.now();
  for (const [jobId, oldJob] of serverCreationJobs) {
    if (oldJob.status !== "running" && now - oldJob.createdAt > 30 * 60 * 1000) serverCreationJobs.delete(jobId);
  }
  return id;
}

async function listDockerContainers(): Promise<DockerContainer[]> {
  const { stdout } = await docker(["ps", "-a", "--format", "{{json .}}"]);
  return stdout.split("\n").filter(Boolean).flatMap((line) => {
    try {
      const item = JSON.parse(line) as { Names?: string; Image?: string; State?: string; Ports?: string };
      if (!item.Names) return [];
      return [{ name: item.Names.replace(/^\//, ""), image: item.Image ?? "", state: item.State ?? "", ports: item.Ports ?? "" }];
    } catch { return []; }
  });
}

async function portFor(name: string): Promise<number | null> {
  const result = await docker(["port", name, "25565/tcp"], { allowFailure: true });
  const match = result.stdout.match(/:(\d+)\s*$/m);
  return match ? Number(match[1]) : null;
}

async function minecraftVersion(container: DockerContainer): Promise<string | null> {
  const inspected = await docker(["inspect", "--format", "{{json .Config.Env}}", container.name], { allowFailure: true });
  if (inspected.code === 0) {
    try {
      const environment = JSON.parse(inspected.stdout) as string[];
      const configured = environment.find((item) => item.startsWith("VERSION="))?.slice("VERSION=".length);
      if (configured && configured.toUpperCase() !== "LATEST" && configured.toUpperCase() !== "SNAPSHOT") return configured;
    } catch { /* Fall back to the Minecraft startup log. */ }
  }

  const logs = await docker(["logs", "--tail", "300", container.name], { allowFailure: true });
  const match = `${logs.stdout}\n${logs.stderr}`.match(/Starting minecraft server version\s+([^\s]+)/i);
  return match?.[1] ?? null;
}

async function minecraftServerType(container: DockerContainer): Promise<string | null> {
  const inspected = await docker(["inspect", "--format", "{{json .Config.Env}}", container.name], { allowFailure: true });
  if (inspected.code === 0) {
    try {
      const environment = JSON.parse(inspected.stdout) as string[];
      const configured = environment.find((item) => item.startsWith("TYPE="))?.slice("TYPE=".length);
      if (configured) return configured.toUpperCase();
    } catch { /* Fall back to the known default for itzg images. */ }
  }
  return /itzg\/minecraft-server/i.test(container.image) ? "VANILLA" : null;
}

async function neoForgeVersion(container: DockerContainer): Promise<string | null> {
  const inspected = await docker(["inspect", "--format", "{{json .Config.Env}}", container.name], { allowFailure: true });
  if (inspected.code === 0) {
    try {
      const environment = JSON.parse(inspected.stdout) as string[];
      const configured = environment.find((item) => item.startsWith("NEOFORGE_VERSION="))?.slice("NEOFORGE_VERSION=".length);
      if (configured && !["LATEST", "BETA"].includes(configured.toUpperCase())) return configured;
    } catch { /* Fall back to the installer output. */ }
  }
  const logs = await docker(["logs", "--tail", "300", container.name], { allowFailure: true });
  const versions = [...`${logs.stdout}\n${logs.stderr}`.matchAll(/Running NeoForge ([^\s]+) installer/gi)];
  return versions.at(-1)?.[1] ?? null;
}

async function accessibleServers(user: User) {
  const all = await listDockerContainers();
  const servers: Array<{ name: string; running: boolean; state: string; port: number | null; version: string | null; serverType: string | null; loaderVersion: string | null; role: "owner" | "collaborator"; ownerUsername: string; collaborators?: string[] }> = [];
  for (const container of all) {
    const isMinecraft = looksLikeMinecraft(container);
    if (!isMinecraft && !state.owners[container.name]) continue;
    let ownerId = state.owners[container.name];
    if (!ownerId && user) {
      ownerId = user.id;
      state.owners[container.name] = ownerId;
      await saveState();
    }
    const collaborators = state.collaborators[container.name] ?? [];
    const isOwner = ownerId === user.id;
    if (!isOwner && !collaborators.includes(user.id)) continue;
    const owner = state.users.find((candidate) => candidate.id === ownerId);
    const [port, version, serverType] = await Promise.all([portFor(container.name), minecraftVersion(container), minecraftServerType(container)]);
    const loaderVersion = serverType === "NEOFORGE" ? await neoForgeVersion(container) : null;
    const containerState = container.state.toLowerCase();
    servers.push({
      name: container.name,
      running: containerState === "running",
      state: containerState,
      port,
      version,
      serverType,
      loaderVersion,
      role: isOwner ? "owner" : "collaborator",
      ownerUsername: owner?.username ?? "Compte local",
      ...(isOwner ? { collaborators: collaborators.map((id) => state.users.find((candidate) => candidate.id === id)?.username ?? "Compte supprimé") } : {}),
    });
  }
  return servers;
}

async function accessibleContainer(user: User, value: unknown) {
  const name = validateServerName(value);
  const containers = await listDockerContainers();
  const container = containers.find((item) => item.name === name);
  if (!container) throw new HttpError(404, `Le conteneur ${name} n’existe pas.`);
  if (!state.owners[name]) {
    if (!looksLikeMinecraft(container)) throw new HttpError(404, "Conteneur Minecraft introuvable.");
    state.owners[name] = user.id;
    await saveState();
  }
  const ownerId = state.owners[name];
  const isOwner = ownerId === user.id;
  if (!isOwner && !(state.collaborators[name] ?? []).includes(user.id)) throw new HttpError(403, "Tu n’as pas accès à ce serveur.");
  return { container, isOwner };
}

function dataPath(container: DockerContainer): string {
  return /itzg\/minecraft-server/i.test(container.image) ? "/data" : "/minecraft";
}

async function listMods(user: User, value: unknown) {
  const { container } = await accessibleContainer(user, value);
  const path = `${dataPath(container)}/mods`;
  const temp = await mkdtemp(join(tmpdir(), "minepanel-mod-list-"));
  try {
    const copied = await docker(["cp", `${container.name}:${path}`, temp], { allowFailure: true });
    if (copied.code !== 0) return [];
    const modsPath = join(temp, "mods");
    const entries = await readdir(modsPath, { withFileTypes: true });
    return await Promise.all(entries
      .filter((entry) => entry.isFile() && /\.(jar|zip)$/i.test(entry.name))
      .map(async (entry) => ({ name: entry.name, size: (await stat(join(modsPath, entry.name))).size })));
  } catch (error) {
    if ((error as { code?: string }).code === "ENOENT") return [];
    throw error;
  } finally { await rm(temp, { recursive: true, force: true }); }
}

async function installMod(user: User, form: FormData) {
  const { container } = await accessibleContainer(user, form.get("serverName"));
  const file = form.get("mod");
  if (!(file instanceof File)) throw new HttpError(400, "Sélectionne un fichier de mod.");
  const filename = file.name;
  if (!/^[A-Za-z0-9_. -]+\.(jar|zip)$/i.test(filename)) throw new HttpError(400, "Seuls les fichiers .jar et .zip sont acceptés.");
  if (file.size > 100 * 1024 * 1024) throw new HttpError(413, "Le fichier dépasse la limite de 100 Mo.");
  const path = `${dataPath(container)}/mods`;
  const temp = await mkdtemp(join(tmpdir(), "minepanel-mod-"));
  let wasActive = false;
  try {
    wasActive = await stopContainerForMaintenance(container);
    await writeFile(join(temp, filename), new Uint8Array(await file.arrayBuffer()));
    // The Minecraft container must stay stopped while mods are changed.
    // Start only a short-lived utility container sharing its data volume; its
    // entrypoint is mkdir, so Minecraft itself is never launched.
    await docker([
      "run", "--rm", "--volumes-from", container.name,
      "--entrypoint", "mkdir", container.image, "-p", path,
    ]);
    // docker cp can write to a stopped container once the shared mod directory
    // exists, without starting its Minecraft process.
    await docker(["cp", join(temp, filename), `${container.name}:${path}/${filename}`]);
  } finally {
    await rm(temp, { recursive: true, force: true });
    await resumeContainerAfterMaintenance(container, wasActive);
  }
}

async function stopContainerForMaintenance(container: DockerContainer): Promise<boolean> {
  const result = await docker(["inspect", "--format", "{{.State.Status}}", container.name]);
  const state = result.stdout.trim().toLowerCase();
  const wasActive = state === "running" || state === "restarting";
  if (wasActive) await docker(["stop", "-t", "120", container.name]);
  return wasActive;
}

async function resumeContainerAfterMaintenance(container: DockerContainer, wasActive: boolean): Promise<void> {
  if (!wasActive) return;
  const result = await docker(["inspect", "--format", "{{.State.Status}}", container.name], { allowFailure: true });
  const state = result.stdout.trim().toLowerCase();
  if (state !== "running" && state !== "restarting") {
    const startedAt = new Date(Date.now() - 1000).toISOString();
    await docker(["start", container.name]);
    await waitForMinecraftReady(container.name, 10 * 60 * 1000, startedAt);
  }
}

async function removeModFile(container: DockerContainer, modName: string): Promise<void> {
  const wasActive = await stopContainerForMaintenance(container);
  try {
    const path = `${dataPath(container)}/mods/${modName}`;
    await docker([
      "run", "--rm", "--volumes-from", container.name,
      "--entrypoint", "rm", container.image, "-f", "--", path,
    ]);
  } finally {
    await resumeContainerAfterMaintenance(container, wasActive);
  }
}

async function operatorsFor(user: User, value: unknown): Promise<string[]> {
  const { container } = await accessibleContainer(user, value);
  const filePath = `${dataPath(container)}/ops.json`;
  const result = await docker(["exec", container.name, "cat", filePath], { allowFailure: true });
  if (result.code !== 0 || !result.stdout) return [];
  try {
    const entries = JSON.parse(result.stdout) as Array<{ name?: string }>;
    return entries.map((entry) => entry.name).filter((name): name is string => typeof name === "string");
  } catch { throw new HttpError(500, "Le fichier ops.json du serveur est invalide."); }
}

async function deleteWorldMap(user: User, value: unknown): Promise<string> {
  const { container, isOwner } = await accessibleContainer(user, value);
  if (!isOwner) throw new HttpError(403, "Seul le propriétaire peut supprimer la map.");
  if (container.state.toLowerCase() === "running") {
    throw new HttpError(409, "Arrête le serveur avant de supprimer sa map.");
  }

  const root = dataPath(container);
  const temp = await mkdtemp(join(tmpdir(), "minepanel-properties-"));
  let properties = "";
  try {
    const copied = await docker(["cp", `${container.name}:${root}/server.properties`, join(temp, "server.properties")], { allowFailure: true });
    if (copied.code === 0) properties = await readFile(join(temp, "server.properties"), "utf8");
  } finally { await rm(temp, { recursive: true, force: true }); }

  const configuredLevel = await docker(["inspect", "--format", "{{json .Config.Env}}", container.name], { allowFailure: true });
  let levelName = "world";
  if (configuredLevel.code === 0) {
    try {
      const environment = JSON.parse(configuredLevel.stdout) as string[];
      const level = environment.find((item) => item.startsWith("LEVEL="))?.slice("LEVEL=".length);
      if (level && level.toUpperCase() !== "DEFAULT") levelName = level;
    } catch { /* Use server.properties or Minecraft's default world name. */ }
  }
  const propertyLevel = properties.split(/\r?\n/).find((line) => /^\s*level-name\s*=/.test(line) && !/^\s*#/.test(line));
  if (propertyLevel) levelName = propertyLevel.slice(propertyLevel.indexOf("=") + 1).trim() || "world";
  if (!levelName || levelName === "." || levelName === ".." || /[\\/\0\r\n]/.test(levelName)) {
    throw new HttpError(400, "Le nom du monde dans server.properties n’est pas valide.");
  }

  const mountsResult = await docker(["inspect", "--format", "{{json .Mounts}}", container.name]);
  let mounts: Array<{ Destination?: string }>;
  try { mounts = JSON.parse(mountsResult.stdout); }
  catch { throw new HttpError(500, "Impossible de lire les volumes Docker du serveur."); }
  const hasDataMount = mounts.some((mount) => {
    const destination = mount.Destination;
    return destination && (root === destination || root.startsWith(`${destination.replace(/\/$/, "")}/`));
  });
  if (!hasDataMount) {
    throw new HttpError(409, "Les données de ce conteneur ne sont pas stockées dans un volume Docker ; suppression sûre impossible.");
  }
  const folders = [levelName, `${levelName}_nether`, `${levelName}_the_end`];
  const paths = folders.map((folder) => `${root}/${folder}`);
  await docker(["run", "--rm", "--volumes-from", container.name, "--entrypoint", "rm", container.image, "-rf", "--", ...paths]);
  log(`Map ${levelName} supprimée du serveur ${container.name} par ${user.username}`);
  return levelName;
}

async function mutateOperator(user: User, serverValue: unknown, playerValue: unknown, add: boolean) {
  const player = requiredString(playerValue, "Le pseudo Minecraft");
  if (!PLAYER_PATTERN.test(player)) throw new HttpError(400, "Le pseudo doit contenir de 3 à 16 lettres, chiffres ou soulignés.");
  const { container } = await accessibleContainer(user, serverValue);
  if (!/itzg\/minecraft-server/i.test(container.image)) {
    const filePath = `${dataPath(container)}/ops.json`;
    const current = await docker(["exec", container.name, "cat", filePath], { allowFailure: true });
    let entries: Array<{ uuid?: string; name?: string; level?: number; bypassesPlayerLimit?: boolean }> = [];
    if (current.code === 0 && current.stdout) {
      try { entries = JSON.parse(current.stdout); }
      catch { throw new HttpError(500, "Le fichier ops.json du serveur est invalide."); }
      if (!Array.isArray(entries)) throw new HttpError(500, "Le fichier ops.json du serveur est invalide.");
    }
    const index = entries.findIndex((entry) => entry.name?.toLowerCase() === player.toLowerCase());
    if (add && index < 0) {
      const uuidBytes = createHash("md5").update(`OfflinePlayer:${player}`).digest();
      uuidBytes[6] = (uuidBytes[6] & 0x0f) | 0x30;
      uuidBytes[8] = (uuidBytes[8] & 0x3f) | 0x80;
      const hex = uuidBytes.toString("hex");
      entries.push({ uuid: `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`, name: player, level: 4, bypassesPlayerLimit: false });
    } else if (!add && index >= 0) entries.splice(index, 1);
    const temp = await mkdtemp(join(tmpdir(), "minepanel-ops-"));
    try {
      await writeFile(join(temp, "ops.json"), JSON.stringify(entries, null, 2));
      await docker(["cp", join(temp, "ops.json"), `${container.name}:${filePath}`]);
    } finally { await rm(temp, { recursive: true, force: true }); }
    return;
  }
  const operation = add ? "op" : "deop";
  const result = await docker([
    "exec", container.name, "rcon-cli",
    "--host", "127.0.0.1", "--port", "25575", operation, player,
  ], { allowFailure: true });
  if (result.code !== 0) {
    const state = await docker(["inspect", "--format", "{{.State.Running}}", container.name]);
    if (state.stdout.trim() === "true") throw new HttpError(500, `La commande RCON ${operation} a échoué : ${result.stderr || result.stdout}`);
    throw new HttpError(409, "Le serveur est arrêté ; démarre-le pour modifier les opérateurs.");
  }
}

async function createSession(user: User): Promise<Response> {
  const token = randomBytes(32).toString("hex");
  state.sessions[token] = { userId: user.id, expiresAt: Date.now() + SESSION_DAYS * 86400_000 };
  await saveState();
  return json({ user: publicUser(user) }, 200, {
    "set-cookie": `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}`,
  });
}

async function authRoute(request: Request, action: string): Promise<Response> {
  if (action === "me" && request.method === "GET") {
    try { return json({ user: publicUser(requireUser(request)) }); }
    catch (error) { if (error instanceof HttpError && error.status === 401) return json({ user: null }); throw error; }
  }
  if (action === "logout" && request.method === "POST") {
    const token = parseCookies(request.headers.get("cookie"))[SESSION_COOKIE];
    if (token) delete state.sessions[token];
    await saveState();
    return json({ user: null }, 200, { "set-cookie": `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0` });
  }
  if ((action === "register" || action === "login") && request.method === "POST") {
    const body = await requestJson(request);
    const username = requiredString(body.username, "Le nom d’utilisateur");
    const password = typeof body.password === "string" ? body.password : "";
    if (!/^[A-Za-z0-9_.-]{3,32}$/.test(username)) throw new HttpError(400, "Le nom d’utilisateur doit contenir de 3 à 32 lettres, chiffres, points, tirets ou soulignés.");
    if (password.length < 10 || password.length > 256) throw new HttpError(400, "Le mot de passe doit contenir au moins 10 caractères.");
    if (action === "register") {
      if (state.users.some((user) => user.username.toLowerCase() === username.toLowerCase())) throw new HttpError(409, "Ce nom d’utilisateur existe déjà.");
      const user: User = { id: randomUUID(), username, passwordHash: await Bun.password.hash(password, { algorithm: "argon2id" }) };
      state.users.push(user);
      await saveState();
      log(`Compte local créé : ${username}`);
      return createSession(user);
    }
    const user = state.users.find((candidate) => candidate.username.toLowerCase() === username.toLowerCase());
    if (!user || !(await Bun.password.verify(password, user.passwordHash))) throw new HttpError(401, "Nom d’utilisateur ou mot de passe incorrect.");
    return createSession(user);
  }
  throw new HttpError(404, "Route d’authentification inconnue.");
}

async function invitationRoute(request: Request, action: string): Promise<Response> {
  const user = requireUser(request);
  const body = await requestJson(request);
  if (action === "create" && request.method === "POST") {
    const name = validateServerName(body.serverName);
    const { isOwner } = await accessibleContainer(user, name);
    if (!isOwner) throw new HttpError(403, "Seul le propriétaire peut inviter des collaborateurs.");
    const token = randomBytes(24).toString("base64url");
    const expiresAt = Date.now() + INVITATION_TTL;
    state.invitations[token] = { serverName: name, ownerId: user.id, expiresAt };
    await saveState();
    return json({ token, expiresAt });
  }
  if (action === "accept" && request.method === "POST") {
    const token = requiredString(body.token, "Le code d’invitation");
    const invitation = state.invitations[token];
    if (!invitation || invitation.expiresAt <= Date.now()) {
      delete state.invitations[token];
      await saveState();
      throw new HttpError(410, "Ce lien d’invitation a expiré ou a déjà été utilisé.");
    }
    if (invitation.ownerId === user.id) throw new HttpError(400, "Tu es déjà propriétaire de ce serveur.");
    const containers = await listDockerContainers();
    if (!containers.some((container) => container.name === invitation.serverName)) throw new HttpError(404, "Ce serveur n’existe plus.");
    const members = state.collaborators[invitation.serverName] ?? [];
    const alreadyMember = members.includes(user.id);
    if (!alreadyMember) state.collaborators[invitation.serverName] = [...members, user.id];
    delete state.invitations[token];
    await saveState();
    return json({ serverName: invitation.serverName, alreadyMember });
  }
  throw new HttpError(404, "Route d’invitation inconnue.");
}

async function commandRoute(request: Request): Promise<Response> {
  const user = requireUser(request);
  const body = await requestJson(request);
  const command = requiredString(body.command, "La commande");
  const args = body.args && typeof body.args === "object" ? body.args as Record<string, unknown> : {};
  switch (command) {
    case "list_servers": return json({ data: await accessibleServers(user) });
    case "list_mods": return json({ data: await listMods(user, args.serverName) });
    case "list_operators": return json({ data: await operatorsFor(user, args.serverName) });
    case "get_server_logs": {
      const { container } = await accessibleContainer(user, args.serverName);
      const result = await docker(["logs", "--tail", "200", "--timestamps", container.name]);
      return json({ data: `${result.stdout}${result.stdout && result.stderr ? "\n" : ""}${result.stderr}`.trim() });
    }
    case "send_server_command": {
      const { container } = await accessibleContainer(user, args.serverName);
      const status = await docker(["inspect", "--format", "{{.State.Status}}", container.name]);
      if (status.stdout.trim().toLowerCase() !== "running") {
        throw new HttpError(409, "Démarre le serveur avant d’envoyer une commande.");
      }
      if (!/itzg\/minecraft-server/i.test(container.image)) {
        throw new HttpError(400, "L’envoi de commandes RCON n’est pas configuré pour ce type de conteneur.");
      }
      let serverCommand = requiredString(args.serverCommand, "La commande");
      if (serverCommand.startsWith("/")) serverCommand = serverCommand.slice(1).trim();
      if (!serverCommand || serverCommand.length > 512 || /[\u0000-\u001f\u007f]/.test(serverCommand)) {
        throw new HttpError(400, "La commande doit tenir sur une ligne et ne pas dépasser 512 caractères.");
      }
      const result = await docker([
        "exec", container.name, "rcon-cli",
        "--host", "127.0.0.1", "--port", "25575", serverCommand,
      ], { allowFailure: true });
      if (result.code !== 0) {
        throw new HttpError(502, `La commande RCON a échoué : ${result.stderr || result.stdout || `code ${result.code}`}`);
      }
      log(`Commande envoyée au serveur ${container.name} par ${user.username}`);
      return json({ data: result.stdout.trim() || "Commande envoyée." });
    }
    case "create_server": {
      const port = await createMinecraftServer(user, args.name, args.version, args.serverType, []);
      return json({ data: port });
    }
    case "start_server":
    case "stop_server": {
      const { container } = await accessibleContainer(user, args.name);
      const status = await docker(["inspect", "--format", "{{.State.Status}}", container.name]);
      const current = status.stdout.trim().toLowerCase();
      if (command === "start_server") {
        if (current !== "running" && current !== "restarting") {
          const startedAt = new Date(Date.now() - 1000).toISOString();
          await docker(["start", container.name]);
          await waitForMinecraftReady(container.name, 10 * 60 * 1000, startedAt);
        }
      } else if (current === "running" || current === "restarting") {
        await docker(["stop", "-t", "120", container.name]);
      }
      return json({ data: null });
    }
    case "delete_server": {
      const { container, isOwner } = await accessibleContainer(user, args.name);
      if (!isOwner) throw new HttpError(403, "Seul le propriétaire peut supprimer le conteneur.");
      await docker(["rm", "-f", container.name]);
      delete state.owners[container.name];
      delete state.collaborators[container.name];
      for (const [token, invite] of Object.entries(state.invitations)) if (invite.serverName === container.name) delete state.invitations[token];
      await saveState();
      return json({ data: null });
    }
    case "remove_collaborator": {
      const name = validateServerName(args.serverName);
      const { isOwner } = await accessibleContainer(user, name);
      if (!isOwner) throw new HttpError(403, "Seul le propriétaire peut retirer un collaborateur.");
      const username = requiredString(args.username, "Le nom du collaborateur");
      const collaborator = state.users.find((candidate) => candidate.username.toLowerCase() === username.toLowerCase());
      if (!collaborator || !(state.collaborators[name] ?? []).includes(collaborator.id)) {
        throw new HttpError(404, `${username} n’est pas collaborateur de ce serveur.`);
      }
      state.collaborators[name] = state.collaborators[name].filter((id) => id !== collaborator.id);
      await saveState();
      log(`${collaborator.username} retiré du serveur ${name} par ${user.username}`);
      return json({ data: null });
    }
    case "remove_mod": {
      const { container } = await accessibleContainer(user, args.serverName);
      const modName = requiredString(args.modName, "Le nom du mod");
      if (!/^[A-Za-z0-9_. -]+\.(jar|zip)$/i.test(modName)) throw new HttpError(400, "Nom de fichier invalide.");
      await removeModFile(container, modName);
      return json({ data: null });
    }
    case "delete_world_map": {
      const levelName = await deleteWorldMap(user, args.serverName);
      return json({ data: levelName });
    }
    case "add_operator":
    case "remove_operator":
      await mutateOperator(user, args.serverName, args.playerName, command === "add_operator");
      return json({ data: null });
    default: throw new HttpError(404, `Commande inconnue : ${command}`);
  }
}

async function handle(request: Request): Promise<Response> {
  const url = new URL(request.url);
  if (request.method === "GET" && url.pathname === "/api/versions") {
    return json(await versionCatalog());
  }
  if (request.method === "GET" && (url.pathname === "/api/health" || url.pathname === "/health")) {
    return json({ status: "ok", service: "minepanel-api", pid: process.pid });
  }
  if (url.pathname.startsWith("/api/auth/")) return authRoute(request, url.pathname.slice("/api/auth/".length));
  if (url.pathname.startsWith("/api/invitations/")) return invitationRoute(request, url.pathname.slice("/api/invitations/".length));
  const creationJob = url.pathname.match(/^\/api\/server\/jobs\/([A-Za-z0-9_-]+)$/);
  if (creationJob && request.method === "GET") {
    const user = requireUser(request);
    const job = serverCreationJobs.get(creationJob[1]);
    if (!job || job.userId !== user.id) throw new HttpError(404, "Tâche de création introuvable.");
    return json({ status: job.status, ...(job.port === undefined ? {} : { port: job.port }), ...(job.error ? { error: job.error } : {}) });
  }
  if (url.pathname === "/api/server" && request.method === "POST") {
    const user = requireUser(request);
    const form = await request.formData();
    const mods = form.getAll("mods").filter((entry): entry is File => entry instanceof File);
    const jobId = startServerCreationJob(user, form.get("name"), form.get("version"), form.get("serverType"), mods);
    return json({ jobId }, 202);
  }
  if (url.pathname === "/api/command" && request.method === "POST") return commandRoute(request);
  if (url.pathname === "/api/mod" && request.method === "POST") return installMod(requireUser(request), await request.formData()).then(() => json({ ok: true }));
  throw new HttpError(404, "Route introuvable.");
}

const server = Bun.serve({
  hostname: HOST,
  port: PORT,
  maxRequestBodySize: 550 * 1024 * 1024,
  async fetch(request) {
    try { return await handle(request); }
    catch (error) {
      const status = error instanceof HttpError ? error.status : 500;
      const message = error instanceof Error ? error.message : "Erreur interne.";
      if (status >= 500) console.error(`[MinePanel API] ${message}`);
      return json({ error: message }, status);
    }
  },
});

log(`Service prêt sur http://${server.hostname}:${server.port} (données : ${STATE_PATH})`);
