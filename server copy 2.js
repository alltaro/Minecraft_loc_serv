const express = require("express");
const fs = require("fs");
const app = express();
const port = 3000;
const { exec } = require("child_process");

const sqlite3 = require("sqlite3").verbose();
const cookieParser = require("cookie-parser");
const bcrypt = require("bcrypt");

const srv_run = new sqlite3.Database("serveurs_running.db");
const srv = new sqlite3.Database("serveurs.db");
const db = new sqlite3.Database("login.db");

const uuid = require("uuid");
const jwt = require("jsonwebtoken");
const bodyParser = require("body-parser");
cookie = require("cookie-parser");

const containerId = "compassionate_franklin";
const localFilePath = __dirname + "/files/ops.json";
const containerFilePath = "/minecraft/ops.json";
const docker_Command = `docker cp ${localFilePath} ${containerId}:/minecraft/ops.json`;

app.use(express.json());
app.use(cookieParser());
app.use(bodyParser.urlencoded({ extended: true }));
const secretKey =
  "4b1e876a0283bba9c34f26ae238ec610a0fbe61e7183dab5db20159a50d9265c48afcb3d392fb90ea3ab8652d317d9e78373b986f8b7a85730054a40f1f36fbc";

app.use((req, res, next) => {
  const requestedPage = req.url;

  // Vérifier si le chemin de l'URL n'est pas "/login" et si l'utilisateur n'a pas de cookie
  if (
    requestedPage !== "/login" &&
    requestedPage !== "/register" &&
    !req.cookies.user
  ) {
    // Rediriger vers /login s'il n'y a pas de cookie
    res.redirect("/login");
  } else {
    // Si le chemin de l'URL est /login ou si l'utilisateur a un cookie, continuez vers la prochaine fonction middleware
    next();
  }
});
srv_run.serialize(() => {
  srv_run.run(
    "CREATE TABLE IF NOT EXISTS runnings (username TEXT, containers TEXT, port INTEGER)"
  );
});
srv.serialize(() => {
  srv.run(
    "CREATE TABLE IF NOT EXISTS servers (username TEXT, containers TEXT[])"
  );
});
db.serialize(() => {
  db.run(
    "CREATE TABLE IF NOT EXISTS users ( username TEXT UNIQUE, password TEXT , cookie INTEGER, expires INTEGER, uuid TEXT)"
  );
});

function updateDataIntodb(database, colonne, updating, logging) {
  database.get(
    `SELECT containers FROM ${colonne} WHERE username = ?`,
    [logging],
    (err, row) => {
      let containers = [];
      if (row) {
        containers = JSON.parse(row.containers);
      }
      containers.push(updating);
      const updatedContainers = JSON.stringify(containers);

      database.run(
        `INSERT INTO ${colonne} (username, containers) VALUES (?, ?)`,
        [logging, updatedContainers],
        (err) => {
          if (err) {
            console.log(
              "Erreur lors de la création du serveur : " + err.message
            );
          } else {
            console.log("Fichier copié avec succès !");
            res.send(`${serverName} a bien été créé`);
          }
        }
      );
    }
  );
}

function findAvailablePort(callback, availablePort = 35000, maxPort = 65535) {
  if (availablePort > maxPort) {
    callback(null);
  } else {
    db.get(
      "SELECT 1 FROM servers WHERE port = ?",
      [availablePort],
      (err, row) => {
        if (row) {
          // Ce port est déjà attribué, essayez le suivant
          availablePort++;
          findAvailablePort(callback);
        } else {
          // Port disponible trouvé
          callback(availablePort);
        }
      }
    );
  }
}

function checkCookie(cookies) {
  const cookieName = "user";

  return new Promise((resolve, reject) => {
    if (!cookies || !Array.isArray(cookies) || cookies.length === 0) {
      resolve(false); // Ajout d'une vérification pour cookies undefined ou vide
      return;
    }

    for (var i = 0; i < cookies.length; i++) {
      var cookie = cookies[i].trim();
      if (cookie.startsWith(cookieName + "=")) {
        db.get("SELECT * FROM users WHERE cookie = ?", [cookie], (err, row) => {
          if (err) {
            reject(err);
          } else {
            if (row) {
              var expirationDays = 7;
              const expires = row.expires;
              const currentDate = Date.now();
              if (expires > currentDate) {
                resolve(true);
              } else {
                resolve(false);
              }
            } else {
              resolve(false);
            }
          }
        });
        return; // Ajout du return pour éviter l'exécution du "resolve(false)" en dehors du callback
      }
    }

    resolve(false);
  });
}

function PrintFileInDocker(DockerId, Filepath) {
  exec(`sudo docker cat ${DockerId}:${Filepath}`, (error, stdout, stderr) => {
    if (error) {
      console.error(`Erreur d'exécution : ${error.message}`);
      return;
    }
    if (stderr) {
      console.error(`Erreur de sortie standard : ${stderr}`);
      return;
    }
    console.log(`Sortie standard : ${stdout}`);
    return stdout;
  });
}

