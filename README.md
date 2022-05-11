Install jsdb server
```shell
npm i @jsdb/server
```

Create file called server.js
```js
import {start} from "@jsdb/server";
start();
```

Create .env file
```dotenv
# Used to sign jwt tokens
JWT_SECRET="SUPER_SECRET_KEY"

# Nodejs server port
PORT=3001

# Max requests per minute from the same IP
RATE_LIMIT=10000
```
Run your server
```shell
node .
```

Check the docs https://javascriptdb.com/docs

