import {parseData, serializeData} from "./utils";
import EventEmitter from "events";
import axios from 'axios';
import _ from 'lodash-es';
import WebSocket from "isomorphic-ws";

type document = { _id: string, [key: string]: any }
type fn = <T>(v: T) => T

const jsdbAxios = axios.create({
    baseURL: ''
});
let ws: undefined | WebSocket;
let queue: string[] = [];
const realtimeListeners = new EventEmitter();
const cachedRealtimeValues = new Map();

function startWs() {
    try {
        if (ws) {
            ws.close();
        }

        ws = new WebSocket(jsdbAxios.defaults.baseURL?.replace('http://', 'ws://').replace('https://', 'wss://'));

        ws.onopen = function open() {
            if (queue.length > 0) {
                queue.forEach((wsData) => ws.send(wsData));
                queue = [];
            }
        };

        ws.onclose = function close() {
            console.log('disconnected');
        };

        ws.onmessage = function incoming(event: any) {
            try {
                const data = JSON.parse(event.data);
                if (data.operation === 'get') {
                    cachedRealtimeValues.set(data.fullPath, data.value);
                    realtimeListeners.emit(data.fullPath, data.value);
                } else if (data.operation === 'filter') {
                    const key = `${data.collection}.filter(${data.callbackFn},${JSON.stringify(data.thisArg)})`;
                    let value = cachedRealtimeValues.get(key) || [];
                    if(data.content === 'reset') {
                        value = data.value;
                    } else if (data.content === 'add') {
                        value.push(data.value);
                    } else if(data.content === 'edit') {
                        const editedIndex = value.findIndex((o: any) => o._id === data.value._id);
                        value[editedIndex] = data.value;
                    } else if(data.content === 'delete') {
                        const deletedIndex = value.findIndex((o: any) => o._id === data.value._id);
                        value.splice(deletedIndex, 1);
                    } else if (data.content === 'drop') {
                        value = []
                    }
                    cachedRealtimeValues.set(key, value);
                    realtimeListeners.emit(key, value);
                }
            } catch (e) {
                console.error(e);
            }
        };
    } catch (e) {
        console.error(e);
    }
}

function subscriptionFactory(eventName: string, data: any, operation: string) {
    return function subscribe(callbackFn: (arg0: any) => void) {
        function documentChangeHandler(documentData: any) {
            callbackFn(documentData);
        }

        realtimeListeners.on(eventName, documentChangeHandler)

        if (realtimeListeners.listenerCount(eventName) > 1 && cachedRealtimeValues.has(eventName)) {
            documentChangeHandler(cachedRealtimeValues.get(eventName))
        } else {
            const wsData = JSON.stringify({
                operation, ...data,
                authorization: jsdbAxios.defaults.headers.common['Authorization']
            });
            if (ws?.readyState === WebSocket.OPEN) {
                ws.send(wsData);
            } else {
                queue.push(wsData)
            }
        }

        return function unsubscribe() {
            realtimeListeners.off(eventName, documentChangeHandler);
        }
    }
}

jsdbAxios.defaults.headers.common['Content-Type'] = 'application/json';

jsdbAxios.interceptors.request.use(async function (config) {
    if (Array.isArray(config.data)) {
        await config.data.map(async element => await serializeData(element));
    } else if (_.isPlainObject(config.data)) {
        await serializeData(config.data);
    }
    return config;
}, function (error) {
    return Promise.reject(error);
});

jsdbAxios.interceptors.response.use(async function (response) {
    if (Array.isArray(response.data)) {
        await response.data.map(async element => await parseData(element));
    } else if (_.isPlainObject(response.data)) {
        await parseData(response.data);
    }
    return response;
}, function (error) {
    return Promise.reject(error);
});

export function setServerUrl(baseUrl: string) {
    const oldBaseUrl = jsdbAxios.defaults.baseURL;
    if(oldBaseUrl !==baseUrl) {
        jsdbAxios.defaults.baseURL = baseUrl;
        startWs();
    }
}

export function setApiKey(apiKey: string) {
    jsdbAxios.defaults.headers.common['X-API-Key'] = apiKey;
}

class Auth extends EventEmitter {
    token: undefined | string;
    userId: undefined | string;

    constructor() {
        super()
        if (typeof process !== 'object') {
            this.token = localStorage.token;
            this.userId = localStorage.userId;
            if (this.token) jsdbAxios.defaults.headers.common['Authorization'] = `Bearer ${localStorage.token}`;
        }
        this.on('newListener', (event, listener) => {
            if (event === 'tokenChanged') {
                listener(this.token);
            }
        })
    }

