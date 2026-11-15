// Browser-only: reads text out of a (possibly password-protected) CAS PDF without uploading the file.

export class PdfPasswordError extends Error {
  constructor(public incorrect: boolean) {
    super(incorrect ? "Incorrect password" : "Password required");
  }
}

interface TextItemLike {
  str: string;
  transform: number[];
}

export async function extractPdfText(file: File, password?: string): Promise<{ text: string; pages: number }> {
  const pdfjs = await import("pdfjs-dist");
  const worker = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;

  const data = new Uint8Array(await file.arrayBuffer());
  const params: Parameters<typeof pdfjs.getDocument>[0] = { data };
  if (password) Object.assign(params as object, { password });
  let doc;
  try {
    doc = await pdfjs.getDocument(params).promise;
  } catch (e) {
    const err = e as { name?: string; code?: number };
    if (err?.name === "PasswordException") throw new PdfPasswordError(err.code === pdfjs.PasswordResponses.INCORRECT_PASSWORD);
    throw new Error("This file couldn't be opened as a PDF.");
  }

  const out: string[] = [];
  const maxPages = Math.min(doc.numPages, 60);
  for (let p = 1; p <= maxPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    const lines = new Map<number, { x: number; s: string }[]>();
    for (const raw of content.items) {
      const item = raw as TextItemLike;
      if (typeof item.str !== "string" || !item.transform) continue;
      const y = Math.round((item.transform[5] ?? 0) / 2);
      const list = lines.get(y) ?? [];
      list.push({ x: item.transform[4] ?? 0, s: item.str });
      lines.set(y, list);
    }
    const sorted = [...lines.entries()].sort((a, b) => b[0] - a[0]);
    for (const [, parts] of sorted) {
      const line = parts
        .sort((a, b) => a.x - b.x)
        .map((x) => x.s)
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
      if (line) out.push(line);
    }
    out.push("");
  }
  void doc.cleanup?.();
  return { text: out.join("\n"), pages: doc.numPages };
}
