import path from "path";
import url from "url";
import fsPromises from "fs/promises";
import AdmZip from "adm-zip";

export const triggers = {};
export const rules = {};
export const functions = {};

export async function importFromPath(extractedBundlePath) {
  const dbCollectionDirs = await fsPromises.readdir(path.resolve(extractedBundlePath,'db'));
  dbCollectionDirs.push('default');
  await Promise.all(dbCollectionDirs.map(async collectionDir => {
    try {
      rules[collectionDir] = await import(path.resolve(extractedBundlePath, 'db', collectionDir, 'rules.js'))
    } catch (e) {
      if(e.code !== 'ERR_MODULE_NOT_FOUND')console.error(e)
    }
    try {
      triggers[collectionDir] = await import(path.resolve(extractedBundlePath, 'db',collectionDir, 'triggers.js'))
    } catch (e) {
      if(e.code !== 'ERR_MODULE_NOT_FOUND')console.error(e)
    }
  }));

  try {
    const functionFileNames = (await fsPromises.readdir(path.resolve(extractedBundlePath,'functions')))
      .filter(name => name.includes('.js'));
    await Promise.all(functionFileNames.map(async (functionFileName) => {
      try {
        const functionName = functionFileName.replace('.js', '');
        functions[functionName] = await import(path.resolve(extractedBundlePath, 'functions', functionFileName));
      } catch (e) {
        console.error(e);
      }
    }));
  } catch (e) {
    if(e.code !== 'ENOENT')console.error(e);
  }

  const bundleHostingPath = path.resolve(extractedBundlePath,'hosting')
  const serverHostingPath = path.resolve(process.cwd(),'.jsdb','hosting')
  console.log({rules, triggers, functions});
  try {
    if(bundleHostingPath !== serverHostingPath) {
      console.log('Copy hosting from', bundleHostingPath, serverHostingPath);
      await fsPromises.cp(bundleHostingPath, serverHostingPath, {recursive: true,force: true});
    }
  } catch (e) {
    if(e.code !== 'ENOENT')console.error(e);
  }
}

export async function importFromBase64 (base64) {
  // TODO : do this without writing a temporal zip file to FS
  const tmpBundlePath = path.resolve(process.cwd(),'.tmpJsdbBundle.zip');
  await fsPromises.writeFile(tmpBundlePath, Buffer.from(base64, 'base64'));
  const zip = new AdmZip(tmpBundlePath);
  const tempJsdbPath = path.resolve(process.cwd(),'.jsdb-temp');
  zip.extractAllTo(tempJsdbPath, true);
  await importFromPath(tempJsdbPath);
  fsPromises.rm(tmpBundlePath)
  fsPromises.rm(tempJsdbPath, { recursive: true, force: true });
}

const defaultsPath = path.resolve(url.fileURLToPath(import.meta.url), '../.jsdb');

await importFromPath(defaultsPath);
