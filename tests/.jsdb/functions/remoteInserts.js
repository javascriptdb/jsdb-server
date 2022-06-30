const opHandlers = global.opHandlers;
export default async function () {
  const timeStart = Date.now();
  for(let i = 0; i<1000;i++) {
    opHandlers.push({collection:'serverLogs', value:{type: 'info', text: 'LIVE LOG!', date: new Date()}})
  }
  const timeEnd = Date.now();
  console.log('Size',opHandlers.size({collection: 'serverLogs'}));
  opHandlers.clear({collection: 'serverLogs'});
  return {time: (timeEnd-timeStart)};
  // return {time: 0}
}