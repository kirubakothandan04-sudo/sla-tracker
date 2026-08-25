import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadFilesSync } from "@graphql-tools/load-files";
import { mergeTypeDefs } from "@graphql-tools/merge";
import { makeExecutableSchema } from "@graphql-tools/schema";
import { resolvers } from "./resolvers/index";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const typeDefsArray = loadFilesSync(path.join(__dirname, "schema/**/*.graphql"));
const typeDefs = mergeTypeDefs(typeDefsArray);

export const schema = makeExecutableSchema({ typeDefs, resolvers });
