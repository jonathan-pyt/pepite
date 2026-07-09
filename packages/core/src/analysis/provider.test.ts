import { describe, expect, it } from "vitest";
import { createModel } from "./provider";

describe("createModel", () => {
  it("openai sans baseURL : API Responses officielle", () => {
    const model = createModel({ provider: "openai", apiKey: "k", model: "gpt-5-mini" }) as {
      provider: string;
    };
    expect(model.provider).toBe("openai.responses");
  });

  it("openai avec baseURL : chat completions, seule surface commune des endpoints compatibles", () => {
    const model = createModel({
      provider: "openai",
      apiKey: "k",
      model: "qwen3",
      baseURL: "http://localhost:11434/v1",
    }) as { provider: string };
    expect(model.provider).toBe("openai.chat");
  });
});
