import {DatabaseArray, DatabaseMap} from '@jsdb/sdk';
import crypto from 'crypto';
const accessTokens = new DatabaseArray('accessTokens')

function makeId(length = 64) {
  const uidChars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const bytes = crypto.pseudoRandomBytes(length)
  const chars = [];
  for (let i = 0; i < bytes.length; i++) {
    const char = uidChars[bytes[i] % uidChars.length]
    chars.push(char);
  }
  return chars.join('');
}

async function getAccessTokenId() {
  const accessTokens = new DatabaseMap('accessTokens')
  let taken, token;
  do {
    token = makeId();
    taken = await accessTokens.get(token);
  } while (taken)
  return token
}
export async function createAccessToken(userId) {
  const token = {
    id: await getAccessTokenId(),
    value: {
      userId,
      createdAt: new Date(),
    }
  }
  await (accessTokens[token.id] = token.value);
  return {id: token.id, ...token.value}
}
export async function validateAccessToken(accessTokenId) {
    const accessToken = await  accessTokens[accessTokenId];
    if (accessToken) {
      return accessToken;
    }
    throw 'token not valid';
}
