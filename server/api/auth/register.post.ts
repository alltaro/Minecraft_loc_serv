import { defineEventHandler, readBody } from "h3";
import bcrypt from "bcryptjs";
import User from "../../../models/User";
import { connectToUsersDB } from "~/utils/db";

export default defineEventHandler(async (event) => {
  console.log("connection")
  await connectToUsersDB();
  console.log("connected")
  let rgst = true;
  let msg = "User registered successfully";
  const body = await readBody(event);
  const { username, email, password } = body;
  // Hash mdp
  if (!username || !email || !password) {
    throw new Error("Tous les champs sont requis");
  }

  const hashedPassword = await bcrypt.hash(password, 10);
  // New user
  try {
    console.log("request")
    const user = new User({ username, email, password: hashedPassword });
    await user.save();
  } catch (error) {
    console.log("une erreur");
    msg = "username or email already taken";
    rgst = false;
  } 
  console.log("cbon");
  return { message: msg, registered: rgst };
});
