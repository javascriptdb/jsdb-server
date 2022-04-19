export default function ({req}){
  const apiKey = req.get('X-API-Key');
  if(apiKey !== process.env.API_KEY) {
    throw new Error('Invalid API Key');
  }
  return true;
}