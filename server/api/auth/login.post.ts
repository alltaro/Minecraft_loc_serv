import { defineEventHandler, readBody } from "h3";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import User from "../../../models/User";
import { connectToUsersDB } from "~/utils/db";
let defaul = true;

export default defineEventHandler(async (event) => {
  console.log("start process");
  await connectToUsersDB();

  const body = await readBody(event);
  const { email, password } = body;
  const username = email
  console.log('check db')
  //request db
  let user = await User.findOne({ email });
  if (!user) {
    console.log("trying with username")
    user = await User.findOne({ username });
    if (!user) {
    console.log("!user")
    throw createError({
      statusCode: 400,
      statusMessage: "Invalid credentials",
    });
  }}
  console.log('check psw')

  //check pswd
  const isPasswordValid = await bcrypt.compare(password, user.password);
  if (!isPasswordValid) {
    throw createError({
      statusCode: 400,
      statusMessage: "Invalid credentials",
    });
  }
  console.log('creation token')
  // token JWT
  const token = jwt.sign(
    { id: user._id, email: user.email },
    "6404f35f37147bca8b50c17e52425a70af0e4b4c7a47942046b305b07a2aac6a"
  );

  console.log("return token");
  return { token: token, loggedIn: true };
});
