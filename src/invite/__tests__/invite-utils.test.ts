import { ApiError, ApiParsedErrorPayload } from "@/api/errors";

import { acceptInvite } from "../api";
import {
  buildInviteUrl,
  parseInviteToken,
  persistInviteFromUrl,
  processInviteAccept,
} from "../invite-utils";
import { clearPendingInviteToken, setPendingInviteToken } from "../storage";

jest.mock("../api", () => ({
  acceptInvite: jest.fn(),
}));

jest.mock("../storage", () => ({
  clearPendingInviteToken: jest.fn(),
  setPendingInviteToken: jest.fn(),
}));

const mockedAcceptInvite = jest.mocked(acceptInvite);
const mockedClearToken = jest.mocked(clearPendingInviteToken);
const mockedSetPendingInviteToken = jest.mocked(setPendingInviteToken);

const TOKEN = "550e8400-e29b-41d4-a716-446655440000";

function apiError(status: number, message = "Error", body: unknown = null) {
  return new ApiError(message, {
    status,
    url: "/api/v1/invites/accept/test-token",
    body: body as ApiParsedErrorPayload,
  });
}

describe("parseInviteToken", () => {
  it("returns the raw token when given a UUID", () => {
    expect(parseInviteToken(TOKEN)).toBe(TOKEN);
  });

  it("extracts token from a custom-scheme URL", () => {
    expect(parseInviteToken(`sportykore://join/${TOKEN}`)).toBe(TOKEN);
  });

  it("extracts token from a URL with query params", () => {
    expect(
      parseInviteToken(
        `sportykore://join/${TOKEN}?leagueName=Sunday%20League&teamName=FC`,
      ),
    ).toBe(TOKEN);
  });

  it("extracts token from a path-only link", () => {
    expect(parseInviteToken(`/join/${TOKEN}`)).toBe(TOKEN);
  });

  it("extracts token from a join-league share URL", () => {
    expect(
      parseInviteToken(`sportykore://join-league?token=${TOKEN}&leagueName=Sunday%20League`),
    ).toBe(TOKEN);
  });

  it("returns null for empty input", () => {
    expect(parseInviteToken("")).toBeNull();
    expect(parseInviteToken("   ")).toBeNull();
  });

  it("returns null when join path has no token segment", () => {
    expect(parseInviteToken("sportykore://join/")).toBeNull();
    expect(parseInviteToken("/join/")).toBeNull();
  });
});

describe("buildInviteUrl", () => {
  it("builds a browser registration URL from a backend path", () => {
    const url = new URL(buildInviteUrl(`/join/${TOKEN}`));
    expect(["http:", "https:"]).toContain(url.protocol);
    expect(url.pathname).toBe(`/join/${TOKEN}`);
  });
  it("uses server context instead of embedding untrusted display names", () => {
    const url = new URL(buildInviteUrl(`/join/${TOKEN}`, { leagueName: "League", teamName: "Team" }));
    expect(url.search).toBe("");
  });
  it("throws when the invite path has no token", () => {
    expect(() => buildInviteUrl("/join/")).toThrow("Invite link is missing a token.");
  });
});

describe("persistInviteFromUrl", () => {
  beforeEach(() => {
    mockedSetPendingInviteToken.mockResolvedValue();
  });

  it("persists token and context from a join-league URL", async () => {
    await expect(
      persistInviteFromUrl(
        `sportykore://join-league?token=${TOKEN}&leagueName=Sunday%20League&teamName=Mainland%20FC`,
      ),
    ).resolves.toBe(true);

    expect(mockedSetPendingInviteToken).toHaveBeenCalledWith(TOKEN, {
      leagueName: "Sunday League",
      teamName: "Mainland FC",
    });
  });

  it("returns false without persisting unrelated URLs", async () => {
    await expect(persistInviteFromUrl("sportykore://home")).resolves.toBe(false);
    expect(mockedSetPendingInviteToken).not.toHaveBeenCalled();
  });

  it("returns false for legacy join URLs", async () => {
    await expect(persistInviteFromUrl(`sportykore://join/${TOKEN}`)).resolves.toBe(false);
    expect(mockedSetPendingInviteToken).not.toHaveBeenCalled();
  });
});

describe("processInviteAccept", () => {
  beforeEach(() => {
    mockedClearToken.mockResolvedValue();
  });

  it("returns requires_profile when the API says a player profile is needed", async () => {
    mockedAcceptInvite.mockResolvedValue({
      requiresProfile: true,
      token: "test-token",
    });

    await expect(processInviteAccept("test-token")).resolves.toEqual({
      kind: "requires_profile",
    });
    expect(mockedClearToken).not.toHaveBeenCalled();
  });

  it("returns joined and clears the pending token when accept succeeds", async () => {
    mockedAcceptInvite.mockResolvedValue({
      requiresProfile: false,
      leagueId: 42,
    });

    await expect(processInviteAccept("test-token")).resolves.toEqual({
      kind: "joined",
      leagueId: 42,
    });
    expect(mockedClearToken).toHaveBeenCalledTimes(1);
  });

  it("returns error and clears token when accept succeeds without a league id", async () => {
    mockedAcceptInvite.mockResolvedValue({
      requiresProfile: false,
      leagueId: null,
    });

    await expect(processInviteAccept("test-token")).resolves.toEqual({
      kind: "error",
      message: "Invite accepted but no league was returned.",
    });
    expect(mockedClearToken).toHaveBeenCalledTimes(1);
  });

  it("returns auth_required on 401 without clearing the token", async () => {
    mockedAcceptInvite.mockRejectedValue(apiError(401, "Unauthorized"));

    await expect(processInviteAccept("test-token")).resolves.toEqual({
      kind: "auth_required",
    });
    expect(mockedClearToken).not.toHaveBeenCalled();
  });

  it("returns wrong_account on 403", async () => {
    mockedAcceptInvite.mockRejectedValue(apiError(403, "Forbidden"));

    await expect(processInviteAccept("test-token")).resolves.toEqual({
      kind: "wrong_account",
      message: "This invite is for another account.",
    });
    expect(mockedClearToken).not.toHaveBeenCalled();
  });

  it("returns invalid and clears token on 404", async () => {
    mockedAcceptInvite.mockRejectedValue(apiError(404, "Not found"));

    await expect(processInviteAccept("test-token")).resolves.toEqual({
      kind: "invalid",
      message: "This invite has expired or is no longer valid.",
    });
    expect(mockedClearToken).toHaveBeenCalledTimes(1);
  });

  it("returns already_joined and clears token on 409", async () => {
    mockedAcceptInvite.mockRejectedValue(
      apiError(409, "Conflict", { message: "You are already on this team." }),
    );

    await expect(processInviteAccept("test-token")).resolves.toEqual({
      kind: "already_joined",
      message: "You are already on this team.",
    });
    expect(mockedClearToken).toHaveBeenCalledTimes(1);
  });

  it("returns generic error for unexpected failures", async () => {
    mockedAcceptInvite.mockRejectedValue(new Error("Network down"));

    await expect(processInviteAccept("test-token")).resolves.toEqual({
      kind: "error",
      message: "Network down",
    });
    expect(mockedClearToken).not.toHaveBeenCalled();
  });
});
