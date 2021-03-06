// import {start} from "../server.js";
import {setServerUrl, DatabaseArray, DatabaseMap, auth, functions, initApp} from "@jsdb/sdk";
import * as assert from "assert";
import {opHandlers} from "../opHandlersBetterSqlite.js";
const msgsArray = new DatabaseArray('msgs');
const msgsMap = new DatabaseMap('msgs');
const logsArray = new DatabaseArray('logs');
const logsMap = new DatabaseMap('logs');
// start();
setServerUrl('http://localhost:3001');


const passedMap = new Map();
const failedMap = new Map();

async function test(name, callback) {
    try {
        await callback();
        passedMap.set(name, true)
    } catch (e) {
        console.trace(name,e.message);
        failedMap.set(name, e);
    }
}

// try {
//     await auth.createAccount({email: `test32edadas@healthtree.org`, password: 'dhs87a6dasdg7as8db68as67da'})
//     await auth.signIn({email: `test32edadas@healthtree.org`, password: 'dhs87a6dasdg7as8db68as67da'})
// } catch (e) {
//
// }
//
// await test('Initial clear map using .clear()', async() => {
//     await msgsMap.clear();
// })
// //
// await test('set message', async() => {
//     await msgsMap.set('x',{text: 'xyz'});
// })
//
// await test('get keys using .keys()', async() => {
//     const keys = await msgsMap.keys();
//     assert.deepStrictEqual(keys, ['x'])
// })
//
// await test('get values using .values()', async() => {
//     const values = await msgsMap.values();
//     assert.deepStrictEqual(Array.from(values), [{id:'x',text: 'xyz'}])
// })
//
// await test('get message using .get()', async() => {
//     const startMs = Date.now();
//     const msg = await msgsMap.get('x');
//     const endMs = Date.now();
//     console.log('Get by id time', endMs - startMs)
//     assert.equal(msg.text, 'xyz')
// })
//
// await test('set message', async() => {
//     await msgsMap.set('x',{text: 'xyz'});
// })
//
// await test('get keys using .keys()', async() => {
//     const keys = await msgsMap.keys();
//     assert.deepStrictEqual(keys, ['x'])
// })
//
// await test('get values using .values()', async() => {
//     const values = await msgsMap.values();
//     assert.deepStrictEqual(Array.from(values), [{id:'x',text: 'xyz'}])
// })
//
// await test('get message using .get()', async() => {
//     const msg = await msgsMap.get('x');
//     assert.equal(msg.text, 'xyz')
// })
//
// await test('check if message exists using .has()', async() => {
//     const xExists = await msgsMap.has('x');
//     const yExists = await msgsMap.has('y');
//     assert.equal(xExists, true)
//     assert.equal(yExists, false)
// })
//
// await test('get size using .size', async() => {
//     const size = await msgsMap.size;
//     assert.equal(size, 1)
// })
//
// await test('get size using .length', async() => {
//     const size = await msgsArray.length;
//     assert.equal(size, 1)
// })
//
// await test('get message using dot notation', async() => {
//     const msg = await msgsMap.x;
//     assert.equal(msg.text, 'xyz')
// })
//
// await test('get message property using dot notation', async() => {
//     const text = await msgsMap.x.text;
//     assert.equal(text, 'xyz')
// })
//
// await test('delete message property', async() => {
//     const wasDeleted = await delete msgsMap.x.text;
//     await new Promise(resolve => setTimeout(resolve, 1000))
//     const text = await msgsMap.x.text;
//     assert.equal(text, undefined)
//     assert.equal(wasDeleted, true)
// })
//
// await test('delete message using .delete()', async() => {
//     const wasDeleted = await msgsMap.delete('x');
//     const msg = await msgsMap.x;
//     assert.equal(msg, undefined);
//     assert.equal(wasDeleted, true);
// })
//
// await test('add message using .push()', async() => {
//     const result = await msgsArray.push({text:'FUN!', date: new Date()});
//     assert.equal(typeof result, 'string')
// })
//
// await test('find message using .find()', async() => {
//     const msg = await msgsArray.find(msg => msg.text === 'FUN!');
//     assert.equal(msg.text, 'FUN!')
// })
//
// await test('find message using .find() and thisArg', async() => {
//     const msg = await msgsArray.find(msg => msg.text === self.text, {self:{text:'FUN!'}});
//     assert.equal(msg.text, 'FUN!')
// })
//
// await test('filter message using .filter() and thisArg', async() => {
//     const msgs = await msgsArray.filter(msg => msg.text === self.text, {self:{text:'FUN!'}});
//     assert.equal(msgs.length, 1)
//     assert.equal(msgs[0].text, 'FUN!')
// })
//
// await test('filter message using .filter() with date', async() => {
//     const msgs = await msgsArray.filter(msg => msg.date < new Date());
//     assert.equal(msgs.length, 1)
//     assert.equal(msgs[0].text, 'FUN!')
// })
//
// await test('filter message using .filter() & notLike', async() => {
//     const msgs = await msgsArray.filter(msg => this.notLike(msg.text, '%U%'));
//     assert.equal(msgs.length, 0)
// })
//
// await test('filter message using .filter() & like', async() => {
//     const msgs = await msgsArray.filter(msg => this.like(msg.text, '%U%'));
//     assert.equal(msgs.length, 1)
//     assert.equal(msgs[0].text, 'FUN!')
// })
//
// await test('filter message using .filter() & like from thisArg', async() => {
//     const msgs = await msgsArray.filter(msg => this.like(msg.text, ctx.like), {ctx: {like:'%U%'}});
//     assert.equal(msgs.length, 1)
//     assert.equal(msgs[0].text, 'FUN!')
// })
//
//
// await test('filter message using .filter() & notLike', async() => {
//     const msgs = await msgsArray.filter(msg => this.like(msg.text, '%UX%'));
//     assert.equal(msgs.length, 0)
// })
//
// await test('slice messages to get 1 message', async() => {
//     const msgs = await msgsArray.slice(0,1);
//     assert.equal(msgs.length, 1)
//     assert.equal(msgs[0].text, 'FUN!')
// })
//
// await test('filter message using chainable .filter .sortBy .slice', async() => {
//     const msgs = await msgsArray.filter(msg => msg.text === self.text, {self:{text:'FUN!'}})
//         .orderBy('date','ASC')
//         .slice(0,1);
//     assert.equal(msgs.length, 1);
//     assert.equal(msgs[0].text, 'FUN!');
// })
//
// await test('filter message using chainable .filter .length', async() => {
//     const msgsLength = await msgsArray.filter(msg => msg.text === 'FUN!').length;
//     assert.equal(msgsLength, 1);
// })
//
// await test('filter message using chainable .filter .map', async() => {
//     const msgs = await msgsArray.filter(msg => msg.text === 'FUN!').map(msg => msg.text);
//     assert.equal(msgs[0], 'FUN!');
// })
//
// await test('map msgs using .map()', async() => {
//     const texts = await msgsArray.map(msg => msg.text);
//     assert.equal(texts.length, 1)
//     assert.equal(texts[0], 'FUN!')
// })
//
// await test('iterate using forEach', async() => {
//     const msgs = [];
//     await msgsArray.forEach(msg => msgs.push(msg))
//     assert.deepStrictEqual(msgs.length, 1)
//     assert.deepStrictEqual(msgs[0].text, 'FUN!')
// })
//
// await test('iterate using for await', async() => {
//     const msgs = []
//     for await (const msg of msgsArray){
//         msgs.push(msg);
//     }
//     assert.deepStrictEqual(msgs.length, 1)
//     assert.deepStrictEqual(msgs[0].text, 'FUN!')
// })
//
// await test('subscribe to individual msg', async() => {
//     let lastValue;
//     const unsubscribe = msgsMap.x.subscribe(value => {
//         lastValue = value
//     });
//     msgsMap.x.text = "IS LIVE!"
//     await new Promise(resolve => setTimeout(resolve, 2000))
//     unsubscribe();
//     assert.equal(lastValue?.text,'IS LIVE!');
// })
//
// await test('clear msgs', async() => {
//     await msgsMap.clear();
//     const size = await msgsMap.size;
//     assert.deepStrictEqual(size, 0)
// })