    signOut = () => {
        delete localStorage.token;
        delete localStorage.userId;
        delete jsdbAxios.defaults.headers.common['Authorization'];
        this.emit('tokenChanged', undefined);
    }

    signIn = async (credentials: {email: string, password: string}) => {
        try {
            const {data: {token, userId}} = await jsdbAxios.post('/auth/signin', {...credentials});
            this.token = token;
            this.userId = userId;
            jsdbAxios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
            this.emit('tokenChanged', this.token);
            if (typeof process !== 'object') {
                localStorage.token = this.token;
                localStorage.userId = this.userId;
            }
            return true;
        } catch (e) {
            throw new Error(`Error logging in, verify email and password`);
        }
    }

    createAccount = async (credentials: {email: string, password: string}) => {
        try {
            const {data: {token, userId}} = await jsdbAxios.post('/auth/signup', {...credentials});
            this.token = token;
            this.userId = userId;
            jsdbAxios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
            this.emit('tokenChanged', this.token);
            if (typeof process !== 'object') {
                localStorage.token = this.token;
                localStorage.userId = this.userId;
            }
            return true;
        } catch (e) {
            throw new Error(`Error logging in, verify email and password`);
        }
    }
}

export const auth = new Auth();

// @ts-ignore
function nestedProxyFactory(path: string[]) {
    let resolve: { (arg0: any): void; (value?: unknown): void; };
    let reject: (reason?: any) => void;

    const proxyPromise = new Promise((_resolve, _reject) => {
        resolve = _resolve;
        reject = _reject;
    });

    return new Proxy(proxyPromise, {
        get(target, property) {
            if (property === '__fullPath') {
                return path.join('.')
            } else if (property === 'then') {
                const data = {collection: path[0], id: path[1], path: path.slice(2)};
                jsdbAxios.post('/db/get', data).then(result => {
                    resolve(result.data.value);
                }).catch(reject);
                return target[property].bind(proxyPromise);
            }
            if (property === 'subscribe') {
                return subscriptionFactory(path.join('.'), {
                    collection: path[0],
                    id: path[1],
                    path: path.slice(2)
                }, 'get');
            } else {
                return nestedProxyFactory([...path, property.toString()]);
            }
        },
        // @ts-ignore
        set(target, property, value) {
            const newPath = [...path, property]
            const data = {collection: newPath[0], id: newPath[1], path: newPath.slice(2), value};
            return (async () => {
                try {
                    const result = await jsdbAxios.post('/db/set', data);
                    resolve(result.data);
                    return true;
                } catch (e) {
                    reject(e)
                    return false;
                }
            })();
        },
        // @ts-ignore
        deleteProperty(target, property) {
            const newPath = [...path, property]
            const data = {collection: newPath[0], id: newPath[1], path: newPath.slice(2)};
            return (async () => {
                try {
                    const result = await jsdbAxios.post('/db/delete', data);
                    resolve(result.data);
                    return true;
                } catch (e) {
                    reject(e)
                    return false;
                }
            })();
        }
    })
}

export class DatabaseMap {
    collection: string;


    proxy = new Proxy(this, {
        // @ts-ignore
        set(target, property, value) {
            const data = {collection: target.collection, id: property, value};
            return (async () => {
                try {
                    await jsdbAxios.post('/db/set', data);
                    return true;
                } catch (e) {
                    return false;
                }
            })();
        },
        get(target, property, receiver) {
            return Reflect.get(target, property, receiver) || nestedProxyFactory([target.collection, property.toString()]);
        },
        // @ts-ignore
        deleteProperty(target, property) {
            return (async () => {
                const result = await jsdbAxios.post('/db/delete', {collection: target.collection, id: property});
                return result.data.value;
            })();
        }
    });

    async clear() {
        const result = await jsdbAxios.post('/db/clear', {collection: this.collection});
        return result.data.value;
    }

    async set(key: string, value: any) {
        await jsdbAxios.post('/db/set', {collection: this.collection, id: key, value});
        return this;
    }

    async get(key: string) {
        const result = await jsdbAxios.post('/db/get', {collection: this.collection, id: key});
        return <document>result.data.value;
    }

    async entries() {
        const result = await jsdbAxios.post('/db/entries', {collection: this.collection});
        const resultMap = new Map();
        result.data.forEach((element: document) => {
            resultMap.set(element._id, element);
        });
        return resultMap.entries();
    }

