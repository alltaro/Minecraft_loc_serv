<script lang="ts">
  import { open } from "@tauri-apps/plugin-dialog";
  import { isTauri } from "@tauri-apps/api/core";
  import { acceptServerInvitation, addOperator, authenticate, createServerWithMods, createServerInvitation, deleteServer, deleteWorldMap, executeServerCommand, getCurrentUser, getServerLogs, installMod, listMinecraftVersions, listMods, listOperators, listServers, logout, removeCollaborator, removeMod, removeOperator, setServerRunning } from "$lib/tauri";
  import type { MinecraftVersion } from "$lib/tauri";
  import type { Mod, Server } from "$lib/types";

  let servers: Server[] = $state([]);
  let selectedServer: string | null = $state(null);
  let mods: Mod[] = $state([]);
  let operators: string[] = $state([]);
  let serverLogs = $state("");
  let serverLogsLoading = $state(false);
  let serverCommand = $state("");
  let serverCommandOutput = $state("");
  let sendingServerCommand = $state(false);
  let selectionRequest = 0;
  let logsRequest = 0;
  let newOperator = $state("");
  let message = $state("");
  let error = $state("");
  let loading = $state(false);
  let newServerName = $state("");
  let minecraftVersions: MinecraftVersion[] = $state([]);
  let versionsCatalogWarning = $state("");
  let newServerVersion = $state("");
  let newServerType = $state("VANILLA");
  let creatingServer = $state(false);
  let createDialogOpen = $state(false);
  let creationError = $state("");
  let stagedMods: File[] = $state([]);
  let modDropActive = $state(false);
  let createModInput: HTMLInputElement | undefined = $state();
  let modFileInput: HTMLInputElement | undefined = $state();
  let authReady = $state(false);
  let currentUser = $state<{ id: string; username: string } | null>(null);
  let authMode = $state<"login" | "register">("login");
  let authUsername = $state("");
  let authPassword = $state("");
  let authPasswordConfirm = $state("");
  let authError = $state("");
  let authBusy = $state(false);
  let invitationInput = $state("");
  let invitationBusy = $state(false);
  let shareLink = $state("");
  let shareServerName = $state("");
  let inviteLinkInput: HTMLInputElement | undefined = $state();

  function parseInvitationToken(value: string): string {
    const input = value.trim();
    try {
      const url = new URL(input);
      return url.searchParams.get("invite") ?? input;
    } catch {
      return input.startsWith("invite=") ? input.slice("invite=".length) : input;
    }
  }

  function selectedServerSupportsMods(): boolean {
    const server = servers.find((item) => item.name === selectedServer);
    const type = server?.serverType?.toUpperCase();
    return !type || ["NEOFORGE", "FORGE", "FABRIC", "QUILT"].includes(type);
  }

  function serverIsActive(server: Server): boolean {
    return server.state === "running" || server.state === "restarting" || (!server.state && server.running);
  }

  function serverStatusLabel(server: Server): string {
    if (server.state === "restarting") return "Redémarrage en boucle";
    if (server.state === "created") return "En attente de démarrage";
    if (server.running) return "En ligne";
    return "Arrêté";
  }

  function serverTypeLabel(server: Server): string {
    if (server.serverType === "NEOFORGE") return server.loaderVersion ? `NeoForge ${server.loaderVersion}` : "NeoForge";
    return server.serverType ?? "";
  }

  async function joinByInvitation() {
    const token = parseInvitationToken(invitationInput);
    if (!token) return;
    invitationBusy = true;
    error = "";
    try {
      const result = await acceptServerInvitation(token);
      invitationInput = "";
      const url = new URL(window.location.href);
      url.searchParams.delete("invite");
      window.history.replaceState({}, "", url);
      message = result.alreadyMember
        ? `Tu avais déjà accès à ${result.serverName}.`
        : `Tu as rejoint les collaborateurs de ${result.serverName}.`;
      await loadServers(true);
    } catch (reason) {
      error = String(reason);
    } finally {
      invitationBusy = false;
    }
  }

  async function generateInvitation(serverName: string) {
    error = "";
    shareLink = "";
    try {
      const invitation = await createServerInvitation(serverName);
      const url = new URL(window.location.href);
      url.searchParams.set("invite", invitation.token);
      url.hash = "";
      shareServerName = serverName;
      shareLink = url.toString();
      message = `Lien d’invitation pour ${serverName} créé. Il expire dans 15 minutes et ne peut être utilisé qu’une fois.`;
    } catch (reason) {
      error = String(reason);
    }
  }

  async function copyInvitationLink() {
    if (!shareLink) return;
    try {
      await navigator.clipboard.writeText(shareLink);
      message = "Lien copié dans le presse-papiers.";
    } catch {
      inviteLinkInput?.focus();
      inviteLinkInput?.select();
      message = "Sélectionne le lien puis copie-le.";
    }
  }

  function formatSize(size: number): string {
    if (size < 1024) return `${size} o`;
    if (size < 1024 * 1024) return `${Math.round(size / 1024)} Ko`;
    return `${(size / (1024 * 1024)).toFixed(1)} Mo`;
  }

  async function loadServers(preserveError = false) {
    loading = true;
    if (!preserveError) error = "";
    try {
      servers = await listServers();
      if (selectedServer && !servers.some((server) => server.name === selectedServer)) {
        selectionRequest++;
        logsRequest++;
        selectedServer = null;
        mods = [];
        operators = [];
        serverLogs = "";
        serverLogsLoading = false;
      }
    } catch (reason) {
      error = String(reason);
    } finally {
      loading = false;
    }
  }

  async function selectServer(name: string) {
    const requestId = ++selectionRequest;
    selectedServer = name;
    mods = [];
    operators = [];
    serverLogs = "";
    serverLogsLoading = true;
    serverCommand = "";
    serverCommandOutput = "";
    logsRequest++;
    message = "";
    error = "";
    try {
      const [serverMods, serverOperators] = await Promise.all([listMods(name), listOperators(name)]);
      if (requestId !== selectionRequest) return;
      mods = serverMods;
      operators = serverOperators;
    } catch (reason) {
      if (requestId !== selectionRequest) return;
      error = String(reason);
    }
    await refreshServerLogs();
  }

  async function refreshServerLogs() {
    const name = selectedServer;
    if (!name) return;
    const requestId = ++logsRequest;
    serverLogsLoading = true;
    try {
      const logs = await getServerLogs(name);
      if (selectedServer === name && requestId === logsRequest) serverLogs = logs;
    } catch (reason) {
      if (selectedServer === name && requestId === logsRequest) {
        serverLogs = String(reason);
        error = String(reason);
      }
    } finally {
      if (selectedServer === name && requestId === logsRequest) serverLogsLoading = false;
    }
  }

  async function sendServerCommand(event: SubmitEvent) {
    event.preventDefault();
    const name = selectedServer;
    const command = serverCommand.trim();
    if (!name || !command) return;
    const server = servers.find((item) => item.name === name);
    if (!server?.running) {
      error = "Démarre le serveur avant d’envoyer une commande.";
      return;
    }
    sendingServerCommand = true;
    error = "";
    try {
      const response = await executeServerCommand(name, command);
      serverCommandOutput = `> ${command}\n${response}`;
      serverCommand = "";
      await refreshServerLogs();
    } catch (reason) {
      error = String(reason);
      serverCommandOutput = `> ${command}\n${String(reason)}`;
    } finally {
      sendingServerCommand = false;
    }
  }

  async function addMod() {
    if (!selectedServer) return;
    if (!isTauri()) {
      modFileInput?.click();
      return;
    }
    const selected = await open({
      multiple: false,
      directory: false,
      filters: [{ name: "Mods Minecraft", extensions: ["jar", "zip"] }],
    });
    if (!selected || Array.isArray(selected)) return;

    error = "";
    message = "";
    try {
      await installMod(selectedServer, selected);
      mods = await listMods(selectedServer);
      message = "Le mod a été ajouté au serveur.";
    } catch (reason) {
      error = String(reason);
    }
  }

  async function addBrowserMod(event: Event) {
    if (!selectedServer) return;
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    error = "";
    message = "";
    try {
      await installMod(selectedServer, file);
      mods = await listMods(selectedServer);
      message = "Le mod a été ajouté au serveur.";
    } catch (reason) {
      error = String(reason);
    } finally {
      input.value = "";
    }
  }

  async function deleteMod(name: string) {
    if (!selectedServer || !window.confirm(`Supprimer ${name} de ce serveur ?`)) return;
    error = "";
    try {
      await removeMod(selectedServer, name);
      mods = await listMods(selectedServer);
      message = "Le mod a été supprimé.";
    } catch (reason) {
      error = String(reason);
    }
  }

  async function removeWorld() {
    if (!selectedServer) return;
    const server = servers.find((item) => item.name === selectedServer);
    if (server?.running) {
      error = "Arrête le serveur avant de supprimer sa map.";
      return;
    }
    if (server?.role !== "owner") {
      error = "Seul le propriétaire peut supprimer la map.";
      return;
    }
    if (!window.confirm(`Supprimer définitivement la map de ${selectedServer} ? Cette action est irréversible.`)) return;
    error = "";
    message = "";
    try {
      const levelName = await deleteWorldMap(selectedServer);
      message = `La map ${levelName} a été supprimée. Le serveur la recréera au prochain démarrage.`;
    } catch (reason) {
      error = String(reason);
    }
  }

  function openCreateDialog() {
    error = "";
    creationError = "";
    stagedMods = [];
    createDialogOpen = true;
  }

  function changeServerType(event: Event) {
    newServerType = (event.currentTarget as HTMLSelectElement).value;
    stagedMods = [];
    creationError = "";
    if (newServerType === "NEOFORGE" && minecraftVersions.find((version) => version.id === newServerVersion)?.type === "snapshot") {
      newServerVersion = minecraftVersions.find((version) => version.type === "release")?.id ?? "";
    }
  }

  function addCreationMods(files: FileList | File[]) {
    if (newServerType !== "NEOFORGE") {
      creationError = "Les mods nécessitent un serveur NeoForge. Change le type du serveur pour continuer.";
      return;
    }
    creationError = "";
    const combined = [...stagedMods];
    for (const file of Array.from(files)) {
      if (!/\.jar$/i.test(file.name)) {
        creationError = `${file.name} n’est pas un fichier .jar de mod.`;
        continue;
      }
      if (file.size === 0 || file.size > 100 * 1024 * 1024) {
        creationError = `${file.name} est vide ou dépasse 100 Mo.`;
        continue;
      }
      if (combined.some((item) => item.name.toLowerCase() === file.name.toLowerCase())) {
        creationError = `${file.name} est déjà dans la sélection.`;
        continue;
      }
      combined.push(file);
    }
    if (combined.length > 30) {
      creationError = "Tu peux sélectionner au maximum 30 mods.";
      return;
    }
    if (combined.reduce((total, file) => total + file.size, 0) > 500 * 1024 * 1024) {
      creationError = "La taille totale des mods dépasse 500 Mo.";
      return;
    }
    stagedMods = combined;
  }

  function chooseCreationMods(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    if (input.files) addCreationMods(input.files);
    input.value = "";
  }

  function dropCreationMods(event: DragEvent) {
    event.preventDefault();
    modDropActive = false;
    if (event.dataTransfer?.files) addCreationMods(event.dataTransfer.files);
  }

  function removeCreationMod(name: string) {
    stagedMods = stagedMods.filter((file) => file.name !== name);
    creationError = "";
  }

  async function createServer() {
    creatingServer = true;
    error = "";
    message = "";
    try {
      const assignedPort = await createServerWithMods(newServerName.trim(), newServerVersion, newServerType, stagedMods);
      newServerName = "";
      stagedMods = [];
      createDialogOpen = false;
      message = `Le serveur ${newServerType === "NEOFORGE" ? "NeoForge" : "Vanilla"} Minecraft ${newServerVersion} a été créé et démarré sur le port ${assignedPort}.`;
      await loadServers();
    } catch (reason) {
      error = String(reason);
      createDialogOpen = false;
      await loadServers(true);
    } finally {
      creatingServer = false;
    }
  }

  async function toggleServer(server: Server) {
    error = "";
    try {
      await setServerRunning(server.name, !serverIsActive(server));
      await loadServers();
    } catch (reason) {
      error = String(reason);
    }
  }

  async function removeServer(server: Server) {
    if (!window.confirm(`Supprimer le conteneur ${server.name} ? Les données conservées dans son volume Docker ne seront pas supprimées.`)) return;
    error = "";
    try {
      await deleteServer(server.name);
      if (selectedServer === server.name) {
        selectedServer = null;
        mods = [];
      }
      await loadServers();
      message = `Le conteneur ${server.name} a été supprimé.`;
    } catch (reason) {
      error = String(reason);
    }
  }

  async function revokeCollaborator(serverName: string, username: string) {
    if (!window.confirm(`Retirer l’accès de ${username} au serveur ${serverName} ?`)) return;
    error = "";
    try {
      await removeCollaborator(serverName, username);
      await loadServers(true);
      message = `${username} n’a plus accès au serveur ${serverName}.`;
    } catch (reason) {
      error = String(reason);
    }
  }

  async function grantOperator(event: SubmitEvent) {
    event.preventDefault();
    if (!selectedServer) return;
    error = "";
    try {
      await addOperator(selectedServer, newOperator.trim());
      operators = await listOperators(selectedServer);
      message = `${newOperator.trim()} a été ajouté aux opérateurs.`;
      newOperator = "";
    } catch (reason) {
      error = String(reason);
    }
  }

  async function revokeOperator(playerName: string) {
    if (!selectedServer || !window.confirm(`Retirer ${playerName} des opérateurs ?`)) return;
    error = "";
    try {
      await removeOperator(selectedServer, playerName);
      operators = await listOperators(selectedServer);
      message = `${playerName} a été retiré des opérateurs.`;
    } catch (reason) {
      error = String(reason);
    }
  }

  async function initialize() {
    const invite = new URL(window.location.href).searchParams.get("invite");
    if (invite) invitationInput = invite;
    const versionCatalog = await listMinecraftVersions();
    minecraftVersions = versionCatalog.versions;
    versionsCatalogWarning = versionCatalog.source === "local"
      ? "Catalogue Mojang indisponible : seules les versions présentes dans le dossier versions/ sont proposées."
      : "";
    newServerVersion = minecraftVersions[0]?.id ?? "";
    if (isTauri()) {
      authReady = true;
      await loadServers();
      return;
    }
    try {
      currentUser = await getCurrentUser();
      if (currentUser) {
        if (invitationInput) {
          await joinByInvitation();
          if (invitationInput) await loadServers(true);
        } else {
          await loadServers();
        }
      }
    } catch (reason) {
      authError = `Le service local n’est pas joignable : ${String(reason)}`;
    } finally {
      authReady = true;
    }
  }

  async function submitAuth(event: SubmitEvent) {
    event.preventDefault();
    authError = "";
    if (authMode === "register" && authPassword !== authPasswordConfirm) {
      authError = "Les deux mots de passe ne correspondent pas.";
      return;
    }
    authBusy = true;
    try {
      currentUser = await authenticate(authMode, authUsername, authPassword);
      authPassword = "";
      authPasswordConfirm = "";
      authReady = true;
      await loadServers();
      if (invitationInput) await joinByInvitation();
    } catch (reason) {
      authError = String(reason);
    } finally {
      authBusy = false;
    }
  }

  async function signOut() {
    try {
      await logout();
      currentUser = null;
      servers = [];
      selectedServer = null;
      mods = [];
      operators = [];
    } catch (reason) {
      error = String(reason);
    }
  }

  $effect(() => {
    void initialize();
  });
