import express from "express";
import cors from "cors";
import url from 'url';
import fs from 'fs';
import path from "path";
import rateLimit from 'express-rate-limit'
import passport from "passport";
import { WebSocketServer } from 'ws';
import 'dotenv/config'
import {default as db} from './db.js'; // Start mongo connection
import authApp from './authApp.js';
import dbApp from "./dbApp.js";
import functionsApp from "./functionsApp.js";
import EventEmitter from 'events';
import _ from 'lodash-es';
import {functions, importFromBase64, importFromPath, rules, triggers} from "./lifecycleMiddleware.js";
import {ObjectID} from "mongodb";
import {VM} from "vm2";
import {memoizedRun} from "./vm.js";

const wsServer = new WebSocketServer({ noServer: true });
const realtimeListeners = new EventEmitter();

function documentId(id) {
  return ObjectID.isValid(id) ? ObjectID(id) : id;
}

// TODO : move this somewhere proper

wsServer.on('connection', socket => {
  socket.on('message', async message => {
    try {
      const parsedMessage = JSON.parse(message);
      if(parsedMessage.operation === 'get') {
        const {collection, id, path = [], operation} = parsedMessage;
        const eventName = `${collection}.${id}`;
        function documentChangeHandler(documentData) {
          let value;
          if(path.length > 0) {
            value = _.get(documentData, path);
          } else {
            value = documentData;
          }
          socket.send(JSON.stringify({
            fullPath: `${collection}.${id}` + (path.length > 0 ?  `.${path.join('.')}` : ''),
            value,
            operation,
            content: 'value'
          }));
        }
        const document = await db.collection(collection).findOne({_id: documentId(id)});
        documentChangeHandler(document)
        realtimeListeners.on(eventName, documentChangeHandler)
      } else if (parsedMessage.operation === 'filter') {
        const {collection, callbackFn, thisArg, operation} = parsedMessage;
        const eventName = collection;
        function collectionChangeHandler(changeData) {
          if(changeData.event === 'drop') {
            socket.send(JSON.stringify({
              content: changeData.event,
              operation,
              collection, callbackFn, thisArg
            }));
          } else {
            try {
              const matches = memoizedRun({array:[changeData.document],...thisArg}, `array.some(${callbackFn})`)
              if(matches) {
                socket.send(JSON.stringify({
                  content: changeData.event,
                  value: changeData.document,
                  operation,
                  collection, callbackFn, thisArg
                }));
              }
            } catch (e) {
              console.error('Error running vm')
            }
          }

        }
        try {
          const result = await db.collection(collection).find();
          const array = await result.toArray();

          const vm = new VM({
            timeout: 1000,
            allowAsync: false,
            sandbox: {array,...thisArg}
          });
          const filteredResult = vm.run(`array.filter(${callbackFn})`);
          socket.send(JSON.stringify({
            content: 'reset',
            value: filteredResult,
            operation,
            collection, callbackFn, thisArg
          }))
          realtimeListeners.on(eventName, collectionChangeHandler)
        } catch (e) {
          console.error('Error running vm')
        }

      }
    } catch (e) {
      console.error(e);
    }
  });
});

export const app = express();

const entryPointUrl = url.pathToFileURL(process.argv[1]).href;
const runningAsLibrary = import.meta.url !== entryPointUrl;

if(runningAsLibrary) {
  const customPath = path.resolve(url.fileURLToPath(entryPointUrl), '../.jsdb');
  await importFromPath(customPath);
}
const indexResult = await db.collection('users').createIndex( { "credentials.email": 1 }, { unique: true } )

const currentDbBundle = await db.collection('bundles').findOne({},{sort:{_id:-1}});
if(currentDbBundle) {
  await importFromBase64(currentDbBundle.file.string);
}

const limiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: process.env.RATE_LIMIT || 10000,
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
})

// Apply the rate limiting middleware to all requests
app.use(limiter)

app.use(cors());
const regexpIsoDate = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2}(?:\.\d*))(?:Z|(\+|-)([\d|:]*))?$/;

app.use(express.json({
  reviver(key, value) {
    if(regexpIsoDate.test(value)) {
      return new Date(value);
    } else {
      return value;
    }
  },
  limit: '1mb'
}));

app.use((req, res, next) => {
  req.db = db;
  req.realtimeListeners = realtimeListeners;
  const authorization = req.get('Authorization');
  if (authorization) {
    passport.authenticate('jwt', { session: false })(req, res, next);
  } else {
    next()
  }
})
const port = process.env.PORT || 3001;

app.use('/auth', authApp);
app.use('/db', dbApp);
app.use('/functions', functionsApp);
app.use('/__discovery', (req,res) => {
  const response = JSON.parse(JSON.stringify({rules, triggers, functions},(key, value) => {
    if(typeof value === 'function') {
      return 'fn'
    }
    return value;
  }))
  res.send(response)
})

const hostingPath = path.resolve(url.fileURLToPath(entryPointUrl), '../.jsdb/hosting');

if (fs.existsSync(hostingPath)) {
  app.use(express.static(hostingPath, {
    fallthrough: true,
    maxAge: '5m'
  }));
  app.use('*', function (req, res) {
    if(!res.finished) res.sendFile(path.resolve(hostingPath, 'index.html'));
  })
}

export function start() {
  const server = app.listen(port, () => {
    console.log(`Listening on port ${port}`)
  });
  server.on('upgrade', (request, socket, head) => {
    wsServer.handleUpgrade(request, socket, head, socket => {
      wsServer.emit('connection', socket, request);
    });
  });
}

if (!runningAsLibrary) {
  start();
}