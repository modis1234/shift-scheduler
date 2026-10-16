/** 본문을 최대 limit 바이트까지만 읽는다. 넘으면 null (Content-Length 없는 chunked 요청도 막기 위해 스트림으로 센다). */
export async function readBody(req: Request, limit: number): Promise<string | null> {
  if (Number(req.headers.get("content-length") ?? 0) > limit) return null;
  if (!req.body) return "";
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf-8");
}
