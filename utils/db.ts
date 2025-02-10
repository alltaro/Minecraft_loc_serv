import mongoose from "mongoose";

export const connectToUsersDB = async () => {
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect("mongodb://192.168.1.33:27017/users"); // Aucune option supplémentaire n'est nécessaire dans Mongoose 6.x
    console.log("Connected to MongoDB");
  }
};

export const connectToServerDB = async () => {
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect("mongodb://192.168.1.33:27017/servers");
    console.log("Connected to MongoDB");
  }
};
