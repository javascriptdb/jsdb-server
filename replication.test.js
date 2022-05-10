import {setServerUrl, DatabaseArray} from "./sdk/dist/sdk.esm.js";

const msgsArray = new DatabaseArray('msgs');

setServerUrl('http://localhost:3001/');

console.log(await msgsArray.length);

let count = 0;
const interval = setInterval(async ()=> {
    try {
        msgsArray.push({
            message: 'FFFFFFF',
            date: new Date()
        }).then(() => count++)
    } catch (e) {
        console.error(e);
    }
}, 0);

setTimeout(() => {
    console.log('1s',count);
    clearInterval(interval)
},1000);

setTimeout(() => {
    console.log('2s',count);
},2000);
