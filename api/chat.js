import { OpenAI } from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const assistantId = process.env.ASSISTANT_ID;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { threadId, message } = req.body;

  try {
    const thread = threadId
      ? await openai.beta.threads.retrieve(threadId)
      : await openai.beta.threads.create();

    await openai.beta.threads.messages.create(thread.id, {
      role: 'user',
      content: message,
    });

    const run = await openai.beta.threads.runs.create(thread.id, {
      assistant_id: assistantId,
    });

    let runStatus;
    const MAX_ATTEMPTS = 30;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      runStatus = await openai.beta.threads.runs.retrieve(thread.id, run.id);

      if (runStatus.status === 'completed') break;
      if (runStatus.status === 'failed' || runStatus.status === 'cancelled') {
        throw new Error(`runStatus: ${runStatus.status}`);
      }

      await new Promise((r) => setTimeout(r, 1000));
    }

    if (runStatus.status !== 'completed') {
      return res
        .status(504)
        .json({ error: 'Assistant run timed out', status: runStatus.status });
    }

    const messages = await openai.beta.threads.messages.list(thread.id);
    const replyMessage = messages.data.find((m) => m.role === 'assistant');
    const assistantText = replyMessage?.content[0]?.text?.value || 'No reply.';

    res.json({
      threadId: thread.id,
      reply: assistantText,
    });
  } catch (err) {
    console.error('❌ Error:', err);
    res.status(500).json({ error: 'Assistant Error', details: err.message });
  }
}
