import "reflect-metadata";
import { Test } from "@nestjs/testing";
import { afterEach, describe, expect, it } from "vitest";
import { chatCoachProvider, CoachModule } from "../src/coach/coach.module.js";
import { GeminiCoachProvider } from "../src/coach/gemini-coach.provider.js";
import { TemplateCoachProvider } from "../src/coach/template-coach.provider.js";
import { CHAT_COACH_PROVIDER, COACH_PROVIDER } from "../src/common/injection-tokens.js";
import { classifyQuestion, type ChargeFacts } from "../src/domain/charge-chat.js";

const modelOf = (p: unknown) => (p as { model: string }).model;

describe("charge chat's own Gemini key (GEMINI_CHAT_API_KEY)", () => {
  const shared = new TemplateCoachProvider();

  it("shares the Missions coach when no chat key is set", () => {
    expect(chatCoachProvider(shared, {})).toBe(shared);
    expect(chatCoachProvider(shared, { GEMINI_CHAT_API_KEY: "  " })).toBe(shared);
  });

  it("gets its own Gemini client with the chat key, on GEMINI_CHAT_MODEL, else GEMINI_MODEL", () => {
    const own = chatCoachProvider(shared, { GEMINI_CHAT_API_KEY: "chat-key", GEMINI_CHAT_MODEL: "chat-model", GEMINI_MODEL: "main-model" });
    expect(own).not.toBe(shared);
    expect(own).toBeInstanceOf(GeminiCoachProvider);
    expect(modelOf(own)).toBe("chat-model");
    expect(modelOf(chatCoachProvider(shared, { GEMINI_CHAT_API_KEY: "chat-key", GEMINI_MODEL: "main-model" }))).toBe("main-model");
  });

  describe("CoachModule", () => {
    const saved = { ...process.env };
    afterEach(() => { process.env = { ...saved }; });

    const resolve = async () => {
      const moduleRef = await Test.createTestingModule({ imports: [CoachModule] }).compile();
      return { missions: moduleRef.get(COACH_PROVIDER), chat: moduleRef.get(CHAT_COACH_PROVIDER) };
    };

    it("injects one shared coach without a chat key", async () => {
      delete process.env.GEMINI_CHAT_API_KEY;
      const { missions, chat } = await resolve();
      expect(chat).toBe(missions);
    });

    it("injects a separate chat coach with a chat key", async () => {
      process.env.GEMINI_CHAT_API_KEY = "chat-key";
      const { missions, chat } = await resolve();
      expect(chat).not.toBe(missions);
      expect(chat).toBeInstanceOf(GeminiCoachProvider);
    });
  });
});

describe("classifyQuestion: which way did it move vs. how to lower it", () => {
  const facts = { line: "Generation" } as ChargeFacts;

  it.each([
    "does my bill go higher or lower",
    "did generation go up or down?",
    "is it lower or higher than last month",
    "tumaas o bumaba ba ito?",
    "increased or decreased?",
  ])("%j asks which way it moved → why", (q) => {
    expect(classifyQuestion(q, facts)).toBe("why");
  });

  it.each(["Can I lower this?", "paano ko babaan ito", "how do I reduce this charge"])("%j still asks how to lower it", (q) => {
    expect(classifyQuestion(q, facts)).toBe("lower");
  });

  it("other intents are unchanged", () => {
    expect(classifyQuestion("Why did this go up?", facts)).toBe("why");
    expect(classifyQuestion("Who sets this rate?", facts)).toBe("who");
    expect(classifyQuestion("Is this correct?", facts)).toBe("correct");
  });
});
