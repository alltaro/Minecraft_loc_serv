// server/api/user.ts
import { defineEventHandler, readBody } from "h3";
import { getUserInfo } from "~/utils/auth"; // Assurez-vous que le chemin est correct

export default defineEventHandler(async (event) => {
  const body = await readBody(event);
  const token = body.token;

  if (!token) {
    return { error: "Token is required", userInfo: null };
  }

  interface UserInfos {
    username: string;
    email: string;
  }

  let userInfo: UserInfos | null = null;

  try {
    // Obtenez les informations de l'utilisateur
    const datas = await getUserInfo(token);

    if (
      datas &&
      typeof datas === "object" &&
      "username" in datas &&
      "email" in datas
    ) {
      userInfo = datas as UserInfos; // Assurez-vous que le type est correct
    }
  } catch (error) {
    return {
      statusCode: 400,
      statusMessage: "Invalid token or user not found",
      userInfo: null,
    };
  }

  return { userInfo };
});
