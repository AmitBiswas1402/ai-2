import { httpRouter } from "convex/server";
import { WebhookEvent } from "@clerk/nextjs/server";
import { Webhook } from "svix";
import { api } from "./_generated/api";
import { httpAction } from "./_generated/server";
import { GoogleGenerativeAI } from "@google/generative-ai";

const http = httpRouter();
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

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

http.route({
  path: "/vapi/generate-program",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const payload = await request.json();

      const {
        user_id,
        topic,
        no_of_question,
        level
      } = payload;

      console.log("Payload is here:", payload);

      const model = genAI.getGenerativeModel({
        model: "gemini-2.0-flash-001",
        generationConfig: {
          temperature: 0.4, // lower temperature for more predictable outputs
          topP: 0.9,
          responseMimeType: "application/json",
        },
      });

    } catch (error) {
      
    }
  })
})

export default http;