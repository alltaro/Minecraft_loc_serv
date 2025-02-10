import { SignJWT, jwtVerify } from "jose";
import type { AuthPayload } from "~/types";
import { useRuntimeConfig } from "#imports"; // Import correct
import { getUserInfo } from "~/utils/auth"; // Chemin correct vers ta fonction

const config = useRuntimeConfig();
const JWT_SECRET = new TextEncoder().encode("6404f35f37147bca8b50c17e52425a70af0e4b4c7a47942046b305b07a2aac6a" as string);

export async function createJWT(email: string) {
  // Créer le JWT
  return await new SignJWT({ email })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer("mongoose-auth.nuxt.space")
    .setIssuedAt()
    .setExpirationTime("2h")
    .sign(JWT_SECRET);
}

export async function verifyJWT(token: string) {
  const config = useRuntimeConfig();
  const JWT_SECRET = new TextEncoder().encode("6404f35f37147bca8b50c17e52425a70af0e4b4c7a47942046b305b07a2aac6a" as string); // Cast explicite à 'string'

  // Vérifier et retourner le payload du JWT
  return (await jwtVerify(token, JWT_SECRET)).payload as AuthPayload;
}

interface useIn {
  username:string;
  email:string;
}

export async function getUsernameFromToken(token: string): Promise<string> {
  // Utiliser getUserInfo pour récupérer l'username
  const userInfo = await getUserInfo(token);
  if (typeof userInfo.username === "string" && typeof userInfo.email === "string") {
    // Retourner uniquement le nom d'utilisateur
    return userInfo.username;
  } else {
    throw new Error("Invalid token or user info");
  }
}

