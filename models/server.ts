import mongoose, { Schema, Document } from "mongoose";

interface IServer extends Document {
  serverName: string;
  port: string;
  status: string;
  username: string;
  dockerId: string;
}

const ServerSchema: Schema = new Schema({
  serverName: { type: String, required: true },
  port: { type: String },
  status: { type: String, required: true },
  username: { type: String, required: true },
  dockerId: { type: String, required: true },
});

export default mongoose.models.Server ||
  mongoose.model<IServer>("Server", ServerSchema);