app.get("/gerer-op", (req, res) => {
  res.sendFile(__dirname + "/public/gerer-op.html");
});
app.get("/create-server", (req, res) => {
  res.sendFile(__dirname + "/public/create-server.html");
});
app.get("/check-server", (req, res) => {
  const serverName = req.query.name;
  db.get(
    "SELECT 1 FROM servers WHERE username = ?",
    [serverName],
    (err, row) => {
      if (row) {
        res.json({ exists: true });
      } else {
        res.json({ exists: false });
      }
    }
  );
});

app
  .route("/login")
  .get((req, res) => {
    if (req.cookies.user && checkCookie(req.cookies.user)) {
      res.redirect("/gerer-op");
    } else {
      res.sendFile(__dirname + "/public/login.html");
    }
  })
  .post((req, res) => {
    if (!checkCookie(req.cookies.user)) {
      return;
    }
    const { username, password } = req.body;

    db.get("SELECT * FROM users WHERE username = ?", [username], (err, row) => {
      if (err) {
        console.error(err.message);
        res.status(500).send("Erreur interne du serveur");
      } else if (row) {
        // L'utilisateur existe dans la base de données
        bcrypt.compare(password, row.password, (bcryptErr, bcryptRes) => {
          if (bcryptRes) {
            let userId;
            if (!row.uuid) {
              console.log("internal error");
              res.status(500).send("Internal server issue");
            } else {
              userId = row.uuid;
            }
            const expirationTime = 24 * 60 * 60 * 1000;
            const expirationDate = new Date(Date.now() + expirationTime);
            const token = jwt.sign({ userId }, secretKey, { expiresIn: "24h" });
            db.run(
              "UPDATE users SET cookie = ?, expires = ?WHERE username = ?",
              [token, expirationDate, row.username]
            );
            res.cookie("user", token, {
              expires: expirationDate,
              httpOnly: true,
              sameSite: "strict",
            });
            res.redirect("/gerer-op");
          } else {
            // Mot de passe incorrect
            res.status(401).send("Mot de passe incorrect");
          }
        });
      } else {
        // L'utilisateur n'existe pas
        res.status(401).send("Utilisateur non trouvé");
      }
    });
  });

// Endpoint pour gérer les opérateurs (GET pour obtenir la liste, POST pour ajouter, DELETE pour retirer)
app
  .route("/gerer-op/liste")
  .get((req, res) => {
    // Lire le contenu actuel du fichier ops.json
    const userCookie = req.cookies.user;
    if (checkCookie(userCookie)) {
      console.log(userCookie);
      db.get(
        "SELECT * FROM users WHERE cookie = ?",
        [userCookie],
        (err, row) => {
          if (row) {
            const username = row.username;
            srv.get(
              "SELECT * FROM servers WHERE username = ?",
              [username],
              (err, row) => {
                if (row.containers) {
                  servers_data = [];
                  serveurs = row.containers;
                  for (server in serveurs) {
                    data = PrintFileInDocker(server, containerFilePath);
                    const opsData = JSON.parse(servers_data);
                    servers_data.append(opsData);
                  }
                  try {
                    console.log(servers_data);
                    res.json(servers_data); // Renvoyer la liste des opérateurs au format JSON
                  } catch (e) {
                    console.error("Erreur inattendue : " + e.message);
                    res.status(500).send("Erreur inattendue : " + e.message);
                  }
                }
              }
            );
          } else {
            res.redirect("/login");
          }
        }
      );
    }
  })
  .post((req, res) => {
    const userCookie = req.cookies.user;
    const selectedContainerId = req.body.containerId;
    const joueur = req.body.nouveauJoueur; // Récupérer la valeur de nouveauJoueur depuis le corps de la requête
    if (!checkCookie(userCookie)) {
      res.redirect("/login");
    }
    if (typeof joueur === "string") {
      // Si joueur est une chaîne de caractères, alors vous pouvez appeler trim()
      const joueurTrimmed = joueur.trim();
      db.get(
        "SELECT username FROM servers WHERE cookie = ?",
        [userCookie],
        (err, row) => {
          if (row) {
            const username = row;
            srv.get(
              "SELECT 1 FROM servers WHERE username = ? AND containers LIKE ?",
              [username, `%${serverName}%`],
              (err, serverRow) => {
                if (serverRow) {
                  exec(
                    `sudo docker exec -it ${selectedContainerId} jq '. += [${joueurTrimmed}]' data.json > temp.json && mv temp.json data.json`,
                    (error, stdout, stderr) => {
                      if (error) {
                        console.error(`Erreur d'exécution : ${error.message}`);
                        return;
                      }
                      console.log("Fichier copié avec succès !");
                      res.send(`${joueur} est maintenant opérateur.`); // Envoyer une réponse au client
                    }
                  );
                }
              }
            );
          }
        }
      );
    }
  })
  .delete((req, res) => {
    const userCookie = req.cookies.user;
    const selectedContainerId = req.body.containerId;
    const joueur = req.body.nouveauJoueur; // Récupérer la valeur de nouveauJoueur depuis le corps de la requête
    if (!checkCookie(userCookie)) {
      res.redirect("/login");
    }
    if (typeof joueur === "string") {
      // Si joueur est une chaîne de caractères, alors vous pouvez appeler trim()
      const joueurTrimmed = joueur.trim();
      db.get(
        "SELECT username FROM servers WHERE cookie = ?",
        [userCookie],
        (err, row) => {
          if (row) {
            const username = row;
            srv.get(
              "SELECT 1 FROM servers WHERE username = ? AND containers LIKE ?",
              [username, `%${serverName}%`],
              (err, serverRow) => {
                if (serverRow) {
                  exec(
                    `sudo docker exec -it ${selectedContainerId} jq '. -= [${joueurTrimmed}]' data.json > temp.json && mv temp.json data.json`,
                    (error, stdout, stderr) => {
                      if (error) {
                        console.error(`Erreur d'exécution : ${error.message}`);
                        return;
                      }
                      console.log("Fichier copié avec succès !");
                      res.send(`${joueur} a été retiré des opérateurs.`); // Envoyer une réponse au client
                    }
                  );
                }
              }
            );
          }
        }
      );
    }
  });