await test('Insert 1000 logs', async() => {
    const startMs = Date.now();
    // const promises = [];
    for(let i = 0; i<1000;i++) {
        await logsArray.push({type:'info',text:'Dummy log',date: new Date(),i});
    }
    // await Promise.all(promises);
    const endMs = Date.now();
    console.log('1k Write Time', endMs-startMs)
    // assert.deepStrictEqual(endMs-startMs<2000, true);
})

// await test('Get 1000', async() => {
//     const startMs = Date.now();
//     await logsMap.values()
//     const endMs = Date.now();
//     console.log('Get 1000 Time', endMs-startMs)
//     // assert.deepStrictEqual(endMs-startMs<2000, true);
// })
//
// await test('Query 1000 logs', async() => {
//     const allLogs = await logsMap.keys()
//     const startMs = Date.now();
//     for(const id of allLogs) {
//         await logsMap.get(id);
//     }
//     const endMs = Date.now();
//     console.log('Query Read Time', endMs-startMs)
//     // assert.deepStrictEqual(endMs-startMs<2000, true);
// })
//
// await test('Find first log', async() => {
//     const startMs = Date.now();
//     await logsArray.filter(log => log.i === 999)
//     const endMs = Date.now();
//     console.log('Find first time', endMs-startMs)
//     // assert.deepStrictEqual(endMs-startMs<2000, true);
// })
//
// await test('clear logs', async() => {
//     await logsMap.clear();
//     const size = await logsMap.size;
//     assert.deepStrictEqual(size, 0)
// })
//
// await test('Subscribe filter', async () => {
//     let lastValue;
//     const unsubscribe = logsArray.filter(log => log.text === 'LIVE LOG!').subscribe(value => {
//         lastValue = value
//     });
//     await logsArray.push({type:'info',text:'LIVE LOG!',date: new Date()});
//     await new Promise(resolve => setTimeout(resolve, 2000))
//     unsubscribe();
//     assert.equal(lastValue[0]?.text,'LIVE LOG!');
// })
//
// await test('clear logs', async() => {
//     await logsMap.clear();
//     const size = await logsMap.size;
//     assert.deepStrictEqual(size, 0)
// })
//
// await test('call remote function', async() => {
//     const result = await functions.helloWorld();
//     assert.deepStrictEqual(result.message, 'IT WORKS!')
// });
//
// await test('call function & remotely insert 1000 records', async() => {
//     const result = await functions.x();
//     console.log('Remote insert 1000 time', result.time)
//     assert.deepStrictEqual(result.time < 100, true)
// });

