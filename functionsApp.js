import {functions} from "./lifecycleMiddleware.js";
import express from "express";
const app = express();

app.post('/:functionPath', async function (req,res,next){
  try {
    const fn = functions[req.params.functionPath]?.default;
    if(!fn) {
      res.sendStatus(404);
    } else {
      res.send(await fn({req, user: req.user, data: req.body}));
    }
  } catch (e) {
    console.error(e);
    res.status(500).send({message: `Error executing function ${req.params.functionPath}`});
  }
});

export default app;