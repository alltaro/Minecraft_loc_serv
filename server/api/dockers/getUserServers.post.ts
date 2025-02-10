import { defineEventHandler, readBody } from 'h3'; // Pour gérer les requêtes dans Nuxt 3
import { getUserServersDictionaryFromToken} from '~/utils/docker';
import { getUsernameFromToken } from '~/utils/jwt';
export default defineEventHandler(async (event) => {
  try {

    // Lire le corps de la requête pour extraire le token
    const body = await readBody(event);
    const token = body.token;
    console.log(token)
    if (!token) {
      return {
        statusCode: 400,
        body: { error: 'Token manquant dans la requête' },
      };
    }

    // Appel de la fonction utilitaire pour récupérer les serveurs de l'utilisateur
    const servers = await getUserServersDictionaryFromToken(token);
    console.log(`servers : ${servers}`)

    return {
      statusCode: 200,
      body: { servers },
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: { error: `Erreur lors de la récupération des serveurs : ${ error.message}` },
    };
  }
});
