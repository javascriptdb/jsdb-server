const opHandlers = global.opHandlers;

export default async function () {
  const timeStart = Date.now();
  for(let i = 0; i<10000;i++) {
    opHandlers.set({collection:'serverLogs', value:{type: 'info', text: 'LIVE LOG!', date: new Date()}})
  }
  const timeEnd = Date.now();
  opHandlers.clear({collection: 'serverLogs'});
  return {time: (timeEnd-timeStart)};
}