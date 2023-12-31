const express = require("express");
const Docker = require("dockerode");
const { docker } = new Docker();
const fs = require("fs");
const app = express();
const port = 3000;
const { exec } = require("child_process");
const containerId = "compassionate_franklin"; // Remplacez par le nom du conteneur Docker
const localFilePath = __dirname + "/files/ops.json";
const containerFilePath = "/minecraft/ops.json";
const docker_Command = `docker cp ${localFilePath} ${containerId}:/minecraft/ops.json`;
const sqlite3 = require("sqlite3").verbose();
const cookieParser = require("cookie-parser");
const bcrypt = require("bcrypt");
const md5 = require("md5");
const srv = new sqlite3.Database("serveurs.db");
const srv_run = new sqlite3.Database("serveurs_running.db");
const db = new sqlite3.Database("login.db");
const uuid = require("uuid");
const jwt = require("jsonwebtoken");
const bodyParser = require("body-parser");
cookie = require("cookie-parser");

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
srv_run();
srv.serialize(() => {
  srv.run(
    "CREATE TABLE IF NOT EXISTS servers (username TEXT, containers TEXT, password TEXT)"
  );
});
srv.serialize(() => {
  srv.run(
    "CREATE TABLE IF NOT EXISTS servers_runnuing (username TEXT, containers TEXT, port INTEGER)"
  );
});
db.serialize(() => {
  db.run(
    "CREATE TABLE IF NOT EXISTS users ( username TEXT UNIQUE, password TEXT , cookie INTEGER, expires INTEGER, uuid TEXT)"
  );
});

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
function updatefile(FilePathUrl, username) {
  const docker_command_read = `docker cp ${containerId}:/minecraft/ops.json ${FilePathUrl}`;
  exec(docker_command_read, (error, stdout, stderr) => {
    if (error) {
      console.error("Erreur lors de la copie du fichier :", error);
      return res.status(500).send("Erreur lors de la copie du fichier.");
    }
  });
}

function checkCookie(cookies) {
  const cookieName = "user";

  for (var i = 0; i < cookies.length; i++) {
    var cookie = cookies[i].trim();
    if (cookie.startsWith(cookieName + "=")) {
      db.get(
        "SELECT * FROM servers WHERE cookie = ?",
        [cookieName],
        (err, row) => {
          if (row) {
            var expirationDays = 7;
            const expires = Date.now() + expirationDays;
            if (row.expires < expires) {
              return true;
            } else {
              return false;
            }
          } else {
            return false;
          }
        }
      );
    }
  }

  return false;
}

