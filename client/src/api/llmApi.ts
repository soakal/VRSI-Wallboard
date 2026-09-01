export async function askJobQuestion(question: string): Promise<string> {
  const res = await fetch('/api/llm/query', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question }),
  });

  const json = (await res.json()) as { data?: { answer: string }; error?: { code: string; message: string } };

  if (!res.ok || !json.data) {
    throw new Error(json.error?.message ?? 'Failed to reach the local LLM server');
  }

  return json.data.answer;
}
