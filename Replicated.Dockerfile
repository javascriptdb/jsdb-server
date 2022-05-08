FROM node:18-slim

WORKDIR /usr/src/app

COPY package*.json ./

RUN npm install

ADD https://github.com/benbjohnson/litestream/releases/download/v0.3.8/litestream-v0.3.8-linux-amd64-static.tar.gz /tmp/litestream.tar.gz
RUN tar -C /usr/local/bin -xzf /tmp/litestream.tar.gz
COPY . .
COPY litestream.yml /etc/litestream.yml
EXPOSE 8080
ENTRYPOINT ["bash", "run.sh" ]