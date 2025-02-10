import { defineEventHandler } from 'h3';
import Docker from 'dockerode';
import { connectToServerDB } from '~/utils/db';
import Server from '~/models/server';
import { getUsernameFromToken } from '~/utils/jwt';

const docker = new Docker({ timeout: 60000 });

export default defineEventHandler(async (event) => {
  const body = await readBody(event);
  const { token, serverName } = body;

  // Vérification du token et récupération de l'utilisateur
  const username = await getUsernameFromToken(token);
  console.log(username)
  if (!username) {
    return { error: 'Invalid token' };
  }

  // Connexion à la base de données
  await connectToServerDB();

  // Vérification que l'utilisateur possède bien ce serveur
  const server = await Server.findOne({ serverName, username });
  if (!server) {
    return { error: 'Server not found or not authorized' };
  }

  try {
    // Démarrer le conteneur Docker
    const container = docker.getContainer(server.dockerId);
    await container.start();

    return { message: 'Server started successfully' };
  } catch (error) {
    return { error: `Failed to start server: on function` };
  }
});
