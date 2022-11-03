import {start} from "../server.js";
import {setServerUrl, db, auth, functions, initApp} from "@jsdb/sdk";
import * as assert from "assert";
import {opHandlers} from "../opHandlersBetterSqlite.js";
start();
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
//     await db.msgs.clear();
// })
//
// await test('set message', async() => {
//     await db.msgs.set('x',{text: 'xyz'});
// })
//
// await test('get keys using .keys()', async() => {
//     const keys = await db.msgs.keys();
//     assert.deepStrictEqual(keys, ['x'])
// })
//
// await test('get values using .values()', async() => {
//     const values = await db.msgs.values();
//     assert.deepStrictEqual(Array.from(values), [{id:'x',text: 'xyz'}])
// })
//
// await test('get message using .get()', async() => {
//     const startMs = Date.now();
//     const msg = await db.msgs.get('x');
//     const endMs = Date.now();
//     console.log('Get by id time', endMs - startMs)
//     assert.equal(msg.text, 'xyz')
// })
//
// await test('set message', async() => {
//     await db.msgs.set('x',{text: 'xyz'});
// })
//
// await test('get keys using .keys()', async() => {
//     const keys = await db.msgs.keys();
//     assert.deepStrictEqual(keys, ['x'])
// })
//
// await test('get values using .values()', async() => {
//     const values = await db.msgs.values();
//     assert.deepStrictEqual(Array.from(values), [{id:'x',text: 'xyz'}])
// })
//
// await test('get message using .get()', async() => {
//     const msg = await db.msgs.get('x');
//     assert.equal(msg.text, 'xyz')
// })
//
// await test('check if message exists using .has()', async() => {
//     const xExists = await db.msgs.has('x');
//     const yExists = await db.msgs.has('y');
//     assert.equal(xExists, true)
//     assert.equal(yExists, false)
// })
//
// await test('get size using .size', async() => {
//     const size = await db.msgs.size;
//     assert.equal(size, 1)
// })
//
// await test('get size using .length', async() => {
//     const size = await db.msgs.length;
//     assert.equal(size, 1)
// })
//
// await test('get message using dot notation', async() => {
//     const msg = await db.msgs.x;
//     assert.equal(msg.text, 'xyz')
// })
//
// await test('get message property using dot notation', async() => {
//     const text = await db.msgs.x.text;
//     assert.equal(text, 'xyz')
// })
//
// await test('delete message property', async() => {
//     const wasDeleted = await delete db.msgs.x.text;
//     await new Promise(resolve => setTimeout(resolve, 1000))
//     const text = await db.msgs.x.text;
//     assert.equal(text, undefined)
//     assert.equal(wasDeleted, true)
// })
//
// await test('delete message using .delete()', async() => {
//     const wasDeleted = await db.msgs.delete('x');
//     const msg = await db.msgs.x;
//     assert.equal(msg, undefined);
//     assert.equal(wasDeleted, true);
// })
//
// await test('add message using .push()', async() => {
//     const result = await db.msgs.push({text:'FUN!', date: new Date()});
//     assert.equal(typeof result, 'string')
// })
//
// await test('find message using .find()', async() => {
//     const msg = await db.msgs.find(msg => msg.text === 'FUN!');
//     assert.equal(msg.text, 'FUN!')
// })
//
// await test('find message using .find() and thisArg', async() => {
//     const msg = await db.msgs.find(msg => msg.text === self.text, {self:{text:'FUN!'}});
//     assert.equal(msg.text, 'FUN!')
// })
//
// await test('filter message using .filter() and thisArg', async() => {
//     const msgs = await db.msgs.filter(msg => msg.text === self.text, {self:{text:'FUN!'}});
//     assert.equal(msgs.length, 1)
//     assert.equal(msgs[0].text, 'FUN!')
// })
//
// await test('filter message using .filter() with date', async() => {
//     const msgs = await db.msgs.filter(msg => msg.date < new Date());
//     assert.equal(msgs.length, 1)
//     assert.equal(msgs[0].text, 'FUN!')
// })
//
// await test('filter message using .filter() & notLike', async() => {
//     const msgs = await db.msgs.filter(msg => this.notLike(msg.text, '%U%'));
//     assert.equal(msgs.length, 0)
// })
//
// await test('filter message using .filter() & like', async() => {
//     const msgs = await db.msgs.filter(msg => this.like(msg.text, '%U%'));
//     assert.equal(msgs.length, 1)
//     assert.equal(msgs[0].text, 'FUN!')
// })
//
// await test('filter message using .filter() & like from thisArg', async() => {
//     const msgs = await db.msgs.filter(msg => this.like(msg.text, ctx.like), {ctx: {like:'%U%'}});
//     assert.equal(msgs.length, 1)
//     assert.equal(msgs[0].text, 'FUN!')
// })
//
//
// await test('filter message using .filter() & notLike', async() => {
//     const msgs = await db.msgs.filter(msg => this.like(msg.text, '%UX%'));
//     assert.equal(msgs.length, 0)
// })
//
// await test('slice messages to get 1 message', async() => {
//     const msgs = await db.msgs.slice(0,1);
//     assert.equal(msgs.length, 1)
//     assert.equal(msgs[0].text, 'FUN!')
// })
//
// await test('filter message using chainable .filter .sortBy .slice', async() => {
//     const msgs = await db.msgs.filter(msg => msg.text === self.text, {self:{text:'FUN!'}})
//         .orderBy('date','ASC')
//         .slice(0,1);
//     assert.equal(msgs.length, 1);
//     assert.equal(msgs[0].text, 'FUN!');
// })
//
// await test('filter message using chainable .filter .length', async() => {
//     const msgsLength = await db.msgs.filter(msg => msg.text === 'FUN!').length;
//     assert.equal(msgsLength, 1);
// })
//
// await test('filter message using chainable .filter .map', async() => {
//     const msgs = await db.msgs.filter(msg => msg.text === 'FUN!').map(msg => msg.text);
//     assert.equal(msgs[0], 'FUN!');
// })
//
// await test('map msgs using .map()', async() => {
//     const texts = await db.msgs.map(msg => msg.text);
//     assert.equal(texts.length, 1)
//     assert.equal(texts[0], 'FUN!')
// })
//
// await test('iterate using forEach', async() => {
//     const msgs = [];
//     await db.msgs.forEach(msg => msgs.push(msg))
//     assert.deepStrictEqual(msgs.length, 1)
//     assert.deepStrictEqual(msgs[0].text, 'FUN!')
// })
//
// await test('iterate using for await', async() => {
//     const msgs = []
//     for await (const msg of db.msgs){
//         msgs.push(msg);
//     }
//     assert.deepStrictEqual(msgs.length, 1)
//     assert.deepStrictEqual(msgs[0].text, 'FUN!')
// })
//
// await test('subscribe to individual msg', async() => {
//     let lastValue;
//     const unsubscribe = db.msgs.x.subscribe(value => {
//         lastValue = value
//     });
//     db.msgs.x.text = "IS LIVE!"
//     await new Promise(resolve => setTimeout(resolve, 2000))
//     unsubscribe();
//     assert.equal(lastValue?.text,'IS LIVE!');
// })
//
// await test('clear msgs', async() => {
//     await db.msgs.clear();
//     const size = await db.msgs.size;
//     assert.deepStrictEqual(size, 0)
// })
//
await test('Insert 10000 logs', async() => {
    const startMs = Date.now();
    // const promises = [];
    for(let i = 0; i<10000;i++) {
        await db.logs.push({type:'info',text:'Dummy log',date: new Date(),i});
    }
    // await Promise.all(promises);
    const endMs = Date.now();
    console.log('10k Write Time', endMs-startMs)
    // assert.deepStrictEqual(endMs-startMs<2000, true);
})
//
// await test('Get 1000', async() => {
//     const startMs = Date.now();
//     await db.logs.values();
//     const endMs = Date.now();
//     console.log('Get 1000 Time', endMs-startMs)
//     // assert.deepStrictEqual(endMs-startMs<2000, true);
// })
//
// await test('Query 1000 logs', async() => {
//     const allLogs = await db.logs.keys()
//     const startMs = Date.now();
//     for(const id of allLogs) {
//         await db.logs.get(id);
//     }
//     const endMs = Date.now();
//     console.log('Query Read Time', endMs-startMs)
//     // assert.deepStrictEqual(endMs-startMs<2000, true);
// })
//
// await test('Find first log', async() => {
//     const startMs = Date.now();
//     await db.logs.filter(log => log.i === 999)
//     const endMs = Date.now();
//     console.log('Find first time', endMs-startMs)
//     // assert.deepStrictEqual(endMs-startMs<2000, true);
// })
//
// await test('clear logs', async() => {
//     await db.logs.clear();
//     const size = await db.logs.size;
//     assert.deepStrictEqual(size, 0)
// })
//
// await test('Subscribe filter', async () => {
//     let lastValue;
//     const unsubscribe = db.logs.filter(log => log.text === 'LIVE LOG!').subscribe(value => {
//         lastValue = value
//     });
//     await db.logs.push({type:'info',text:'LIVE LOG!',date: new Date()});
//     await new Promise(resolve => setTimeout(resolve, 2000))
//     unsubscribe();
//     assert.equal(lastValue[0]?.text,'LIVE LOG!');
// })
//
await test('clear logs', async() => {
    await db.logs.clear();
    const size = await db.logs.size;
    assert.deepStrictEqual(size, 0)
})
//
// await test('call remote function', async() => {
//     const result = await functions.helloWorld();
//     assert.deepStrictEqual(result.message, 'IT WORKS!')
// });
//
// await test('call function & remotely insert 1000 records', async() => {
//     const result = await functions.remoteInserts();
//     console.log('Remote insert 1000 time', result.time)
//     assert.deepStrictEqual(result.time < 100, true)
// });

