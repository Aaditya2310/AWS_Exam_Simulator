import { MongoClient } from "mongodb";

const uri = process.env.MONGODB_URI;
const dbName = process.env.MONGODB_DB || "aws_exam_simulator";

if (!uri) {
  throw new Error("Missing MONGODB_URI in environment.");
}

const client = new MongoClient(uri);
await client.connect();

export const db = client.db(dbName);

export const users = db.collection("users");
export const sessions = db.collection("sessions");
export const attempts = db.collection("attempts");

await Promise.all([
  users.createIndex({ email: 1 }, { unique: true }),
  sessions.createIndex({ user_id: 1, id: 1 }, { unique: true }),
  attempts.createIndex({ user_id: 1, created_at: -1 }),
  attempts.createIndex({ created_at: -1 }),
]);

console.log(`Connected to MongoDB database: ${dbName}`);
