#!/bin/sh

npm install -g pnpm

npm install -g @nestjs/cli

pnpm install

pnpm build

# pnpm run migration:run

# pnpm seed

node dist/src/main.js
