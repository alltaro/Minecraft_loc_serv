import { getUserServersDictionaryFromToken } from "~/utils/docker";

export default defineEventHandler(async (event) => {
    console.log()
    const body = await readBody(event);
    const token = body.token;
    if (token) {
        // Utiliser await pour récupérer les serveurs
        const servers = await getUserServersDictionaryFromToken(token);
        return { success: true, servers: servers };
    }
    return { success: false, servers: {} };
});
