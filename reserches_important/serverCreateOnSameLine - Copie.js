// ...

srv.serialize(() => {
  srv.run(
    "CREATE TABLE IF NOT EXISTS servers (username TEXT, containers TEXT, port INTEGER, password TEXT)"
  );
});

// ...

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
              let availablePort = 30000;
              const maxPort = 65535; // Port maximum autorisé
              // Mettre à jour la liste des conteneurs de l'utilisateur
              const dockerProcess = `docker run -d --name ${serverName} -p ${port}:25565 minocraft`;

              exec(dockerProcess, (error, stdout, stderr) => {
                if (error) {
                  console.error("Erreur lors de la copie du fichier :", error);
                  return res
                    .status(500)
                    .send("Erreur lors de la copie du fichier.");
                }

                const newContainer = {
                  name: serverName,
                  port: port,
                };

                // Mettre à jour la liste des conteneurs dans la base de données
                srv.get(
                  "SELECT containers FROM servers WHERE username = ?",
                  [username],
                  (err, row) => {
                    let containers = [];
                    if (row) {
                      containers = JSON.parse(row.containers);
                    }
                    containers.push(newContainer);
                    const updatedContainers = JSON.stringify(containers);

                    srv.run(
                      "INSERT INTO servers (username, containers) VALUES (?, ?)",
                      [username, updatedContainers],
                      (err) => {
                        if (err) {
                          res.send(
                            "Erreur lors de la création du serveur : " +
                              err.message
                          );
                        } else {
                          console.log("Fichier copié avec succès !");
                          res.send(`${serverName} a bien été créé`);
                        }
                      }
                    );
                  }
                );
              });
            }
          }
        );
      }
    }
  );
});

// ...
