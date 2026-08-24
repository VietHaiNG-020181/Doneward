import { ASSESSMENT_CATEGORIES, MAX_OUTLINE_BYTES, normalizeGptExtraction } from "@/lib/outline-import";

const EXTRACTION_SCHEMA = {
  type: "object",
  properties: {
    courseName: { type: "string" },
    tasks: {
      type: "array",
      items: {
        type: "object",
        properties: {
          taskName: { type: "string" },
          category: { type: "string", enum: ASSESSMENT_CATEGORIES },
          deadline: { type: ["string", "null"] },
        },
        required: ["taskName", "category", "deadline"],
        additionalProperties: false,
      },
    },
  },
  required: ["courseName", "tasks"],
  additionalProperties: false,
} as const;

function jsonError(message: string, status: number) {
  return Response.json({ error: message }, { status });
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
}

function responseText(payload: unknown) {
  if (!payload || typeof payload !== "object") return "";
  const response = payload as { output_text?: unknown; output?: unknown };
  if (typeof response.output_text === "string") return response.output_text;
  if (!Array.isArray(response.output)) return "";
  for (const item of response.output) {
    if (!item || typeof item !== "object" || !Array.isArray((item as { content?: unknown }).content)) continue;
    for (const content of (item as { content: unknown[] }).content) {
      if (content && typeof content === "object" && (content as { type?: unknown }).type === "output_text" && typeof (content as { text?: unknown }).text === "string") {
        return (content as { text: string }).text;
      }
    }
  }
  return "";
}

export async function POST(request: Request) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return jsonError("GPT extraction is not configured yet. Add the secure OpenAI API key, then try again.", 503);

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return jsonError("The upload could not be read.", 400);
  }
  const file = form.get("file");
  if (!(file instanceof File)) return jsonError("Choose a PDF course outline.", 400);
  if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) return jsonError("Only PDF course outlines are supported.", 415);
  if (!file.size || file.size > MAX_OUTLINE_BYTES) return jsonError("Choose a PDF smaller than 20 MB.", 413);

  try {
    const fileData = `data:application/pdf;base64,${bytesToBase64(new Uint8Array(await file.arrayBuffer()))}`;
    const openAiResponse = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: process.env.OPENAI_EXTRACTION_MODEL || "gpt-5.4",
        store: false,
        instructions: [
          "Extract every actionable graded task from this course outline.",
          "Return only tasks the student must submit, complete, present, or sit for a grade.",
          "Use the official course name, never the instructor name.",
          "Use the exact task name from the outline. Do not turn policies, grading categories, office hours, schedule headings, or course topics into tasks.",
          "Search the entire PDF, including tables and page images, and re-scan once for missed tasks before answering.",
          "For deadlines use YYYY-MM-DD or YYYY-MM-DDTHH:mm. Use null when the outline does not state a complete date; never guess a year, date, or time.",
        ].join(" "),
        input: [{
          role: "user",
          content: [
            { type: "input_text", text: "Extract the course name and complete graded-task list from this PDF." },
            { type: "input_file", filename: file.name, file_data: fileData, detail: "auto" },
          ],
        }],
        text: { format: { type: "json_schema", name: "course_outline_tasks", strict: true, schema: EXTRACTION_SCHEMA } },
      }),
    });

    const payload = await openAiResponse.json() as unknown;
    if (!openAiResponse.ok) {
      const message = payload && typeof payload === "object" && typeof (payload as { error?: { message?: unknown } }).error?.message === "string"
        ? (payload as { error: { message: string } }).error.message
        : "OpenAI could not process this PDF.";
      console.error("OpenAI outline extraction failed", openAiResponse.status, message);
      return jsonError("GPT could not read this outline. Please try again in a moment.", 502);
    }

    const text = responseText(payload);
    const extraction = text ? normalizeGptExtraction(JSON.parse(text)) : null;
    if (!extraction) return jsonError("GPT returned an incomplete task list. Please try the outline again.", 502);
    return Response.json(extraction);
  } catch (error) {
    console.error("Outline extraction error", error);
    return jsonError("GPT could not read this outline. Please try again in a moment.", 502);
  }
}
