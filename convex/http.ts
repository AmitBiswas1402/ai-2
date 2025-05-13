import { httpRouter } from "convex/server";
import { WebhookEvent } from "@clerk/nextjs/server";
import { Webhook } from "svix";
import { api } from "./_generated/api";
import { httpAction } from "./_generated/server";

const http = httpRouter();

http.route({
  path: "/clerk-webhook",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const webhookSecret = process.env.CLERK_WEBHOOK_SECRET;
    if (!webhookSecret) throw new Error("Missing CLERK_WEBHOOK_SECRET");

    const svix_id = request.headers.get("svix-id");
    const svix_signature = request.headers.get("svix-signature");
    const svix_timestamp = request.headers.get("svix-timestamp");

    if (!svix_id || !svix_signature || !svix_timestamp) {
      return new Response("Missing Svix headers", { status: 400 });
    }

    const payload = await request.json();
    const body = JSON.stringify(payload);
    const wh = new Webhook(webhookSecret);

    let evt: WebhookEvent;
    try {
      evt = wh.verify(body, {
        "svix-id": svix_id,
        "svix-timestamp": svix_timestamp,
        "svix-signature": svix_signature,
      }) as WebhookEvent;
    } catch (err) {
      console.error("Webhook verification failed:", err);
      return new Response("Invalid signature", { status: 400 });
    }

    const eventType = evt.type;

    if (eventType === "user.created") {
      const { id, first_name, last_name, email_addresses, image_url } =
        evt.data;
      const name = `${first_name || ""} ${last_name || ""}`.trim();
      const email = email_addresses[0]?.email_address || "";

      try {
        await ctx.runMutation(api.users.syncUser, {
          clerkId: id,
          name,
          email,
          image: image_url,
        });
      } catch (error) {
        console.error("Error syncing new user:", error);
        return new Response("User creation failed", { status: 500 });
      }
    }

    if (eventType === "user.updated") {
      const { id, first_name, last_name, email_addresses, image_url } =
        evt.data;
      const name = `${first_name || ""} ${last_name || ""}`.trim();
      const email = email_addresses[0]?.email_address || "";

      try {
        await ctx.runMutation(api.users.updateUser, {
          clerkId: id,
          name,
          email,
          image: image_url,
        });
      } catch (error) {
        console.error("Error updating user:", error);
        return new Response("User update failed", { status: 500 });
      }
    }

    return new Response("Webhook processed", { status: 200 });
  }),
});

export default http;