// LOCAL TESTS

// const localJsdb = initApp({connector: 'LOCAL', opHandlers: opHandlers})
// const localLogs = new localJsdb.DatabaseArray('logs');
// const localLogsMap = new localJsdb.DatabaseMap('logs');
//
// await test('Local get map size', async() => {
//     const size = await localLogs.length;
//     assert.deepStrictEqual(size, 0)
// });
//
// await test('Local insert 1000', async() => {
//     const startMs = Date.now();
//     for(let i = 0; i<10000;i++) {
//         await localLogs.push({type:'info',text:'Dummy log',date: new Date(),i});
//     }
//     const endMs = Date.now();
//     console.log('1k Local Write Time', endMs-startMs)
// });
//
// await test('clear logs', async() => {
//     await localLogsMap.clear();
//     const size = await localLogsMap.size;
//     assert.deepStrictEqual(size, 0)
// })

// const wsJsdb = initApp({connector: 'WS', opHandlers: opHandlers, serverUrl: 'https://jsdb-server-gre7hve6eq-uc.a.run.app'})
// const wsLogs = new wsJsdb.DatabaseArray('logs');
//
// await test('WS insert 1000', async() => {
//     const startMs = Date.now();
//     for(let i = 0; i<100;i++) {
//         const iStart = performance.now();
//         await wsLogs.push({type:'info',text:'Dummy log',date: new Date(),i});
//         const iEnd = performance.now();
//         console.log('Individual', iStart)
//     }
//     const endMs = Date.now();
//     console.log('1k WS Write Time', endMs-startMs)
// });

console.log('PASSED',passedMap.size)
console.log('FAILED',failedMap.size)

if(failedMap.size > 0) {
    throw new Error('Errors found while running tests')
}

process.exit()