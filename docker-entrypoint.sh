#!/bin/sh

npm install -g pnpm@9.15.4

npm install -g @nestjs/cli

pnpm install

pnpm build

# pnpm run migration:run

# pnpm seed

node dist/src/main.js
