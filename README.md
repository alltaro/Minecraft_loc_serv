# MinePanel

MinePanel est une interface SvelteKit pilotée par Bun. En mode navigateur, un
service local Bun relie l'interface au démon Docker de cette machine.

L'interface détecte les conteneurs Docker locaux et permet d'ajouter ou de
supprimer des mods `.jar` et `.zip` dans `/minecraft/mods` du conteneur
sélectionné. La liste des versions proposées à la création est tenue dans
`versions/` ; chaque fichier JSON y décrit une version acceptée par l'image
Docker. À la création, un port public disponible est attribué
automatiquement en commençant à `38000` (puis `38001`, etc.).
À la création, le type Vanilla ou NeoForge est sélectionnable (Vanilla par
défaut). NeoForge permet d'installer des mods ; les serveurs Vanilla ne les
chargent pas. Les serveurs existants ne sont pas convertis automatiquement.

## Développement

Pré-requis : Bun et Docker. Docker doit être démarré et accessible à l'utilisateur
qui lance MinePanel.

```bash
bun install
bun run dev
```

`bun run dev` démarre l'API locale sur `127.0.0.1:3031`, attend son endpoint de
santé, puis démarre SvelteKit sur `http://localhost:1421`. Les étapes sont
affichées dans le terminal. Les ports peuvent être changés avec
`MINEPANEL_API_PORT` et `MINEPANEL_WEB_PORT`. Pour démarrer séparément les processus, utiliser
`bun run api` et `bun run web:dev` dans deux terminaux. Pour produire les
fichiers web, utiliser `bun run build`.

Dans le navigateur, MinePanel propose l'inscription et la connexion avec un
compte local. Les mots de passe sont hachés ; les comptes, sessions,
propriétaires et invitations sont conservés dans `.minepanel-state.json`,
ignoré par Git. Les nouveaux conteneurs sont associés au
compte qui les crée ; les conteneurs locaux existants sont attribués au premier
compte qui les ouvre. Une fois un serveur sélectionné, l'interface
permet aussi d'ajouter ou retirer des opérateurs Minecraft. Pour les conteneurs
`itzg/minecraft-server`, ces actions utilisent RCON ; pour l'ancienne image
locale, elles mettent à jour `ops.json`. Cette version du dépôt ne contient pas
le projet Rust nécessaire à la fenêtre desktop Tauri.

Le service Docker de développement écoute uniquement sur la machine qui
exécute MinePanel (`127.0.0.1:3031`). Le port peut être changé avec `MINEPANEL_API_PORT`.

Si Bun n'est pas encore dans le PATH du terminal courant :

```bash
export PATH="$HOME/.bun/bin:$PATH"
```

Le service Bun doit rester lancé pendant l'utilisation de l'interface web.

## Utilisation des mods

1. Démarrer le conteneur du serveur Minecraft.
2. Sélectionner le serveur dans MinePanel.
3. Cliquer sur **Ajouter un mod** et choisir un fichier `.jar` ou `.zip`.
4. Redémarrer le serveur Minecraft pour charger le mod.

Le nom du conteneur est validé avant chaque opération et les commandes Docker
sont exécutées sans shell intermédiaire. Le backend Express historique du dépôt
(`server.js`, port 3000) appartient à l'ancienne interface et n'est pas utilisé
par cette version SvelteKit.
