import {MongoClient, ServerApiVersion} from "mongodb";
const client = new MongoClient(process.env.MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });
await client.connect();
const db = client.db(process.env.MONGODB_DATABASE || client.options.dbName);
export default db;