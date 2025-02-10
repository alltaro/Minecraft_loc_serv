import jwt from "jsonwebtoken";
import User from "../models/User";
import { connectToUsersDB } from "~/utils/db";
import type { H3Event } from "h3";
import { _useSession } from "./session";
import { verifyJWT } from "./jwt";

export async function getUserInfo(token: string) {
  await connectToUsersDB();

  try {
    // Décoder le token pour id
    const decoded = jwt.verify(
      token,
      "6404f35f37147bca8b50c17e52425a70af0e4b4c7a47942046b305b07a2aac6a"
    ) as jwt.JwtPayload;

    // find User by id
    const user = await User.findById(decoded.id);
    if (
      !user ||
      typeof user.username !== "string" ||
      typeof user.email !== "string"
    ) {
      throw new Error("User not found or invalid data");
    }

    // return valid user information
    return { username: user.username, email: user.email };
  } catch (error) {
    throw new Error("Invalid token or user not found");
  }
}

export async function getAuth(event: H3Event) {
  //  return getCookie(event, 'authorization')
  return (await _useSession(event)).data.email;
}

export function ValidateUsername(username: string){
  return new Promise((resolve, reject) => {
    const pattern = /^[a-zA-Z0-9_]*$/;
  if (username.length < 3 ) {
    reject("3 caracters min")
  } else if (!pattern.test(username)) {
    reject("Username can only contain letters, numbers and underscore");
  } else {
    resolve
  }
  })
}

export async function requireAuth(event: H3Event) {
  const token = await getAuth(event);

  if (!token)
    throw createError({
      statusCode: 401,
      statusText: "Unauthorized! token invalid.",
    });

  const payload = await verifyJWT(token);

  return payload;
}
