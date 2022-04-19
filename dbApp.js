import express from 'express';
import db from './db.js';
import {VM} from "vm2";
import {rules, triggers} from "./lifecycleMiddleware.js";
import operationFallback from "./operationFallback.js";
import {ObjectID} from "mongodb";
import _ from "lodash-es";

const app = express();

function documentId(id) {
   return ObjectID.isValid(id) ? ObjectID(id) : id;
}

app.use(async (req, res, next) => {
  const {collection} = req.body;
  const method = req.path.replaceAll('/', '');
  const ruleFunction = rules[collection]?.[method]
    || rules[collection]?.[operationFallback[method]]
    || rules[collection]?.default
    || rules.default?.[method]
    || rules.default?.[operationFallback[method]]
    || rules.default?.default;

  if (!ruleFunction) {
    console.warn(`No rule defined for ${collection} method ${method}`);
  } else {
    console.log('Running function:', ruleFunction.toString());
    try {
      const ruleResult = await ruleFunction({collection, user: req.user, req, ...req.body});
      if(ruleResult) {
        req.excludeFields = ruleResult?.excludeFields;
        req.where = ruleResult?.where;
      } else {
        return res.status(401).send({message:'Unauthorized!',fn:ruleFunction.toString()});
      }
    } catch (e) {
      console.error(e);
      return res.status(401).send({message:e.message});
    }
  }
  next();
})

app.post('/filter', async (req, res, next) => {
  try {
    const {collection, callbackFn, thisArg = {}} = req.body;
    const result = await db.collection(collection).find();
    const array = await result.toArray();
    const vm = new VM({
      timeout: 1000,
      allowAsync: false,
      sandbox: {array,...thisArg}
    });
    const filteredResult = vm.run(`array.filter(${callbackFn})`);
    res.send(filteredResult || []);
    next();
  } catch (e) {
    console.error(e);
    res.status(500).send(e);
  }
});

app.post('/find', async (req, res, next) => {
  try {
    const {collection, callbackFn, thisArg} = req.body;
    const result = await db.collection(collection).find();
    const array = await result.toArray();
    const vm = new VM({
      timeout: 1000,
      allowAsync: false,
      sandbox: {array,...thisArg}
    });
    const findResult = vm.run(`array.find(${callbackFn})`);
    res.send( {value: findResult || null});
    next();
  } catch (e) {
    console.error(e);
    res.status(500).send(e);
  }
});

app.post('/map', async (req, res, next) => {
  try {
    const {collection, callbackFn, thisArg} = req.body;
    const result = await db.collection(collection).find();
    const array = await result.toArray();
    const vm = new VM({
      timeout: 1000,
      allowAsync: false,
      sandbox: {array,...thisArg}
    });
    const mapResult = vm.run(`array.map(${callbackFn})`);
    res.send(mapResult);
    next();
  } catch (e) {
    console.error(e);
    res.status(500).send(e);
  }
});

app.post(['/getAll','/forEach', '/entries', '/values'], async (req, res, next) => {
  try {
    const {collection} = req.body;
    const result = await db.collection(collection).find();
    const array = await result.toArray();
    res.send(array || []);
    next();
  } catch (e) {
    console.error(e);
    res.status(500).send(e);
  }
});

app.post('/has', async (req, res, next) => {
  try {
    const {collection, id} = req.body;
    const count = await db.collection(collection).countDocuments({_id: documentId(id)});
    res.send({value:count > 0});
    next();
  } catch (e) {
    console.error(e);
    res.status(500).send(e);
  }
});

app.post('/keys', async (req, res, next) => {
  try {
    const {collection} = req.body;
    const ids = await db.collection(collection).distinct('_id');
    res.send(ids);
    next();
  } catch (e) {
    console.error(e);
    res.status(500).send(e);
  }
});

app.post('/push', async (req, res, next) => {
  try {
    const {collection, value} = req.body;
    const result = await db.collection(collection).insertOne(value);
    const count = await db.collection(collection).estimatedDocumentCount();
    req.insertedId = result.insertedId;
    res.send({value:count});
    next();
  } catch (e) {
    console.error(e);
    res.status(500).send(e);
  }
});

app.post(['/size', '/length'], async (req,res,next) => {
  try {
    const {collection} = req.body;
    const count = await db.collection(collection).countDocuments();
    res.send({value:count});
    next();
  } catch (e) {
    console.error(e);
    res.status(500).send(e);
  }
})

app.post('/clear', async (req,res,next) => {
  try {
    const {collection} = req.body;
    await db.collection(collection).drop();
    res.sendStatus(200);
    next();
  } catch (e) {
    res.status(500).send(e);
  }
})

app.post('/delete', async (req,res,next) => {
  try {
    const {collection, id, path} = req.body;
    let result;
    if(path?.length > 0) {
      const dotedPath = path.join('.');
      result = await db.collection(collection).updateOne({"_id": documentId(id)}, {'$unset': {[dotedPath]:""}}, {upsert: false});
    } else {
      result = await db.collection(collection).deleteOne({"_id": documentId(id)});
    }
    res.result = result;
    res.send({value: result.deletedCount > 0});
    next();
  } catch (e) {
    console.error(e);
    res.status(500).send(e);
  }
})

app.post('/set', async (req, res, next) => {
  try {
    const {collection, value, id, path} = req.body;
    delete value._id;
    let result;
    if(path?.length > 0) {
      const dotedPath = path.join('.');
      result = await db.collection(collection).updateOne({"_id": documentId(id)}, {'$set': {[dotedPath]:value}}, {upsert: true});
    } else {
      result = await db.collection(collection).updateOne({"_id": documentId(id)}, {'$set': value}, {upsert: true});
    }
    res.result = result
    res.sendStatus(200)
    next();
  } catch (e) {
    console.error(e);
    res.status(500).send(e);
  }
});
app.post('/get', async (req, res, next) => {
  try {
    const {collection, id, path} = req.body;
    if(path?.length > 0) {
      const dotedPath = path.join('.');
      const result = await db.collection(collection).findOne(
        {"_id": documentId(id)},
        {projection:{[dotedPath]: true}}
      );
      res.status(200).send({value:_.get(result, dotedPath)});
    } else {
      const result = await db.collection(collection).findOne({"_id": documentId(id)});
      res.send({value:result});
    }

    next();
  } catch (e) {
    console.error(e);
    res.status(500).send(e);
  }
});

app.use(async (req, res, next) => {
  next();
  const {collection, id, value} = req.body;
  const method = req.path.replaceAll('/', '');
  const triggerFunction = triggers[collection]?.[method]
    || triggers[collection]?.[operationFallback[method]]
    || triggers[collection]?.default
    || triggers.default?.[method]
    || triggers.default?.[operationFallback[method]]
    || triggers.default?.default;
  try {
    triggerFunction?.({collection, id, value, user: req.user, insertedId: req.insertedId, req, res});
  } catch (e) {
    console.error(e);
  }
});

export default app;