    async values() {
        const result = await jsdbAxios.post('/db/values', {collection: this.collection});
        const resultMap = new Map();
        result.data.forEach((element: document) => {
            resultMap.set(element._id, element);
        });
        return resultMap.values();
    }

    async forEach(callbackFn: fn) {
        const result = await jsdbAxios.post('/db/forEach', {collection: this.collection});
        return result.data.forEach(callbackFn);
    }

    async has(key: string) {
        const result = await jsdbAxios.post('/db/has', {collection: this.collection, id: key});
        return result.data.value;
    }

    async delete(key: string) {
        const result = await jsdbAxios.post('/db/delete', {collection: this.collection, id: key});
        return result.data.value;
    }

    // @ts-ignore
    get size() {
        return (async () => {
            const result = await jsdbAxios.post('/db/size', {collection: this.collection});
            return result.data.value;
        })();
    }

    async keys() {
        const result = await jsdbAxios.post('/db/keys', {collection: this.collection});
        return result.data;
    }

    async* [Symbol.asyncIterator]() {
        const result = await jsdbAxios.post('/db/getAll', {collection: this.collection});
        yield* result.data
    }

    constructor (collection: string) {
        this.collection = collection;
        return this.proxy;
    }
}

export class DatabaseArray{
    collection: string;

    async* [Symbol.asyncIterator]() {
        const result = await jsdbAxios.post('/db/getAll', {collection: this.collection});
        yield* result.data
    }

    // @ts-ignore
    get size() {
        return (async () => {
            const result = await jsdbAxios.post('/db/length', {collection: this.collection});
            return result.data.value;
        })();
    }

    async map(callbackFn: fn, thisArg = {}) {
        const result = await jsdbAxios.post('/db/map', {
            collection: this.collection,
            callbackFn: callbackFn.toString(),
            thisArg
        });
        return result.data;
    }

    filter(callbackFn: fn, thisArg = {}) {
        const data = {
            collection: this.collection,
            callbackFn: callbackFn
                .toString(),
            thisArg
        }
        // @ts-ignore
        return {
            async then(successFn: fn, errorFn: fn) {
                try {
                    const result = await jsdbAxios.post('/db/filter', data);
                    successFn(result.data);
                } catch (e) {
                    errorFn(e)
                }
            },
            // @ts-ignore
            get subscribe() {
                const eventName = `${data.collection}.filter(${callbackFn.toString()},${JSON.stringify(thisArg)})`;
                return subscriptionFactory(eventName, data, 'filter');
            }
        };
    }

    async slice(start=0, end?: number ) {
        const result = await jsdbAxios.post('/db/slice', {
            collection: this.collection,
            start,
            end
        });
        return result.data;
    }

    async find(callbackFn: fn, thisArg = {}) {
        const result = await jsdbAxios.post('/db/find', {
            collection: this.collection,
            callbackFn: callbackFn
                .toString(),
            thisArg
        });
        return result.data.value
    }

    async forEach(callback: fn) {
        const result = await jsdbAxios.post(
            '/db/getAll',
            {collection: this.collection}
        );
        return result.data.forEach(callback);
    }

    async push(value: any) {
        const result = await jsdbAxios.post(
            '/db/push',
            {collection: this.collection, value}
        );
        return result.data.value;
    }


    proxy = new Proxy(this, {
        // @ts-ignore
        set: function (target, property, value) {
            const data = {collection: target.collection, id: property, value};
            return (async () => {
                try {
                    await jsdbAxios.post('/db/set', data);
                    return true;
                } catch (e) {
                    return false;
                }
            })();
        },
        get(target, property, receiver) {
            if (property === 'length') property = 'size';
            return Reflect.get(target, property, receiver) || nestedProxyFactory([target.collection, property.toString()]);
        },
        // @ts-ignore
        deleteProperty(target, property) {
            return (async () => {
                const result = await jsdbAxios.post('/db/delete', {collection: target.collection, id: property});
                return result.data.value;
            })();
        }
    });

    constructor(collection: string) {
        this.collection = collection;
        return this.proxy;
    }
}

export const functions = new Proxy({}, {
    get(_target, property) {
        return async (data: any) => (await jsdbAxios.post(`/functions/${property.toString()}`, data)).data;
    }
})

if(typeof window !== "undefined") {
    setServerUrl(window.location.origin);
}
