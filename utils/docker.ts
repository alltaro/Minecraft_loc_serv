import Server from "~/models/server"; // Assure-toi que le chemin est correct
import { connectToServerDB } from "~/utils/db";
import { exec } from "child_process";
import { v4 as uuidv4 } from "uuid"; // Importer la fonction uuidv4
import { getUsernameFromToken } from "./jwt";
import Docker from 'dockerode';
const containerFilePath = "/minecraft/ops.json";
const docker = new Docker({
  timeout: 60000, // Augmente le timeout à 60 secondes
}); // Instanciation de Dockerode

interface IServer {
  serverName: string;
  dockerId: string;
  _id: string;
}


export async function createDockerServer(serverName: string, token: string) {
  const username = await getUsernameFromToken(token);
  const dockerId = uuidv4();

  try {
    // Créer le conteneur Docker avec dockerode
    const container = await docker.createContainer({
      Image: 'minocraft', // Remplace par le nom de ton image Docker
      name: dockerId,
      Tty: true, // Si tu veux un terminal interactif
    });

    await container.start(); // Démarrer le conteneur

    // Connexion à la base de données et enregistrement du serveur
    await connectToServerDB();

    const newServer = new Server({
      serverName,
      port: "",
      status: "false",
      username,
      dockerId,
    });

    await newServer.save();

    return { message: "Server created and saved to database" };
  } catch (error) {
    throw new Error(`Failed to create Docker server: on create function`);
  }
} 



export const getUserServersDictionaryFromToken = async (
  token: string
): Promise<{ [serverName: string]: string }> => {
  const username = await getUsernameFromToken(token);

  await connectToServerDB();

  const servers = await Server.find({ username }).select("serverName dockerId");

  const serverDictionary: { [serverName: string]: string } = {};

  servers.forEach((server) => {
    if (typeof server.serverName === "string" && typeof server.dockerId === "string") {
      serverDictionary[server.serverName] = server.dockerId;
    }
  });

  return serverDictionary;
};



export async function getOperators(token: string, idDocker: string) {
  const username = await getUsernameFromToken(token);
  
  // Vérifier si l'utilisateur possède un serveur avec le dockerId donné
  const prop = await hasUserServerWithName(username, idDocker);

  // Logique à suivre en fonction de `prop`
  if (prop) {
    console.log("L'utilisateur possède un serveur avec ce dockerId.");
  } else {
    console.log("L'utilisateur ne possède pas de serveur avec ce dockerId.");
  }
}


export const hasUserServerWithName = async (
  username: string,
  dockerId: string
): Promise<boolean> => {
  // Connexion à la base de données
  await connectToServerDB();

  // Recherche du serveur qui correspond à l'utilisateur et au nom du serveur
  const server = await Server.findOne({ username, dockerId });

  return !!server;
};

export const isServerAvailable = async (
  token: string,
  serverName: string
): Promise<boolean> => {
  
  const username = await getUsernameFromToken(token);
  // Connexion à la base de données
  await connectToServerDB();

  // Recherche du serveur qui correspond à l'utilisateur et au nom du serveur
  const server = await Server.findOne({ username, serverName });

  return !server;
};


export const getUserServersIdNames = async (
  username: string
): Promise<IServer[]> => {
  // Connexion à la base de données
  await connectToServerDB();

  // Recherche tous les serveurs liés à l'utilisateur avec leur `serverName`, `_id`, et `dockerId`
  const servers = await Server.find({ username }).select(
    "serverName _id dockerId"
  );

  // Validation des données
  const validatedServers = servers.filter((server) => {
    return (
      typeof server.serverName === "string" &&
      typeof server.dockerId === "string"
    );
  });

  // Renvoie la liste validée des serveurs avec leur `serverName`, `_id`, et `dockerId`
  return validatedServers as IServer[];
};

export async function PrintOperators(DockerId: string) {
  return new Promise((resolve, reject) => {
    exec(
      `sudo docker cat ${DockerId}:${containerFilePath}`,
      (error, stdout, stderr) => {
        if (error) {
          reject(`Erreur d'exécution : ${error.message}`);
          return;
        }
        if (stderr) {
          reject(`Erreur de sortie standard : ${stderr}`);
          return;
        }
        resolve(`Sortie standard : ${stdout}`);
        return stdout;
      }
    );
  });
}