// Endpoint pour créer un serveur Minecraft
app.post("/create-server", (req, res) => {
  const serverName = req.body.serverName;
  const userCookie = req.cookies.user;

  db.get(
    "SELECT * FROM users WHERE cookie = ?",
    [userCookie],
    (err, userRow) => {
      if (userRow) {
        const username = userRow.username;

        // Vérifier si l'utilisateur a déjà un serveur avec le même nom
        srv.get(
          "SELECT 1 FROM servers WHERE username = ? AND containers LIKE ?",
          [username, `%${serverName}%`],
          (err, serverRow) => {
            if (serverRow) {
              res.send("Vous avez déjà un serveur avec le même nom.");
            } else {
              // Trouver un port non attribué (exemple : commencez par 30000)
              let availablePort = 20000;
              const maxPort = 25564; // Port maximum autorisé

              findAvailablePort(
                (port) => {
                  if (port === null) {
                    res.send("Aucun port disponible pour créer un serveur.");
                  } else {
                    // Mettre à jour la liste des conteneurs de l'utilisateur
                    const dockerProcess = `docker run -d --name ${serverName} -p ${port}:25565 minocraft`;

                    exec(dockerProcess, (error, stdout, stderr) => {
                      if (error) {
                        console.error(
                          "Erreur lors de la copie du fichier :",
                          error
                        );
                        return res
                          .status(500)
                          .send("Erreur lors de la copie du fichier.");
                      }

                      const newContainer = {
                        name: serverName,
                        port: port,
                      };

                      // Mettre à jour la liste des conteneurs dans la base de données
                      updateDataIntodb(srv, servers, serverName, username);
                      updateDataIntodb(srv_run, runnings, serverName, username);
                    });
                  }
                },
                availablePort,
                maxPort
              );
            }
          }
        );
      }
    }
  );
});
app
  .route("/register")
  .get((req, res) => {
    res.sendFile(__dirname + "/public/register.html");
  })
  .post((req, res) => {
    const { username, password } = req.body;

    // Perform server-side validation if needed

    // Check if the username is already taken
    db.get("SELECT * FROM users WHERE username = ?", [username], (err, row) => {
      if (err) {
        console.error(err.message);
        res
          .status(500)
          .json({ success: false, message: "Internal Server Error" });
      } else if (row) {
        res.json({ success: false, message: "Username is already taken" });
      } else {
        // Hash the password before storing it
        bcrypt.hash(password, 10, (hashErr, hashedPassword) => {
          if (hashErr) {
            console.error(hashErr.message);
            res
              .status(500)
              .json({ success: false, message: "Internal Server Error" });
          } else {
            userId = uuid.v4();
            // Store user information in the database
            db.run(
              "INSERT INTO users (username, password, uuid) VALUES (?, ?, ?)",
              [username, hashedPassword, userId],
              (insertErr) => {
                if (insertErr) {
                  console.error(insertErr.message);
                  res
                    .status(500)
                    .json({ success: false, message: "Internal Server Error" });
                } else {
                  res.json({
                    success: true,
                    message: "Registration successful",
                  });
                }
              }
            );
          }
        });
      }
    });
  });

app.listen(port, () => {
  console.log(`Le serveur est en écoute sur le port ${port}`);
});
