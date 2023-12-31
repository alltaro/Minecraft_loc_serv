const express = require("express");
const fs = require("fs");
const bodyParser = require("body-parser");

const app = express();
app.use(bodyParser.json());

app.post("/upload", (req, res) => {
  const filename = req.body.filename;
  const content = req.body.content;

  fs.writeFile(`./upload/${filename}`, content, "base64", function (err) {
    if (err) {
      console.log("Il y a eu une erreur lors de l'écriture du fichier.", err);
      res.sendStatus(500);
    } else {
      console.log(`Fichier ${filename} écrit avec succès.`);
      res.sendStatus(200);
    }
  });
});

app.post("/saveFileContent", (req, res) => {
  console.log("try");
  const file_content = req.body.content;
  const filename = req.body.filename;
  fs.writeFile("./upload/" + filename, file_content, function (err) {
    if (err) {
      console.log("Il y a eu une erreur lors de l'écriture du fichier.", err);
    } else {
      console.log("Fichier écrit avec succès.");
    }
  });
});

app.get("/", (req, res) => {
  res.sendFile(__dirname + "/download.html");
});

app.get("/new", (req, res) => {
  res.sendFile(__dirname + "/download_new.html");
});
app.get("/ai", (req, res) => {
  res.sendFile(__dirname + "/downld_ai.html");
});
app.listen(3000, () => console.log("Server started on port 3000"));
