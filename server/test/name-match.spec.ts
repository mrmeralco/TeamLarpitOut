import { describe, expect, it } from "vitest";
import { compareNames, maskName, nameWords } from "../src/domain/name-match.js";

describe("name match (Bill name vs sign-up name)", () => {
  it("ignores order, case, commas, accents, titles, suffixes and middle initials", () => {
    expect(nameWords("DELA CRUZ, JUAN P. JR.")).toEqual(["DELA", "CRUZ", "JUAN"]);
    expect(compareNames("Juan Dela Cruz", "DELA CRUZ, JUAN P.").status).toBe("match");
    expect(compareNames("José Rizal", "MR. RIZAL, JOSE").status).toBe("match");
    expect(compareNames("Maria Clara Santos", "SANTOS, MARIA C.").status).toBe("match");
  });

  it("forgives one misread letter in a long word, not in a short one", () => {
    expect(compareNames("Juanito Bautista", "BAUTISTA, JUANITQ").status).toBe("match");
    expect(compareNames("Ana Lim", "ANA LIN").status).toBe("mismatch");
  });

  it("a shared surname alone is not enough", () => {
    expect(compareNames("Juan Dela Cruz", "DELA CRUZ, PEDRO").status).toBe("mismatch");
    expect(compareNames("Juan Santos", "SANTOS, MARIA").status).toBe("mismatch");
  });

  it("a missing name on either side is unread", () => {
    expect(compareNames("Juan Dela Cruz", null).status).toBe("unread");
    expect(compareNames("Juan Dela Cruz", "  ").status).toBe("unread");
  });

  it("masks the Bill name to initials", () => {
    expect(maskName("SANTOS, MARIA L.")).toBe("S*** M***");
  });
});
