// Shared Groq chat helper — one home for the retry/backoff logic.
// jsonSchema given → parsed JSON; tools given → {message} (may contain tool_calls); otherwise raw string.
import { GROQ_BASE, GROQ_KEY } from './config.mjs';

export async function groqChat(messages, { model, jsonSchema, tools, temperature = 0 } = {}) {
  for (let attempt = 1; attempt <= 6; attempt++) {
    const res = await fetch(`${GROQ_BASE}/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${GROQ_KEY}` },
      body: JSON.stringify({
        model,
        temperature,
        ...(jsonSchema ? { response_format: { type: 'json_schema', json_schema: jsonSchema } } : {}),
        ...(tools ? { tools } : {}),
        messages,
      }),
    });
    if (res.ok) {
      const data = await res.json();
      const content = data.choices[0].message.content;
      if (tools) return { message: data.choices[0].message, usage: data.usage };
      return jsonSchema ? JSON.parse(content) : content;
    }
    const text = await res.text();
    if (res.status === 429 && attempt < 6) {
      const m = text.match(/try again in ([\d.]+)s/i);
      await new Promise(r => setTimeout(r, ((m ? parseFloat(m[1]) : 20) + 2) * 1000));
      continue;
    }
    throw new Error(`Groq ${res.status}: ${text.slice(0, 200)}`);
  }
}
