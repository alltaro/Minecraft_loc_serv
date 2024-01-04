// ...

srv.serialize(() => {
  srv.run(
    "CREATE TABLE IF NOT EXISTS servers (username TEXT, containers TEXT, port INTEGER, password TEXT)"
  );
});

// ...  
  
 function updateDataIntodb(database, colonne, updating, logging){
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
}

app.post("/create-server", (req, res) => {
  const serverName = req.body.serverName;
  const userCookie = req.cookies.user;

  srv.get(
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
                      updateDataIntodb(srv, servers, serverName,username)
                      updateDataIntodb(srv_run, servers, serverName,username)
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

// ...
