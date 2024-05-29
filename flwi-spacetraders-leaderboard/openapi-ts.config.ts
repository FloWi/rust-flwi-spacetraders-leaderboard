import { defineConfig } from "@hey-api/openapi-ts";

export default defineConfig({
  input: "openapi-spec/openapi.json",
  output: {
    lint: "eslint",
    format: "prettier",
    path: "./generated",
  },
  client: "axios",
  types: {
    dates: true,
  },
});