function get_ops(dockerid) {
  const FilePathUrl = __dirname + "/files/ops.json";
  const docker_command_read = `sudo docker cp ${containerId}:/minecraft/ops.json ${FilePathUrl}`;
  exec(docker_command_read, (error, stdout, stderr) => {
    if (error) {
      console.error(
        "Erreur lors de l'exécution de la commande :",
        error.message
      );
      return;
    }
    if (stdout) {
      return console.log(stdout);
    }
    return;
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
              userId = uuid.v4();
              db.run("UPDATE users SET uuid = ?WHERE username = ?", [
                userId,
                row.username,
              ]);
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
            data = PrintFileInDocker(containerId, containerFilePath);

            try {
              console.log(data);
              const opsData = JSON.parse(data);
              res.json(opsData); // Renvoyer la liste des opérateurs au format JSON
            } catch (e) {
              console.error("Erreur inattendue : " + e.message);
              res.status(500).send("Erreur inattendue : " + e.message);
            }
          } else {
            res.redirect("/login");
          }
        }
      );
    }
  })
  .post((req, res) => {
    const containerId = req.body.containerId;
    const joueur = req.body.nouveauJoueur; // Récupérer la valeur de nouveauJoueur depuis le corps de la requête

    if (typeof joueur === "string") {
      // Si joueur est une chaîne de caractères, alors vous pouvez appeler trim()
      const joueurTrimmed = joueur.trim();

      // Chemin local vers le fichier ops.json (dans le même répertoire que votre Dockerfile)
      const opsJsonPath = __dirname + "/files/ops.json";

      // Lire le contenu actuel du fichier ops.json
      fs.readFile(opsJsonPath, "utf8", (err, data) => {
        if (err) {
          return res.send(
            "Erreur lors de la lecture du fichier ops.json : " + err.message
          );
        }

        try {
          // Parse le contenu JSON
          const opsData = JSON.parse(data);

          // Ajoute le joueur à la liste des opérateurs s'il n'existe pas déjà
          if (!opsData.includes(joueurTrimmed)) {
            opsData.push(joueurTrimmed);
            const updatedOpsData = JSON.stringify(opsData, null, 2);
            // Écriture du fichier ops.json avec le nouveau joueur opérateur
            fs.writeFile(opsJsonPath, updatedOpsData, "utf8", (err) => {
              if (err) {
                return res.send(
                  "Erreur lors de l'écriture du fichier ops.json : " +
                    err.message
                );
              } else {
                exec(dockerCommand, (error, stdout, stderr) => {
                  if (error) {
                    console.error(
                      "Erreur lors de la copie du fichier :",
                      error
                    );
                    return res
                      .status(500)
                      .send("Erreur lors de la copie du fichier.");
                  }
                  console.log("Fichier copié avec succès !");
                  res.send(`${joueur} est maintenant opérateur.`); // Envoyer une réponse au client
                });
              }
            });
          } else {
            res.send(`${joueur} est déjà opérateur.`); // Envoyer une réponse au client
          }
        } catch (e) {
          console.error("Erreur inattendue : " + e.message);
          res.status(500).send("Erreur inattendue : " + e.message);
        }
      });
    } else {
      res.status(400).send("Le nom du joueur n'est pas valide.");
    } // Nom du joueur à ajouter
  })
  .delete((req, res) => {
    const joueur = req.body.joueur; // Nom du joueur à retirer

    // Chemin local vers le fichier ops.json (dans le même répertoire que votre Dockerfile)
    const opsJsonPath = __dirname + "/files/ops.json";

    // Lire le contenu actuel du fichier ops.json
    fs.readFile(opsJsonPath, "utf8", (err, data) => {
      if (err) {
        return res.send(
          "Erreur lors de la lecture du fichier ops.json : " + err.message
        );
      }

      try {
        // Parse le contenu JSON
        const opsData = JSON.parse(data);

        // Vérifie si le joueur existe dans la liste des opérateurs
        const index = opsData.indexOf(joueur);
        if (index === -1) {
          return res.send(`Le joueur ${joueur} n'est pas un opérateur.`);
        }

        // Retire le joueur de la liste des opérateurs
        opsData.splice(index, 1);

        // Convertit les données modifiées en JSON
        const updatedOpsData = JSON.stringify(opsData, null, 2);

        // Écris les données mises à jour dans le fichier ops.json
        fs.writeFile(opsJsonPath, updatedOpsData, "utf8", (err) => {
          if (err) {
            return res.send(
              "Erreur lors de l'écriture du fichier ops.json : " + err.message
            );
          }

          exec(dockerCommand, (error, stdout, stderr) => {
            if (error) {
              console.error("Erreur lors de la copie du fichier :", error);
              return res
                .status(500)
                .send("Erreur lors de la copie du fichier.");
            }
            console.log("Fichier copié avec succès !");
            res.send(`Le joueur ${joueur} a été retiré des opérateurs.`); // Envoyer une réponse au client
          });
        });
      } catch (e) {
        console.error("Erreur inattendue : " + e.message);
        res.status(500).send("Erreur inattendue : " + e.message);
      }
    });
  });

// Endpoint pour créer un serveur Minecraft
app.post("/create-server", (req, res) => {
  console.log("1");
  const serverName = req.body.serverName;
  const userCookie = req.cookies.user;
  db.get("SELECT * FROM servers WHERE cookie = ?", [userCookie], (err, row) => {
    // Vérifier à nouveau si le nom de serveur existe déjà
    if (row) {
      srv.get(
        "SELECT * FROM servers WHERE containers = ?",
        [row.username],
        (err, row) => {
          if (row) {
            res.send(
              "Ce nom de serveur est déjà utilisé. Veuillez choisir un autre nom."
            );
          } else {
            findAvailablePort((port) => {
              if (port === null) {
                res.send("Aucun port disponible pour créer un serveur.");
              } else {
                srv.run(
                  "INSERT INTO servers (containers,username) VALUES (?, ?)",
                  [serverName, row.username],
                  (err) => {
                    if (err) {
                      res.send(
                        "Erreur lors de la création du serveur : " + err.message
                      );
                    } else {
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
                        console.log("Fichier copié avec succès !");
                        res.send(`${serverName} a bien été crée`); // Envoyer une réponse au client
                      });
                    }
                  }
                );
              }
            });
          }
        }
      );
    }
  });
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
