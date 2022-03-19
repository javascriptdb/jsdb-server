import express from "express";
import {MongoClient} from "mongodb";
import jwt from "jsonwebtoken";
import cors from "cors";
import fs from "fs";
const client = new MongoClient(process.env.mongoUri || 'mongodb://localhost:27017');
await client.connect();

let db = client.db('jsdb');
let rules = {};
rules.users = await import ("data:text/javascript;base64," + btoa(fs.readFileSync('.jsdb/dbRules/users.js', 'utf8')));
// db.collection('users').createIndex({"credentials.email": 1}, {unique: true})

const app = express();
app.use(cors());
app.use(express.json());
app.use((req, res, next) => {
  const token = req.headers['Authorization'];
  if(token) {
    try {
      req.decodedToken = jwt.verify(token, 'secret');
    } catch (e) {
      res.status(500).send(e);
    }
  }
  next()
})
const port = 3001;

app.post('/auth/sign-up', async (req, res) => {
  try {
    const credentials = req.body.credentials;
    const result = await db.collection('users').insertOne({
      credentials,
    });

    const token = jwt.sign({
      uid: result.insertedId,
      credentials
    }, 'secret', {expiresIn: '10 d'});
    res.send({token});
  } catch (e) {
    console.error(e);
    res.status(500).send(e);
  }
});

app.post('/auth/sign-in', async (req, res) => {
  try {
    const result = await db.collection('users').findOne({credentials: req.body.credentials});
    if (!result) {
      throw new Error('Invalid credentials')
    }
    const token = jwt.sign({
      uid: result._id,
      credentials: req.body.credentials
    }, 'secret', {expiresIn: '1 year'});
    res.send({token});
  } catch (e) {
    console.error(e);
    res.status(500).send(e);
  }
});

app.post('/auth/verify', async (req, res) => {
  try {
    const decodedToken = jwt.verify(req.body.token, 'secret');
    res.status(200);
  } catch (e) {
    console.error(e);
    res.status(500).send(e);
  }
})

app.post('/op/object/get', async (req, res) => {
  try {
    const [collection, id] = req.body;
    // TODO : security rules should return truthy, if is an object and contains a fields property we should filter results from there
    if(await rules[collection]?.get?.({req, collection, id})) {
      const result = await db.collection(collection).findOne({"_id": id});
      res.send(result || {});
    }
  } catch (e) {
    console.error(e);
    res.status(500).send(e);
  }
});

app.post('/op/object/set', async (req, res) => {
  try {
    const [collection, id, value] = req.body;
    if(await rules[collection]?.set?.({req, collection, id, value})) {
      await db.collection(collection).updateOne({"_id": id}, {'$set': value}, {upsert: true});
      res.sendStatus(200);
    }
  } catch (e) {
    console.error(e);
    res.status(500).send(e);
  }
});

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`)
});