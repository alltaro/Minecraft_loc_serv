import { getUsernameFromToken } from "~/utils/jwt";
import { connectToServerDB } from "~/utils/db";
import Server from "~/models/server";
import Docker from "dockerode"; 

// Crée une instance de Dockerode pour interagir avec Docker
const docker = new Docker({ socketPath: '/var/run/docker.sock' });

export default defineEventHandler(async (event) => {
  try {
    const { token, dockerId } = await readBody(event);

    const username = await getUsernameFromToken(token);

    await connectToServerDB();

    const server = await Server.findOne({ dockerId, username });

    if (!server) {
      return { error: "Serveur non trouvé ou accès refusé." };
    }

    // Récupère l'état du conteneur Docker
    const container = docker.getContainer(dockerId);
    const containerInfo = await container.inspect();

    const isRunning = containerInfo.State.Running;

    return {
      serverName: server.serverName, 
      dockerId: server.dockerId,
      status: isRunning ? "running" : "stopped",
      state: containerInfo.State,
    };
  } catch (error) {
    console.error("Erreur lors de la récupération de l'état du serveur:", error);
    return { error: "Erreur lors de la récupération de l'état du serveur." };
  }
});
