// TODO : set default rules for users collection

export const get = ({...props}) => {
  console.log(props);
  return true;
}

export const set = ({req: {token}}) => {
  console.log(token);
  return true;
  // throw Error('You are not logged in.');
}