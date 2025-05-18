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

function validateInterviewPlan(plan: any) {
  const validatedPlan = {
    topic: plan.topic,
    level: plan.level,
    questions: Array.isArray(plan.questions)
      ? plan.questions.map((q: any) => ({
          question: typeof q.question === "string" ? q.question : "",
          answer: typeof q.answer === "string" ? q.answer : "",
        }))
      : [],
  };
  return validatedPlan;
}


http.route({
  path: "/vapi/generate-program",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const payload = await request.json();

      const { user_id, topic, no_of_question, level } = payload;

      console.log("Payload is here:", payload);

      const model = genAI.getGenerativeModel({
        model: "gemini-2.0-flash-001",
        generationConfig: {
          temperature: 0.4, // lower temperature for more predictable outputs
          topP: 0.9,
          responseMimeType: "application/json",
        },
      });

      const interviewPrompt = `You are an experienced technical interviewer generating personalized interview questions based on:
      Topic: ${topic}
      Number of Questions: ${no_of_question}
      Difficulty Level: ${level}
      
      As a professional interviewer:
      - Select relevant questions from the topic and ensure the difficulty matches the specified level
      - Focus on high-quality questions commonly asked in real-world interviews
      - Do not include explanations, answers, or any metadata
      - All questions should be direct, clear, and to the point

      CRITICAL SCHEMA INSTRUCTIONS:
      - Your output MUST contain ONLY the fields specified below, NO ADDITIONAL FIELDS
      - You must return exactly ${no_of_question} questions
      - Each question must include ONLY the "question" field
      - DO NOT include fields like "answer", "difficulty", "tags", or anything else
      - Your response must be valid JSON with no extra text before or after the JSON

      Return a JSON object with this EXACT structure:
      {
        "topic": "${topic}",
        "level": "${level}",
        "questions": [
          {
            "question": "Your question text here"
          }
        ]
      }

      DO NOT add any fields that are not in this example. Your response must be a valid JSON object with no additional text.`;

      const interviewResult = await model.generateContent(interviewPrompt);
      const interviewText = interviewResult.response.text();

      // VALIDATE THE INPUT COMING FROM AI
      let interviewPlan = JSON.parse(interviewText);
      interviewPlan = validateInterviewPlan(interviewPlan); // you should define this

      // Save to your DB (CONVEX)
      const planId = await ctx.runMutation(api.plans.createPlan, {
        userId: user_id,
        interviewPlan,
        isActive: true,
        name: `${topic} Interview - ${new Date().toLocaleDateString()}`,
      });

      return new Response(
        JSON.stringify({
          success: true,
          data: {
            planId,
            interviewPlan,
          },
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }
      );
    } catch (error) {
      console.error("Error generating interview plan:", error);

      return new Response(
        JSON.stringify({
          success: false,
          error: error instanceof Error ? error.message : String(error),
        }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }
      );
    }
  }),
});

export default http;