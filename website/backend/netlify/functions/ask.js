// POST /api/ask  { question: string, depth: "direct" | "structured" }
//
// Answers using ONLY the transcripts in ../../data/knowledge-index.json
// (synced from the "StoneCentury Knowledge Base Brain" Shared Drive,
// knowledge_base/ folder — see scripts/build-knowledge-index.js).
// Requires ANTHROPIC_API_KEY as a Netlify environment variable.

const knowledgeIndex = require("../../data/knowledge-index.json");
const { logUncoveredQuestion } = require("./lib/drive-logger");

const ALLOWED_ORIGINS = [
  "https://brock-source.github.io",
];

const ANSWER_TOOL = {
  name: "provide_vault_answer",
  description:
    "Provide a structured answer for The Vault, a knowledge tool on StoneCentury Financial's website.",
  input_schema: {
    type: "object",
    properties: {
      covered: {
        type: "boolean",
        description:
          "true if the supplied transcript excerpts actually contain material relevant to the question; false if they don't and you're giving a fallback response.",
      },
      body: {
        type: "array",
        description:
          "Ordered answer content. Each item is EITHER a plain paragraph string, OR an array of short strings to render as an arrow-list (use this for step/point breakdowns, only in structured depth).",
        items: {
          oneOf: [
            { type: "string" },
            { type: "array", items: { type: "string" } },
          ],
        },
      },
      sources: {
        type: "array",
        description:
          "Episodes actually drawn from in this answer. Empty array if covered=false. Never invent a source not present in the supplied excerpts.",
        items: {
          type: "object",
          properties: {
            title: { type: "string" },
            url: { type: "string" },
          },
          required: ["title", "url"],
        },
      },
      followups: {
        type: "array",
        description: "Exactly 2 natural follow-up questions, phrased as questions.",
        items: { type: "string" },
      },
      needs_booking: {
        type: "boolean",
        description:
          "true only if answering this well genuinely requires the asker's own numbers/situation, not for general philosophy questions.",
      },
      is_finance_related: {
        type: "boolean",
        description:
          "true if this is a genuine personal-finance/money question (cash flow, debt, insurance, retirement, taxes, wealth-building, etc.) regardless of whether the transcripts cover it. false for spam, greetings, test messages, or anything with no real connection to money.",
      },
    },
    required: ["covered", "body", "sources", "followups", "needs_booking", "is_finance_related"],
  },
};

function buildSystemPrompt() {
  const episodeBlocks = knowledgeIndex.episodes
    .map(
      (ep, i) =>
        `[Episode ${i + 1}] "${ep.title}" (${ep.show || "Cashflow Legendz"}, ${ep.url})\n${ep.text}`
    )
    .join("\n\n---\n\n");

  return `You are the answer engine behind "The Vault," a knowledge tool on StoneCentury Financial's website. You answer ONLY using the Cashflow Legendz podcast transcript excerpts below (Brock Fortner, co-hosted with Nate and Brandon). This library currently has ${knowledgeIndex.episode_count} fully-transcribed episode(s); more are being added over time, so it's normal for many questions to fall outside current coverage.

Rules:
- Never use outside financial knowledge or general advice — only what's stated in the excerpts below. Do not invent, extrapolate, or fill gaps with your own financial knowledge.
- If the excerpts don't genuinely cover the question, set covered=false, sources=[], and write a short, honest "don't have coverage on that yet" body — never guess just to seem helpful.
- If different episodes present different takes on the same question, present both explicitly, attributed by host name and/or episode title, rather than blending them into one voice.
- Voice: plain-spoken, a little contrarian, second person ("you"), no unexplained jargon. Match the source material's own phrasing where you can rather than generic financial-advice language.
- depth="direct": 2-3 sentences total, as 1-2 body items.
- depth="structured": a lead paragraph, then (if the material supports it) a labeled breakdown as one bullet-group array of short strings, then 1-2 closing paragraphs.
- Always produce exactly 2 follow-up questions a curious listener might ask next.
- needs_booking=true only when answering well truly requires the asker's own numbers or situation — not for general philosophy questions.
- Cite only episodes you actually drew from.
- Set is_finance_related=true for any genuine personal-finance/money question, even one these transcripts don't cover. Set it false only for spam, greetings, test messages ("test", "hello"), or questions unrelated to money.

TRANSCRIPT EXCERPTS:

${episodeBlocks}`;
}

function corsHeaders(origin) {
  const allow = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

exports.handler = async (event) => {
  const headers = corsHeaders(event.headers.origin || event.headers.Origin);

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers, body: "" };
  }
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  let question, depth;
  try {
    const parsed = JSON.parse(event.body || "{}");
    question = String(parsed.question || "").trim();
    depth = parsed.depth === "structured" ? "structured" : "direct";
  } catch {
    return { statusCode: 400, headers, body: JSON.stringify({ error: "Invalid JSON body" }) };
  }

  if (!question) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: "Missing question" }) };
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error("ANTHROPIC_API_KEY is not set");
    return { statusCode: 500, headers, body: JSON.stringify({ error: "Server not configured" }) };
  }

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-5",
        max_tokens: 1500,
        system: buildSystemPrompt(),
        messages: [
          {
            role: "user",
            content: `Depth requested: ${depth}\n\nQuestion: ${question}`,
          },
        ],
        tools: [ANSWER_TOOL],
        tool_choice: { type: "tool", name: "provide_vault_answer" },
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("Anthropic API error", response.status, errText);
      return { statusCode: 502, headers, body: JSON.stringify({ error: "Upstream error" }) };
    }

    const data = await response.json();
    const toolUse = (data.content || []).find((b) => b.type === "tool_use");
    if (!toolUse) {
      console.error("No tool_use block in response", JSON.stringify(data));
      return { statusCode: 502, headers, body: JSON.stringify({ error: "Malformed model response" }) };
    }

    const answer = toolUse.input;
    if (answer.covered === false && answer.is_finance_related === true) {
      try {
        await logUncoveredQuestion(question, depth);
      } catch (err) {
        console.error("Failed to log uncovered question to Drive", err);
      }
    }

    return {
      statusCode: 200,
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify(answer),
    };
  } catch (err) {
    console.error("ask function error", err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: "Internal error" }) };
  }
};