</script>

<svelte:head>
  <title>MinePanel — Serveurs Minecraft</title>
  <meta name="description" content="Gestionnaire local de serveurs Minecraft et de mods" />
</svelte:head>

{#if !authReady}
  <main class="auth-layout"><div class="auth-card"><span class="brand-mark">M</span><h1>MinePanel</h1><p>Connexion au service local…</p></div></main>
{:else if !isTauri() && !currentUser}
  <main class="auth-layout">
    <form class="auth-card" onsubmit={submitAuth}>
      <span class="brand-mark">M</span>
      <p class="eyebrow">GESTION DE SERVEURS MINECRAFT</p>
      <h1>{authMode === "login" ? "Content de te revoir" : "Créer un compte local"}</h1>
      <p class="auth-subtitle">{authMode === "login" ? "Connecte-toi pour accéder à tes serveurs." : "Ce compte est enregistré sur cette machine."}</p>
      {#if invitationInput}<p class="auth-subtitle">Une invitation est prête. Connecte-toi ou crée ton compte pour rejoindre le serveur.</p>{/if}
      {#if authError}<div class="notice error">{authError}</div>{/if}
      <label>Identifiant<input bind:value={authUsername} required minlength="3" maxlength="32" autocomplete="username" /></label>
      <label>Mot de passe<input bind:value={authPassword} type="password" required minlength="10" maxlength="256" autocomplete={authMode === "login" ? "current-password" : "new-password"} /></label>
      {#if authMode === "register"}<label>Confirmer le mot de passe<input bind:value={authPasswordConfirm} type="password" required minlength="10" maxlength="256" autocomplete="new-password" /></label>{/if}
      <button class="button primary auth-submit" type="submit" disabled={authBusy}>{authBusy ? "Patiente…" : authMode === "login" ? "Se connecter" : "Créer mon compte"}</button>
      <button class="auth-switch" type="button" onclick={() => { authMode = authMode === "login" ? "register" : "login"; authError = ""; }}>{authMode === "login" ? "Créer un compte" : "J’ai déjà un compte"}</button>
    </form>
  </main>
{:else}
<main class="layout">
  <aside class="sidebar">
    <div class="brand">
      <span class="brand-mark">M</span>
      <div><strong>MinePanel</strong><small>Gestionnaire local</small></div>
    </div>
    <nav aria-label="Navigation">
      <a class="nav-item active" href="#servers">Serveurs</a>
      <a class="nav-item" href="#mods">Mods</a>
      <a class="nav-item" href="#operators">Opérateurs</a>
    </nav>
    <div class="sidebar-footer"><span class="status-dot"></span>Docker local</div>
  </aside>

  <section class="content">
    <header class="topbar">
      <div><p class="eyebrow">ESPACE D'ADMINISTRATION</p><h1>Vos serveurs Minecraft</h1></div>
      <div class="topbar-actions">
        {#if currentUser}<span class="signed-in">{currentUser.username}</span><button class="button secondary" type="button" onclick={signOut}>Déconnexion</button>{/if}
        <button class="button secondary" type="button" onclick={loadServers} disabled={loading}>{loading ? "Actualisation…" : "Actualiser"}</button>
      </div>
    </header>

    {#if message}<div class="notice success">{message}</div>{/if}
    {#if error}<div class="notice error">{error}</div>{/if}

    {#if createDialogOpen}
      <div class="create-modal-backdrop" role="presentation">
        <section class="create-modal" role="dialog" aria-modal="true" aria-labelledby="create-modal-title">
          <div class="modal-heading">
            <div><p class="eyebrow">PRÉPARATION DU SERVEUR</p><h2 id="create-modal-title">{newServerType === "NEOFORGE" ? "Ajouter des mods avant le premier démarrage" : "Préparer le premier démarrage"}</h2></div>
            <button class="modal-close" type="button" aria-label="Fermer" onclick={() => createDialogOpen = false} disabled={creatingServer}>×</button>
          </div>
          <p class="modal-description">{newServerType === "NEOFORGE" ? "MinePanel installe d’abord les fichiers Minecraft et NeoForge, copie les mods sélectionnés dans le serveur, puis lance Minecraft et crée le monde." : "MinePanel prépare les fichiers Minecraft, puis lance le serveur Vanilla et crée le monde."}</p>
          {#if newServerType === "NEOFORGE" && !isTauri()}
            <input bind:this={createModInput} class="file-input" type="file" accept=".jar" multiple disabled={creatingServer} onchange={chooseCreationMods} />
            <div class:drop-active={modDropActive} class="mod-drop-zone" role="button" tabindex="0"
              onclick={() => { if (!creatingServer) createModInput?.click(); }}
              onkeydown={(event) => { if (!creatingServer && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); createModInput?.click(); } }}
              ondragover={(event) => { event.preventDefault(); if (!creatingServer) modDropActive = true; }}
              ondragleave={() => modDropActive = false}
              ondrop={(event) => { if (creatingServer) event.preventDefault(); else dropCreationMods(event); }}>
              <span class="drop-icon">＋</span>
              <strong>Dépose les fichiers .jar ici</strong>
              <span>ou clique pour les sélectionner dans l’explorateur</span>
              <small>Jusqu’à 30 fichiers, 100 Mo chacun · Tu peux aussi continuer sans mod.</small>
            </div>
            {#if stagedMods.length}
              <div class="staged-mod-list" aria-label="Mods sélectionnés">
                {#each stagedMods as mod (mod.name)}
                <div class="staged-mod"><span>▦</span><strong>{mod.name}</strong><small>{formatSize(mod.size)}</small><button type="button" aria-label="Retirer {mod.name}" onclick={() => removeCreationMod(mod.name)} disabled={creatingServer}>×</button></div>
                {/each}
              </div>
            {/if}
          {:else if newServerType === "VANILLA"}
            <p class="modal-info">Ce serveur est Vanilla : tu peux le créer sans mods. Pour préparer des mods avant le premier monde, choisis NeoForge dans le formulaire.</p>
          {:else}
            <p class="modal-info">La préparation préalable des mods est disponible depuis l’interface web locale.</p>
          {/if}
          {#if creationError}<div class="notice error modal-error">{creationError}</div>{/if}
          <div class="modal-actions">
            <button class="button secondary" type="button" onclick={() => createDialogOpen = false} disabled={creatingServer}>Annuler</button>
            <button class="button primary" type="button" onclick={createServer} disabled={creatingServer || !!creationError}>
              {creatingServer ? "Installation puis démarrage…" : stagedMods.length ? `Créer avec ${stagedMods.length} mod${stagedMods.length > 1 ? "s" : ""}` : "Créer sans mod"}
            </button>
          </div>
        </section>
      </div>
    {/if}

    <form class="create-panel" onsubmit={(event) => { event.preventDefault(); openCreateDialog(); }}>
      <div><p class="eyebrow">NOUVEAU CONTENEUR DOCKER</p><h2>Créer un serveur Minecraft</h2></div>
      <label>Nom du serveur<input bind:value={newServerName} required minlength="1" maxlength="64" pattern="[A-Za-z0-9_.-]+" placeholder="survie" /></label>
      <label>Version du serveur<select bind:value={newServerVersion} required disabled={creatingServer || minecraftVersions.length === 0}>
        {#if minecraftVersions.length === 0}<option value="" disabled>Aucune version disponible</option>{/if}
        <optgroup label="Versions stables">
          {#each minecraftVersions.filter((version) => version.type === "release") as version (version.id)}<option value={version.id}>{version.label}</option>{/each}
        </optgroup>
        {#if newServerType !== "NEOFORGE"}
          <optgroup label="Snapshots (versions de test)">
            {#each minecraftVersions.filter((version) => version.type === "snapshot") as version (version.id)}<option value={version.id}>{version.label}</option>{/each}
          </optgroup>
        {/if}
      </select></label>
      {#if versionsCatalogWarning}<span class="port-hint">{versionsCatalogWarning}</span>{/if}
      <label>Type de serveur<select bind:value={newServerType} onchange={changeServerType} disabled={creatingServer}>
        <option value="VANILLA">Vanilla</option>
        <option value="NEOFORGE">NeoForge (mods)</option>
      </select></label>
      <span class="port-hint">{newServerType === "NEOFORGE" ? "Pour les mods, les joueurs devront utiliser NeoForge dans la même version." : "Vanilla accepte les clients Minecraft non moddés."}</span>
      <span class="port-hint">Port public attribué automatiquement à partir de 38000</span>
      <button class="button primary" type="submit" disabled={creatingServer || !newServerName.trim() || !newServerVersion}>Continuer</button>
    </form>

    {#if !isTauri()}
      <form class="invite-join" onsubmit={(event) => { event.preventDefault(); void joinByInvitation(); }}>
        <label for="server-invitation">Rejoindre un serveur avec un lien d’invitation</label>
        <input id="server-invitation" bind:value={invitationInput} required placeholder="Colle le lien d’invitation ou son code" />
        <button class="button secondary" type="submit" disabled={invitationBusy}>{invitationBusy ? "Vérification…" : "Rejoindre"}</button>
      </form>
    {/if}

    {#if shareLink}
      <div class="share-panel">
        <div><strong>Invitation pour {shareServerName}</strong><small>Valable 15 minutes, pour un seul compte. La personne doit se connecter ou créer son compte avant de rejoindre.</small></div>
        <input bind:this={inviteLinkInput} readonly value={shareLink} aria-label="Lien d’invitation" />
        <button class="button secondary" type="button" onclick={copyInvitationLink}>Copier le lien</button>
        {#if servers.find((server) => server.name === shareServerName)?.collaborators?.length}
          <small class="collaborator-list">Collaborateurs : {servers.find((server) => server.name === shareServerName)?.collaborators?.join(", ")}</small>
        {:else}<small class="collaborator-list">Aucun collaborateur pour le moment.</small>{/if}
      </div>
    {/if}

    <div class="server-grid" id="servers">
      {#if servers.length}
        {#each servers as server}
          <article class:selected={selectedServer === server.name} class="server-card">
            <button class="server-select" type="button" onclick={() => selectServer(server.name)}>
              <span class="server-icon">◆</span>
              <span class="server-info">
                <strong>{server.name}</strong>
                <small><span class:stopped={!server.running} class="status-dot"></span>{serverStatusLabel(server)}{server.port ? ` · Port ${server.port}` : ""}</small>
                <small class="server-version">Minecraft {server.version ?? "version inconnue"}</small>
                {#if server.serverType}<small>{serverTypeLabel(server)}</small>{/if}
                {#if server.role === "collaborator"}<small>Collaborateur de {server.ownerUsername}</small>{/if}
              </span>
              <span class="chevron">›</span>
            </button>
            {#if !isTauri() && server.role === "owner" && server.collaborators?.length}
              <div class="server-collaborators">
                <span>Collaborateurs :</span>
                {#each server.collaborators as username}
                  <span class="collaborator-name">{username}<button type="button" aria-label="Retirer {username}" title="Retirer {username}" onclick={() => revokeCollaborator(server.name, username)}>×</button></span>
                {/each}
              </div>
            {/if}
            <div class="server-actions">
              <button type="button" onclick={() => toggleServer(server)}>{serverIsActive(server) ? "Arrêter" : "Démarrer"}</button>
              {#if !isTauri() && server.role === "owner"}<button type="button" onclick={() => generateInvitation(server.name)}>Inviter</button>{/if}
              {#if server.role !== "collaborator"}<button class="danger-action" type="button" onclick={() => removeServer(server)}>Supprimer</button>{/if}
            </div>
          </article>
        {/each}
      {:else}
        <div class="empty-card"><strong>Aucun serveur accessible</strong><span>Les serveurs Minecraft dont tu es propriétaire ou collaborateur apparaîtront ici.</span></div>
      {/if}
    </div>

    <section class="mods-panel" id="mods">
      <div class="section-heading">
        <div><p class="eyebrow">CONTENU DU SERVEUR</p><h2>{selectedServer ? `Mods de ${selectedServer}` : "Sélectionnez un serveur"}</h2></div>
        <div class="mod-actions">
          <input bind:this={modFileInput} class="file-input" type="file" accept=".jar,.zip" onchange={addBrowserMod} />
          <button class="button primary" type="button" onclick={addMod} disabled={!selectedServer || !selectedServerSupportsMods()}>+ Ajouter un mod</button>
          {#if !isTauri() && selectedServer && servers.find((server) => server.name === selectedServer)?.role === "owner"}
            <button class="button secondary delete-world-button" type="button" onclick={removeWorld} disabled={servers.find((server) => server.name === selectedServer)?.running}>Supprimer la map</button>
          {/if}
        </div>
      </div>

      {#if selectedServer}
        {#if !selectedServerSupportsMods()}<p class="empty-mods">Ce serveur est Vanilla : il ne charge pas les mods. Crée un serveur NeoForge pour utiliser des mods NeoForge.</p>{/if}
        {#if mods.length}
          <div class="mod-list">
            {#each mods as mod}
              <div class="mod-row">
                <span class="mod-icon">▦</span>
                <span class="mod-name"><strong>{mod.name}</strong><small>{formatSize(mod.size)}</small></span>
                <button class="remove-mod" type="button" onclick={() => deleteMod(mod.name)}>Supprimer</button>
              </div>
            {/each}
          </div>
        {:else if selectedServerSupportsMods()}<div class="empty-mods">Aucun mod installé sur ce serveur.</div>{/if}
      {:else}<div class="empty-mods">Choisissez un serveur pour afficher ses mods.</div>{/if}
    </section>

    <section class="mods-panel operators-panel" id="operators">
      <div class="section-heading">
        <div><p class="eyebrow">DROITS MINECRAFT</p><h2>{selectedServer ? `Opérateurs de ${selectedServer}` : "Gestion des opérateurs"}</h2></div>
      </div>
      {#if selectedServer}
        <form class="operator-form" onsubmit={grantOperator}>
          <label for="operator-name">Pseudo du joueur</label>
          <input id="operator-name" bind:value={newOperator} required minlength="3" maxlength="16" pattern="[A-Za-z0-9_]+" placeholder="Pseudo Minecraft" />
          <button class="button primary" type="submit">Ajouter opérateur</button>
        </form>
        {#if operators.length}
          <div class="operator-list">
            {#each operators as operator}
              <div class="mod-row"><span class="mod-icon">♙</span><span class="mod-name"><strong>{operator}</strong><small>Opérateur</small></span><button class="remove-mod" type="button" onclick={() => revokeOperator(operator)}>Retirer</button></div>
            {/each}
          </div>
        {:else}<div class="empty-mods">Aucun opérateur trouvé.</div>{/if}
      {:else}<div class="empty-mods">Choisissez un serveur pour gérer ses opérateurs.</div>{/if}
    </section>

    <section class="mods-panel command-panel" id="commands">
      <div class="section-heading">
        <div><p class="eyebrow">CONSOLE MINECRAFT</p><h2>{selectedServer ? `Commande pour ${selectedServer}` : "Envoyer une commande"}</h2></div>
      </div>
      {#if selectedServer}
        {@const selected = servers.find((server) => server.name === selectedServer)}
        {#if selected?.running}
          <form class="server-command-form" onsubmit={sendServerCommand}>
            <label class="sr-only" for="server-command">Commande Minecraft</label>
            <input id="server-command" bind:value={serverCommand} maxlength="512" autocomplete="off" placeholder="Ex. say Bonjour à tous" disabled={sendingServerCommand} />
            <button class="button primary" type="submit" disabled={sendingServerCommand || !serverCommand.trim()}>
              {sendingServerCommand ? "Envoi…" : "Envoyer"}
            </button>
          </form>
          <small class="logs-hint">La commande est exécutée dans la console du serveur. Le préfixe / est facultatif.</small>
          {#if serverCommandOutput}<pre class="command-output" aria-live="polite">{serverCommandOutput}</pre>{/if}
        {:else}
          <div class="empty-mods">Démarre ce serveur pour pouvoir lui envoyer des commandes.</div>
        {/if}
      {:else}
        <div class="empty-mods">Sélectionnez un serveur pour envoyer une commande.</div>
      {/if}
    </section>

    <section class="mods-panel logs-panel" id="logs">
      <div class="section-heading">
        <div><p class="eyebrow">JOURNAUX DOCKER</p><h2>{selectedServer ? `Logs de ${selectedServer}` : "Logs du serveur"}</h2></div>
        <button class="button secondary" type="button" onclick={refreshServerLogs} disabled={!selectedServer || serverLogsLoading}>
          {serverLogsLoading ? "Chargement…" : "Actualiser"}
        </button>
      </div>
      {#if !selectedServer}
        <div class="empty-mods">Sélectionnez un serveur pour afficher ses derniers journaux.</div>
      {:else if serverLogsLoading && !serverLogs}
        <div class="empty-mods">Chargement des journaux…</div>
      {:else}
        <pre class="server-logs" aria-live="polite">{serverLogs || "Aucun journal disponible pour ce serveur."}</pre>
        <small class="logs-hint">Les 200 dernières lignes sont affichées. Clique sur « Actualiser » pour les recharger.</small>
      {/if}
    </section>
  </section>
</main>
{/if}

<style>
  :global(:root) { font-family: Inter, ui-sans-serif, system-ui, sans-serif; color: #e5e7eb; background: #0b1120; font-synthesis: none; }
  :global(*) { box-sizing: border-box; }
  :global(body) { margin: 0; min-width: 780px; background: radial-gradient(circle at 85% 0%, #1e293b 0, #0b1120 42%); }
  button { font: inherit; }
  .layout { display: flex; min-height: 100vh; }
  .auth-layout { display: grid; place-items: center; min-height: 100vh; padding: 24px; } .auth-card { display: flex; flex-direction: column; gap: 16px; width: min(420px, 100%); padding: 34px; border: 1px solid #263449; border-radius: 16px; background: #111c30; box-shadow: 0 22px 70px #0005; } .auth-card .brand-mark { align-self: flex-start; } .auth-card h1 { font-size: 27px; } .auth-subtitle { margin: -8px 0 4px; color: #94a3b8; font-size: 14px; } .auth-card label { display: grid; gap: 7px; color: #94a3b8; font-size: 12px; } .auth-card input { padding: 11px 12px; border: 1px solid #334155; border-radius: 7px; color: #f8fafc; background: #0b1120; font: inherit; } .auth-submit { margin-top: 5px; } .auth-switch { border: 0; color: #86efac; background: transparent; cursor: pointer; }
  .topbar-actions { display: flex; align-items: center; gap: 10px; } .signed-in { color: #94a3b8; font-size: 13px; }
  .sidebar { width: 238px; display: flex; flex-direction: column; padding: 28px 16px; background: #0f172a; border-right: 1px solid #1e293b; }
  .brand { display: flex; align-items: center; gap: 11px; padding: 0 10px 42px; }
  .brand-mark { display: grid; place-items: center; width: 34px; height: 34px; border-radius: 10px; background: #22c55e; color: #052e16; font-weight: 900; }
  .brand strong, .brand small { display: block; } .brand small { margin-top: 3px; color: #64748b; font-size: 11px; }
  .nav-item { display: block; padding: 12px 13px; color: #94a3b8; text-decoration: none; border-radius: 8px; } .nav-item.active, .nav-item:hover { color: #f8fafc; background: #1e293b; }
  .sidebar-footer { margin-top: auto; padding: 12px 13px; color: #64748b; font-size: 12px; }
  .status-dot { display: inline-block; width: 7px; height: 7px; margin-right: 7px; border-radius: 50%; background: #22c55e; } .status-dot.stopped { background: #64748b; }
  .content { width: min(1100px, 100%); padding: 46px 54px; } .topbar, .section-heading { display: flex; align-items: end; justify-content: space-between; gap: 20px; }
  .eyebrow { margin: 0 0 8px; color: #64748b; font-size: 11px; font-weight: 800; letter-spacing: .12em; } h1, h2 { margin: 0; color: #f8fafc; letter-spacing: -.03em; } h1 { font-size: 30px; } h2 { font-size: 20px; }
  .button { border: 0; border-radius: 8px; padding: 11px 16px; font-weight: 700; cursor: pointer; } .button:disabled { opacity: .4; cursor: not-allowed; } .button.primary { color: #052e16; background: #4ade80; } .button.secondary { color: #cbd5e1; background: #1e293b; }
  .notice { margin: 24px 0 0; padding: 12px 15px; border-radius: 8px; font-size: 13px; } .notice.success { color: #bbf7d0; background: #14532d; } .notice.error { color: #fecaca; background: #7f1d1d; }
  .server-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: 13px; margin: 32px 0 48px; } .server-card, .empty-card { min-height: 112px; padding: 18px; border: 1px solid #263449; border-radius: 12px; background: #111c30; color: #e2e8f0; text-align: left; }
  .create-panel { display: flex; align-items: end; gap: 14px; flex-wrap: wrap; margin-top: 30px; padding: 20px; border: 1px solid #263449; border-radius: 12px; background: #111c30; } .create-panel > div { flex: 1 1 100%; } .create-panel h2 { font-size: 18px; } .create-panel label { display: grid; gap: 7px; color: #94a3b8; font-size: 12px; } .create-panel input, .create-panel select { min-width: 150px; padding: 10px 12px; border: 1px solid #334155; border-radius: 7px; color: #f8fafc; background: #0b1120; font: inherit; } .port-hint { color: #94a3b8; font-size: 12px; }
  .create-modal-backdrop { position: fixed; inset: 0; z-index: 1000; display: grid; place-items: center; padding: 24px; overflow-y: auto; background: #020617d9; }
  .create-modal { width: min(640px, 100%); max-height: calc(100vh - 48px); overflow-y: auto; padding: 26px; border: 1px solid #334155; border-radius: 16px; background: #111c30; box-shadow: 0 24px 90px #0009; }
  .modal-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 18px; } .modal-heading h2 { max-width: 500px; font-size: 21px; line-height: 1.3; } .modal-close { width: 34px; height: 34px; flex: 0 0 auto; border: 0; border-radius: 8px; color: #cbd5e1; background: #1e293b; cursor: pointer; font-size: 23px; line-height: 1; } .modal-close:disabled { opacity: .5; cursor: not-allowed; }
  .modal-description, .modal-info { margin: 14px 0 20px; color: #94a3b8; font-size: 13px; line-height: 1.6; } .modal-info { padding: 14px; border: 1px solid #334155; border-radius: 9px; background: #0b1120; }
  .mod-drop-zone { display: flex; min-height: 190px; flex-direction: column; align-items: center; justify-content: center; gap: 9px; padding: 24px; border: 1px dashed #4b647c; border-radius: 12px; color: #cbd5e1; background: #0b1120; text-align: center; cursor: pointer; transition: border-color .15s, background .15s; } .mod-drop-zone:hover, .mod-drop-zone.drop-active { border-color: #4ade80; background: #10251f; } .mod-drop-zone:focus-visible { outline: 2px solid #4ade80; outline-offset: 3px; } .mod-drop-zone strong { color: #f8fafc; font-size: 15px; } .mod-drop-zone > span:not(.drop-icon) { color: #94a3b8; font-size: 13px; } .mod-drop-zone small { margin-top: 5px; color: #64748b; font-size: 11px; } .drop-icon { display: grid; width: 38px; height: 38px; place-items: center; border-radius: 50%; color: #86efac; background: #14532d; font-size: 24px; }
  .staged-mod-list { margin-top: 15px; border-top: 1px solid #263449; } .staged-mod { display: flex; align-items: center; gap: 10px; padding: 10px 2px; border-bottom: 1px solid #263449; color: #86efac; } .staged-mod strong { flex: 1; overflow: hidden; color: #e2e8f0; font-size: 12px; text-overflow: ellipsis; white-space: nowrap; } .staged-mod small { color: #64748b; font-size: 11px; } .staged-mod button { border: 0; color: #fca5a5; background: transparent; cursor: pointer; font-size: 19px; }
  .modal-error { margin: 14px 0 0; white-space: pre-wrap; } .modal-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 22px; }
  .invite-join, .share-panel { display: flex; align-items: end; gap: 12px; flex-wrap: wrap; margin-top: 16px; padding: 18px 20px; border: 1px solid #263449; border-radius: 12px; background: #111c30; } .invite-join label { flex: 1 1 100%; color: #94a3b8; font-size: 12px; } .invite-join input, .share-panel input { flex: 1 1 320px; min-width: 180px; padding: 10px 12px; border: 1px solid #334155; border-radius: 7px; color: #f8fafc; background: #0b1120; font: inherit; } .share-panel { align-items: center; } .share-panel > div { flex: 1 1 100%; } .share-panel strong, .share-panel small { display: block; } .share-panel small { margin-top: 5px; color: #94a3b8; font-size: 12px; } .share-panel .collaborator-list { flex: 1 1 100%; }
  .server-card { padding: 0; overflow: hidden; } .server-card:hover, .server-card.selected { border-color: #22c55e; background: #132b2a; } .server-select { display: flex; align-items: center; gap: 12px; width: 100%; padding: 16px; border: 0; color: inherit; background: transparent; text-align: left; cursor: pointer; } .server-icon { display: grid; place-items: center; width: 38px; height: 38px; border-radius: 9px; color: #86efac; background: #14532d; }
  .server-actions { display: flex; justify-content: space-between; padding: 0 16px 13px; } .server-actions button { padding: 0; border: 0; color: #86efac; background: transparent; cursor: pointer; font-size: 12px; } .server-actions .danger-action { color: #fca5a5; }
  .server-collaborators { display: flex; align-items: center; flex-wrap: wrap; gap: 3px 7px; padding: 0 16px 12px 66px; color: #94a3b8; font-size: 12px; } .collaborator-name { display: inline-flex; align-items: center; gap: 2px; color: #cbd5e1; } .collaborator-name button { width: 14px; height: 14px; padding: 0; border: 0; color: #f87171; background: transparent; cursor: pointer; font-size: 15px; font-weight: 700; line-height: 12px; }
  .server-info { flex: 1; } .server-info strong, .server-info small { display: block; } .server-info small { margin-top: 8px; color: #94a3b8; font-size: 12px; } .chevron { color: #64748b; font-size: 24px; } .empty-card { display: flex; flex-direction: column; gap: 7px; color: #94a3b8; } .empty-card strong { color: #e2e8f0; }
  .mods-panel { padding: 26px; border: 1px solid #263449; border-radius: 14px; background: rgba(15, 23, 42, .72); } .mod-list { margin-top: 24px; border-top: 1px solid #263449; } .mod-row { display: flex; align-items: center; gap: 13px; padding: 14px 0; border-bottom: 1px solid #1e293b; }
  .mod-actions { display: flex; flex-direction: column; align-items: stretch; gap: 8px; } .delete-world-button { border-color: #713f46; color: #fca5a5; } .delete-world-button:disabled { opacity: .5; cursor: not-allowed; } .file-input { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; clip-path: inset(50%); }
  .operators-panel { margin-top: 22px; } .operator-form { display: flex; align-items: center; flex-wrap: wrap; gap: 12px; margin-top: 24px; } .operator-form label { color: #94a3b8; font-size: 12px; } .operator-form input { min-width: 180px; padding: 10px 12px; border: 1px solid #334155; border-radius: 7px; color: #f8fafc; background: #0b1120; font: inherit; } .operator-list { margin-top: 20px; border-top: 1px solid #263449; }
  .logs-panel { margin-top: 22px; } .server-logs { max-height: 440px; overflow: auto; margin: 22px 0 8px; padding: 16px; border: 1px solid #1e293b; border-radius: 9px; color: #cbd5e1; background: #070d18; font: 12px/1.55 ui-monospace, SFMono-Regular, Menlo, monospace; white-space: pre-wrap; overflow-wrap: anywhere; } .logs-hint { color: #64748b; font-size: 11px; }
  .command-panel { margin-top: 22px; } .server-command-form { display: flex; gap: 10px; margin-top: 22px; } .server-command-form input { flex: 1; min-width: 0; padding: 11px 13px; border: 1px solid #334155; border-radius: 7px; color: #f8fafc; background: #0b1120; font: 13px ui-monospace, SFMono-Regular, Menlo, monospace; } .command-output { max-height: 180px; overflow: auto; margin: 15px 0 0; padding: 13px; border: 1px solid #1e293b; border-radius: 8px; color: #cbd5e1; background: #070d18; font: 12px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace; white-space: pre-wrap; overflow-wrap: anywhere; } .sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0; }
  .mod-icon { color: #86efac; } .mod-name { flex: 1; } .mod-name strong, .mod-name small { display: block; } .mod-name small { margin-top: 4px; color: #64748b; font-size: 12px; } .remove-mod { border: 0; color: #fca5a5; background: transparent; cursor: pointer; font-size: 12px; } .empty-mods { padding: 32px 0 8px; color: #64748b; text-align: center; }
</style>
