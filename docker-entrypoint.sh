#!/bin/sh

npm install -g pnpm

npm install -g @nestjs/cli

npm install

npm build

# pnpm run migration:run

# pnpm seed

node dist/src/main.js
