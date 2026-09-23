/** Shared library on the machine: `python3 shared-library/bridge.py` → :8778 */
export const BANK_ORIGIN = "http://127.0.0.1:8778";

export type BankSample = {
  id: string;
  name: string;
  type: string;
  pack: string;
  bpm: number;
};

export type BankHealth = {
  ok: boolean;
  library: string;
};

export async function bankHealth(): Promise<BankHealth> {
  const res = await fetch(`${BANK_ORIGIN}/api/health`, { signal: AbortSignal.timeout(1200) });
  if (!res.ok) throw new Error("bank");
  const data = (await res.json()) as { library?: string };
  return { ok: true, library: data.library || "Bank" };
}

export async function bankSamples(type?: string): Promise<BankSample[]> {
  const q = new URLSearchParams({ limit: "80" });
  if (type) q.set("type", type);
  const res = await fetch(`${BANK_ORIGIN}/api/samples?${q}`, {
    signal: AbortSignal.timeout(4000),
  });
  if (!res.ok) throw new Error("bank");
  const data = (await res.json()) as { samples?: BankSample[] };
  return (data.samples || []).filter((s) => s.id && s.name && !String(s.id).startsWith("faska-"));
}

export async function bankAudio(id: string): Promise<ArrayBuffer> {
  const res = await fetch(`${BANK_ORIGIN}/api/file/${encodeURIComponent(id)}`, {
    signal: AbortSignal.timeout(12000),
  });
  if (!res.ok) throw new Error("file");
  return res.arrayBuffer();
}
