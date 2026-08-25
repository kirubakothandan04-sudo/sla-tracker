import { userResolvers } from "./user";
import { authResolvers } from "./auth";
import { holidayResolvers } from "./holiday";
import { commentResolvers } from "./comment";
import { ticketResolvers } from "./ticket";

export const resolvers = {
  Query: {
    ...userResolvers.Query,
    ...holidayResolvers.Query,
    ...ticketResolvers.Query,
  },
  Mutation: {
    ...authResolvers.Mutation,
    ...commentResolvers.Mutation,
    ...ticketResolvers.Mutation,
  },
  Ticket: ticketResolvers.Ticket,
  Comment: commentResolvers.Comment,
};
