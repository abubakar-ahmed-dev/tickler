// Phase 0 gate: Groq reachable, key valid, structured output works.
import { GROQ_BASE, GROQ_KEY, MODEL_FAST } from '../shared/config.mjs';

const res = await fetch(`${GROQ_BASE}/chat/completions`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', authorization: `Bearer ${GROQ_KEY}` },
  body: JSON.stringify({
    model: MODEL_FAST,
    temperature: 0,
    response_format: {
      type: 'json_schema',
      json_schema: {
        name: 'hello',
        schema: {
          type: 'object',
          properties: { ok: { type: 'boolean' }, note: { type: 'string' } },
          required: ['ok'],
        },
      },
    },
    messages: [
      { role: 'user', content: 'Reply with ok=true and a 5-word note saying you are Tickler\'s extraction model.' },
    ],
  }),
});
if (!res.ok) {
  console.error('Groq HTTP error:', res.status, await res.text());
  process.exit(1);
}
const data = await res.json();
console.log(`Groq OK — model=${data.model} said:`, data.choices[0].message.content);
