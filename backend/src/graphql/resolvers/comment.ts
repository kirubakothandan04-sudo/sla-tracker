import { GraphQLContext, requireAuth } from "../context";
import { ticketService } from "../../services/ticket/ticketService";

interface AddCommentArgs {
  ticketId: string;
  content: string;
}

export const commentResolvers = {
  Mutation: {
    addComment: async (_parent: unknown, args: AddCommentArgs, ctx: GraphQLContext) => {
      const user = requireAuth(ctx);
      return ticketService(ctx.db).addComment(args.ticketId, user.id, args.content);
    },
  },
  Comment: {
    ticketId: (parent: { ticketId: string }) => parent.ticketId,
  },
};
