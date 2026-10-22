import { invoke, isTauri } from "@tauri-apps/api/core";
import type { Mod, Server } from "$lib/types";

function localApiUrl(path: string): string {
  // En mode navigateur, passe par le proxy Vite pour garder les appels et les
  // cookies de session sur la même origine. Tauri utilise directement ses
  // commandes natives via callTauri.
  return path;
}

function callTauri<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  if (!isTauri()) {
    return fetch(localApiUrl("/api/command"), {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ command, args: args ?? {} }),
    }).then(async (response) => {
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Le service Docker local a renvoyé une erreur.");
      return result.data as T;
    });
  }
  return invoke<T>(command, args);
}

export function listServers(): Promise<Server[]> {
  return callTauri<Server[]>("list_servers");
}

export function listMods(serverName: string): Promise<Mod[]> {
  return callTauri<Mod[]>("list_mods", { serverName });
}

export async function installMod(serverName: string, source: string | File): Promise<void> {
  if (isTauri()) {
    if (typeof source !== "string") throw new Error("Chemin de fichier invalide pour Tauri.");
    return callTauri("install_mod", { serverName, sourcePath: source });
  }
  if (!(source instanceof File)) throw new Error("Sélectionnez un fichier de mod.");
  const form = new FormData();
  form.set("serverName", serverName);
  form.set("mod", source);
  const response = await fetch(localApiUrl("/api/mod"), { method: "POST", credentials: "include", body: form });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? "Impossible d’ajouter le mod.");
}

export function removeMod(serverName: string, modName: string): Promise<void> {
  return callTauri("remove_mod", { serverName, modName });
}

export function deleteWorldMap(serverName: string): Promise<string> {
  return callTauri<string>("delete_world_map", { serverName });
}

export type MinecraftVersion = { id: string; label: string };

// Bundle the catalog with the UI so it is available both through Vite and in
// desktop builds, where the local HTTP API proxy is not present.
const versionCatalog = import.meta.glob("../../versions/*.json", {
  eager: true,
  import: "default",
}) as Record<string, { id?: unknown; label?: unknown }>;

export async function listMinecraftVersions(): Promise<MinecraftVersion[]> {
  return Object.values(versionCatalog)
    .filter((version): version is { id: string; label: string } =>
      typeof version.id === "string" && typeof version.label === "string")
    .sort((a, b) => b.id.localeCompare(a.id, undefined, { numeric: true }));
}

export function createServer(name: string, version: string, serverType = "VANILLA"): Promise<number> {
  return callTauri<number>("create_server", { name, version, serverType });
}

export function setServerRunning(name: string, running: boolean): Promise<void> {
  return callTauri(running ? "start_server" : "stop_server", { name });
}

export function deleteServer(name: string): Promise<void> {
  return callTauri("delete_server", { name });
}

export function listOperators(serverName: string): Promise<string[]> {
  return callTauri<string[]>("list_operators", { serverName });
}

export function addOperator(serverName: string, playerName: string): Promise<void> {
  return callTauri("add_operator", { serverName, playerName });
}

export function removeOperator(serverName: string, playerName: string): Promise<void> {
  return callTauri("remove_operator", { serverName, playerName });
}

export type LocalUser = { id: string; username: string };

async function authRequest(path: string, payload?: Record<string, string>): Promise<{ user: LocalUser | null }> {
  const response = await fetch(localApiUrl(`/api/auth/${path}`), {
    method: payload ? "POST" : "GET",
    credentials: "include",
    headers: payload ? { "content-type": "application/json" } : undefined,
    body: payload ? JSON.stringify(payload) : undefined,
  });
  const body = await response.text();
  let result: { user?: LocalUser | null; error?: string };
  try {
    result = body ? JSON.parse(body) as typeof result : {};
  } catch {
    throw new Error(`Réponse invalide du service local (HTTP ${response.status}). Redémarre l’application avec « bun run dev ».`);
  }
  if (!body) {
    throw new Error(`Le service local a renvoyé une réponse vide (HTTP ${response.status}). Redémarre l’application avec « bun run dev ».`);
  }
  if (!response.ok) throw new Error(result.error ?? "Erreur d’authentification.");
  return result as { user: LocalUser | null };
}

export async function getCurrentUser(): Promise<LocalUser | null> {
  return (await authRequest("me")).user;
}

export async function authenticate(path: "login" | "register", username: string, password: string): Promise<LocalUser> {
  const result = await authRequest(path, { username, password });
  if (!result.user) throw new Error("La session utilisateur n’a pas pu être créée.");
  return result.user;
}

export async function logout(): Promise<void> {
  await authRequest("logout", {});
}

async function invitationRequest<T>(path: "create" | "accept", body: Record<string, string>): Promise<T> {
  const response = await fetch(localApiUrl(`/api/invitations/${path}`), {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? "Impossible de traiter l’invitation.");
  return result as T;
}

export function createServerInvitation(serverName: string): Promise<{ token: string; expiresAt: number }> {
  return invitationRequest("create", { serverName });
}

export function acceptServerInvitation(token: string): Promise<{ serverName: string; alreadyMember: boolean }> {
  return invitationRequest("accept", { token });
}

export function removeCollaborator(serverName: string, username: string): Promise<void> {
  return callTauri("remove_collaborator", { serverName, username });
}
