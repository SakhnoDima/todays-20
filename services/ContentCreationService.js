import { OpenAI } from "openai";
import dotenv from "dotenv";

dotenv.config();

class OpenAIService {
  constructor(apiKey) {
    this.openai = new OpenAI({ apiKey });
  }

  async generateContent(productTitle, productDescription, productMarketplace) {
    try {
      const assistantId = "asst_niVbVVVkvnt6wpWm9cPCsZcI";
      const message = `
        title: ${productTitle};
        description: ${productDescription};
        marketplace: ${productMarketplace};
      `;
      return await this.#runSequence(assistantId, message);
    } catch (error) {
      console.error("Generate answers error:", error);
      throw new Error("Generate answers error:");
    }
  }

  async #runSequence(assistantId, message) {
    try {
      const threadId = await this.#createThread();
      await this.#addMessage(threadId, message);
      const run = await this.#runAssistant(assistantId, threadId);
      return await this.#checkingStatus(threadId, run.id);
    } catch (error) {
      console.error("Run sequence error:", error);
      throw new Error("AI error:");
    }
  }

  async #createThread() {
    try {
      console.log("Creating a new thread...");
      const thread = await this.openai.beta.threads.create();
      return thread.id;
    } catch (error) {
      console.error("Create thread error:", error);
      throw new Error("AI error");
    }
  }

  async #addMessage(threadId, message) {
    try {
      return this.openai.beta.threads.messages.create(threadId, {
        role: "user",
        content: message,
      });
    } catch (error) {
      console.error("Add message error:", error);
      throw new Error("AI error");
    }
  }

  async #runAssistant(assistantId, threadId) {
    try {
      console.log("Running assistant for", threadId);
      return this.openai.beta.threads.runs.create(threadId, {
        assistant_id: assistantId,
      });
    } catch (error) {
      console.error("Run assistant error:", error);
      throw new Error("AI error");
    }
  }

  async #checkingStatus(threadId, runId) {
    try {
      return new Promise((resolve) => {
        const pollingInterval = setInterval(async () => {
          const runObject = await this.openai.beta.threads.runs.retrieve(
            threadId,
            runId
          );

          console.log("Current status:", runObject.status);

          if (runObject.status === "completed") {
            clearInterval(pollingInterval);
            const messagesList = await this.openai.beta.threads.messages.list(
              threadId
            );
            const messages = messagesList.body.data.map((msg) => msg.content);
            resolve(messages[0][0].text.value);
          }
        }, 2000);
      });
    } catch (error) {
      console.error("Check assistant status error:", error);
      throw new Error("AI error");
    }
  }
}

export default new OpenAIService(process.env.API_KEY_OPEN_AI);
