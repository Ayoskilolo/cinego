#!/bin/sh

npm install -g pnpm

pnpm install

pnpm build

pnpm run migration:run

pnpm seed

node dist/src/main.js