// LOCAL TESTS

const localJsdb = initApp({connector: 'LOCAL', opHandlers: opHandlers});

await test('Local get map size', async() => {
    const size = await localJsdb.db.logs.length;
    assert.deepStrictEqual(size, 0)
});

await test('Local insert 10000', async() => {
    const startMs = Date.now();
    for(let i = 0; i<10000;i++) {
        localJsdb.db.logs.push({type:'info',text:'Dummy log',date: new Date(),i});
    }
    const endMs = Date.now();
    console.log('10k Local Write Time', endMs-startMs)
    const size = await localJsdb.db.logs.length;
    assert.deepStrictEqual(size, 10000)
});

await test('clear logs', async() => {
    await localJsdb.db.logs.clear();
    const size = await localJsdb.db.logs.size;
    assert.deepStrictEqual(size, 0)
})

const wsJsdb = initApp({connector: 'WS', opHandlers: opHandlers, serverUrl: 'http://localhost:3001'})

await test('WS insert 10000', async() => {
    const startMs = Date.now();
    for(let i = 0; i<10000;i++) {
        const iStart = performance.now();
        await wsJsdb.db.logs.push({type:'info',text:'Dummy log',date: new Date(),i});
        const iEnd = performance.now();
        // console.log('Individual', iStart)
    }
    const endMs = Date.now();
    console.log('10k WS Write Time', endMs-startMs)
    const size = await wsJsdb.db.logs.length;
    assert.deepStrictEqual(size, 10000)
});

console.log('PASSED',passedMap.size)
console.log('FAILED',failedMap.size)

if(failedMap.size > 0) {
    throw new Error('Errors found while running tests')
}

process.exit()