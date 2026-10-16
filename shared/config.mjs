// Model serving config — read from environment, never hardcode keys.
// .env (gitignored) provides GROQ_API_KEY.
export const GROQ_BASE = process.env.GROQ_BASE_URL ?? 'https://api.groq.com/openai/v1';
export const GROQ_KEY = process.env.GROQ_API_KEY;
/** Fast/cheap: chat loop, drafting, tool selection. Open weights (Apache 2.0). */
export const MODEL_FAST = process.env.MODEL_FAST ?? 'openai/gpt-oss-20b';
/** Stronger: clause extraction with structured outputs. Open weights. */
export const MODEL_STRONG = process.env.MODEL_STRONG ?? 'openai/gpt-oss-120b';

if (!GROQ_KEY) {
  console.error('Missing GROQ_API_KEY — put it in .env (see .gitignore).');
}
