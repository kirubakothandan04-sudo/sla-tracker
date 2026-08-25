import { createServer } from "node:http";
import { createYoga, maskError } from "graphql-yoga";
import { GraphQLError } from "graphql";
import { schema } from "./graphql/schema";
import { createContext } from "./graphql/context";

const PORT = Number(process.env.PORT ?? 4000);

const yoga = createYoga({
  schema,
  context: createContext,
  graphqlEndpoint: "/graphql",
  maskedErrors: {
    maskError(error, message, isDev) {
      // Preserve our intentional, code-tagged application errors as-is;
      // mask anything unexpected so internals never leak to clients.
      if (error instanceof GraphQLError && error.extensions?.code) {
        return error;
      }
      return maskError(error, message, isDev);
    },
  },
});

const server = createServer(yoga);

server.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`SLA Tracker API ready at http://localhost:${PORT}/graphql`);
});
