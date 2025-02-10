import { createDockerServer } from "~/utils/docker";
import { readBody, createError, getHeader } from "h3";
import { isServerAvailable } from "~/utils/docker";

export default defineEventHandler(async (event) => {
  // Lire le corps de la requête
  const body = await readBody(event);
  const { serverName } = body;

  // Vérifier que le nom du serveur est fourni
  if (!serverName) {
    throw createError({
      statusCode: 400,
      statusMessage: "Server name is required",
    });
  }

  // Lire le token d'authentification depuis les en-têtes
  const token = getHeader(event, "authorization")?.replace("Bearer ", "");

  // Vérifier que le token est présent
  if (!token) {
    throw createError({
      statusCode: 401,
      statusMessage: "Authorization token is required",
    });
  }
  if (!isServerAvailable) {
    throw createError({
      statusCode: 401,
      statusMessage: "ServerName already taken",
    });
  }

  try {
    // Appeler la fonction pour créer le serveur Docker
    const result = await createDockerServer(serverName, token);
    return { success: true, message: result };
  } catch (error) {
    console.error(`Error creating server: ${error}`);
    return { success: false, message: `Failed to create Docker server: ` };
  }
});