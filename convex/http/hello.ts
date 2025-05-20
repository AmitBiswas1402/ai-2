// convex/http/hello.ts
import { internalAction } from "./_generated/server";

export const hello = internalAction(async (ctx, request) => {
  return new Response("Hello from Convex HTTP!");
});
