# Better support of Docker layer caching in Cargo:
# https://hackmd.io/@kobzol/S17NS71bh#Using-cargo-chef
# https://github.com/LukeMathWalker/cargo-chef#without-the-pre-built-image


# install cargo-chef and toolchain, to be reused in other stages
FROM rust:1.78-bookworm as chef
RUN cargo install cargo-chef
RUN rustup install stable # should match the channel in rust-toolchain.toml
WORKDIR app



# only prepares the build plan
FROM chef as planner
COPY . .
# Prepare a build plan ("recipe")
RUN cargo chef prepare --recipe-path recipe.json


# build the project with a cached dependency layer
FROM chef as builder
# for alpine: RUN apk add git cmake make g++ musl-dev openssl-dev sqlite-dev
RUN apt-get update && apt-get install --yes git cmake make g++ libssl-dev libsqlite3-dev

# Copy the build plan from the previous Docker stage
COPY --from=planner /app/recipe.json recipe.json
# Build dependencies - this layer is cached as long as `recipe.json` doesn't change.
RUN cargo chef cook --release --recipe-path recipe.json
# Build the full project
COPY rust-toolchain.toml Cargo.toml Cargo.lock ./
COPY ./src ./src
COPY ./.sqlx ./.sqlx
COPY ./migrations ./migrations
RUN SQLX_OFFLINE=true cargo build --locked --release # --features embed_migrations
RUN SQLX_OFFLINE=true cargo run --locked --release -- generate-openapi --output-path openapi.json # --features embed_migrations


# run frontend-build
FROM node:alpine as frontend-builder
WORKDIR app
COPY ./flwi-spacetraders-leaderboard ./flwi-spacetraders-leaderboard
COPY --from=builder /app/openapi.json ./flwi-spacetraders-leaderboard/openapi-spec/openapi.json
WORKDIR ./flwi-spacetraders-leaderboard
RUN yarn install
RUN yarn codegen
RUN yarn build


# copy the binary to a minimal image
# after that the executable is called "app"
FROM debian:bookworm-slim
RUN apt-get update && apt-get install --yes ca-certificates openssl sqlite3 && rm -rf /var/lib/apt/lists/*
COPY --from=builder /app/target/release/flwi-spacetraders-leaderboard /usr/local/bin/app
COPY --from=frontend-builder /app/flwi-spacetraders-leaderboard/dist /dist
CMD ["app", "run-server"]
