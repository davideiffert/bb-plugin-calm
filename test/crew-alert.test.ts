import { describe, expect, it } from "vitest";
import { failureKey, helperAlert, type CrewMember } from "../src/crew";

const m = (id: string, kind: CrewMember["kind"]): CrewMember => ({ id, kind, title: `Helper ${id}`, since: 1 });

describe("helper alert", () => {
  it("shows nothing while helpers are only working or rate-limited", () => {
    expect(helperAlert([m("a", "working"), m("b", "rate")])).toBeNull();
    expect(helperAlert([])).toBeNull();
  });

  it("says who is waiting on you and opens that helper", () => {
    const a = helperAlert([m("a", "working"), m("b", "waiting")])!;
    expect(a.text).toBe("1 helper is waiting on you");
    expect(a.target.id).toBe("b");
  });

  it("names a failure, and combines counts with waiting first", () => {
    expect(helperAlert([m("a", "error")])!.text).toBe("1 helper failed");
    const a = helperAlert([m("a", "error"), m("b", "waiting"), m("c", "waiting"), m("d", "error")])!;
    expect(a.text).toBe("2 helpers are waiting on you · 2 failed");
    expect(a.target.id).toBe("b");
  });

  it("drops a failed helper once you have opened it", () => {
    const failed = m("a", "error");
    expect(helperAlert([failed], new Set([failureKey(failed)]))).toBeNull();
  });
});

describe("helper mini scene", async () => {
  const { Vignette, MAX_FIGURES, VIGNETTE_SCALE } = await import("../src/helper-vignette");
  it("shows up to three figures, waiting first, and a tap on one opens that helper", () => {
    const alert = helperAlert([m("a", "error"), m("b", "waiting"), m("c", "waiting"), m("d", "error")])!;
    for (const scene of ["pasture", "sea", "night"]) {
      const v = new Vignette(scene);
      v.set(alert.members);
      expect(v.figures.map((f) => f.member.id)).toEqual(["b", "c", "a"].slice(0, MAX_FIGURES));
      const second = v.figures[1];
      expect(v.hit((second.x + second.w / 2) * VIGNETTE_SCALE)?.id).toBe("c");
      expect(v.motion(true)).toBe("still");
      expect(v.motion(false)).toBe("slow");
    }
  });
});
