import {start} from "./server.js";
import {setServerUrl, DatabaseArray, DatabaseMap, auth} from "./sdk/dist/sdk.esm.js";
import * as assert from "assert";
const msgsArray = new DatabaseArray('msgs');
const msgsMap = new DatabaseMap('msgs');
start();
setServerUrl('http://localhost:3001');

const passedMap = new Map();
const failedMap = new Map();

async function test(name, callback) {
    try {
        await callback();
        passedMap.set(name, true)
    } catch (e) {
        console.trace(name,e.message)
        failedMap.set(name, e);
    }
}

setInterval(()=> {
    msgsArray.push({
        message: 'FFFFFFF',
        date: new Date()
    })
}, 3000);