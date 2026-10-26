import { ApiError } from "@/api/errors";
import { isDuplicateNamesError } from "../roster-api";
import { hasDuplicateRosterNames, parseRosterNames } from "../utils/roster";

jest.mock("@/api/http-client", () => ({ apiRequest: jest.fn() }));

describe("roster name entry", () => {
  it("preserves repeated names and punctuation while skipping blank lines", () => {
    expect(
      parseRosterNames(" Alex Morgan \r\n\r\nAlex Morgan\nDoe, Jane\n  "),
    ).toEqual(["Alex Morgan", "Alex Morgan", "Doe, Jane"]);
  });
  it("requires confirmation for repeated pasted names independent of the server roster", () => {
    expect(hasDuplicateRosterNames(["Alex Morgan", "alex morgan"], [])).toBe(
      true,
    );
  });
  it("recognizes existing names across case and whitespace", () => {
    expect(hasDuplicateRosterNames(["Sam Taylor"], [" sam taylor "])).toBe(
      true,
    );
    expect(hasDuplicateRosterNames(["Sam Taylor"], ["Sam Taylors"])).toBe(
      false,
    );
  });
});

describe("duplicate conflict handling", () => {
  const failure = (status: number, body: Record<string, unknown>) =>
    new ApiError("Conflict", { status, body, url: "/roster" });
  it("offers distinct-record confirmation only for the explicit duplicate conflict", () => {
    expect(
      isDuplicateNamesError(
        failure(409, { code: "DUPLICATE_NAMES", matches: [] }),
      ),
    ).toBe(true);
    expect(isDuplicateNamesError(failure(409, { code: "TEAM_FULL" }))).toBe(
      false,
    );
    expect(
      isDuplicateNamesError(failure(403, { code: "DUPLICATE_NAMES" })),
    ).toBe(false);
    expect(isDuplicateNamesError(new Error("DUPLICATE_NAMES"))).toBe(false);
  });
});
