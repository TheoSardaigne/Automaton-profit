import fs from "node:fs";
import vm from "node:vm";
import { describe, expect, it } from "vitest";
describe("emitted local pricing-review UI", () => {
  it("renders twelve rows and runs start/stop/export without syntax errors or automatic fetch", () => {
    const html = fs.readFileSync("research/capability-build-v3/benchmark/human-review.html", "utf8");
    const source = /<script>([\s\S]*?)<\/script>/.exec(html)![1]!;
    class Element {
      children: Element[] = []; textContent = ""; value = ""; disabled = false; onclick?: () => void; href = "";
      constructor(public tag = "") {}
      append(...items: Element[]) { this.children.push(...items); if (this.tag === "select" && this.children.length === items.length) this.value = items[0]?.value || ""; }
      click() { this.onclick?.(); }
    }
    const ids = new Map(["rows", "start", "stop", "timer", "simpler"].map((id) => [id, new Element(id)]));
    ids.get("simpler")!.value = "UNKNOWN";
    const created: Element[] = []; let now = 0; let exported = "";
    const document = { getElementById: (id: string) => ids.get(id), createElement: (tag: string) => { const e = new Element(tag); created.push(e); return e; }, createTextNode: (text: string) => Object.assign(new Element(), { textContent: text }) };
    class Blob { constructor(parts: string[]) { exported = parts.join(""); } }
    const context = vm.createContext({ document, performance: { now: () => now }, Date, Blob,
      URL: { createObjectURL: () => "blob:unit-test", revokeObjectURL: () => {} }, setInterval: () => 0 });
    new vm.Script(source).runInContext(context);
    expect(ids.get("rows")!.children).toHaveLength(12);
    const selects = created.filter((e) => e.tag === "select");
    expect(selects).toHaveLength(24); expect(selects.every((e) => e.disabled)).toBe(true);
    ids.get("start")!.click(); expect(selects.every((e) => !e.disabled)).toBe(true);
    expect(ids.get("stop")!.disabled).toBe(false);
    now = 3000; ids.get("stop")!.click();
    const result = JSON.parse(exported);
    expect(result.offers).toBe(24); expect(result.not_reviewed).toBe(24); expect(result.correct).toBe(0);
    expect(result.elapsed_seconds).toBe(3); expect(result.simpler_than_v2).toBe("UNKNOWN");
    expect(result.rows.every((r: { verdict: string }) => r.verdict === "NOT_REVIEWED")).toBe(true);
    expect(ids.get("stop")!.disabled).toBe(true);
    expect(source).not.toMatch(/\bfetch\s*\(/);
  });
});
