# # syntax=docker/dockerfile:1
# # Comments are provided throughout this file to help you get started.
# # If you need more help, visit the Dockerfile reference guide at
# # https://docs.docker.com/go/dockerfile-reference/
# # Want to help us make this template better? Share your feedback here: https://forms.gle/ybq9Krt8jtBL3iCk7
# ARG NODE_VERSION=20.16.0
# ARG PNPM_VERSION=9.6.0
# ################################################################################
# # Use node image for base image for all stages.
# FROM node:${NODE_VERSION}-alpine as base
# # Set working directory for all build stages.
# WORKDIR /usr/src/app
# # Install pnpm.
# RUN --mount=type=cache,target=/root/.npm \
#     npm install -g pnpm@${PNPM_VERSION}
# ################################################################################
# # Create a stage for installing production dependecies.
# FROM base as deps
# # Download dependencies as a separate step to take advantage of Docker's caching.
# # Leverage a cache mount to /root/.local/share/pnpm/store to speed up subsequent builds.
# # Leverage bind mounts to package.json and pnpm-lock.yaml to avoid having to copy them
# # into this layer.
# RUN --mount=type=bind,source=package.json,target=package.json \
#     --mount=type=bind,source=pnpm-lock.yaml,target=pnpm-lock.yaml \
#     --mount=type=cache,target=/root/.local/share/pnpm/store \
#     pnpm install --prod --frozen-lockfile
# ################################################################################
# # Create a stage for building the application.
# FROM deps as build
# # Download additional development dependencies before building, as some projects require
# # "devDependencies" to be installed to build. If you don't need this, remove this step.
# RUN --mount=type=bind,source=package.json,target=package.json \
#     --mount=type=bind,source=pnpm-lock.yaml,target=pnpm-lock.yaml \
#     --mount=type=cache,target=/root/.local/share/pnpm/store \
#     pnpm install --frozen-lockfile
# # Copy the rest of the source files into the image.
# COPY . .
# # Run the build script.
# RUN pnpm run build
# ################################################################################
# # Create a new stage to run the application with minimal runtime dependencies
# # where the necessary files are copied from the build stage.
# FROM base as final
# # Use production node environment by default.
# ENV NODE_ENV production
# # Run the application as a non-root user.
# USER node
# # Copy package.json so that package manager commands can be used.
# COPY package.json .
# # Copy the production dependencies from the deps stage and also
# # the built application from the build stage into the image.
# COPY --from=deps /usr/src/app/node_modules ./node_modules
# COPY --from=build /usr/src/app/dist ./dist
# # Expose the port that the application listens on.
# EXPOSE 3000
# # Run the application.
# CMD pnpm start:prod



FROM node:18.18.2-alpine

RUN apk update

RUN apk add openjdk11

RUN mkdir -p /app

COPY . /app

WORKDIR /app

ARG PORT
ENV PORT=${PORT}

ARG USER_DEFAULT_PASSWORD
ENV USER_DEFAULT_PASSWORD=${USER_DEFAULT_PASSWORD}

ARG JWT_SECRET
ENV JWT_SECRET=${JWT_SECRET}

ARG ENCRYPTION_KEY
ENV ENCRYPTION_KEY=${ENCRYPTION_KEY}

ARG INITIATION_VECTOR
ENV INITIATION_VECTOR=${INITIATION_VECTOR}

ARG NODE_ENV
ENV NODE_ENV=${NODE_ENV}

ARG POSTGRES_USER
ENV POSTGRES_USER=${POSTGRES_USER}

ARG POSTGRES_PASSWORD
ENV POSTGRES_PASSWORD=${POSTGRES_PASSWORD}

ARG POSTGRES_DB
ENV POSTGRES_DB=${POSTGRES_DB}

ARG POSTGRES_PORT
ENV POSTGRES_PORT=${POSTGRES_PORT}

ARG POSTGRES_HOST
ENV POSTGRES_HOST=${POSTGRES_HOST}

EXPOSE ${PORT}

ADD docker-entrypoint.sh /usr/local/bin/

RUN chmod +x /usr/local/bin/docker-entrypoint.sh

ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
