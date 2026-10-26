# Player registration and roster management

Players can exist without login accounts. Manual and pasted rosters require only names; browser registration requires a name and country, with an optional photo. Claiming an existing player profile is a separate, authenticated operation.

## Organizer and team-admin flows

The Players tab provides name entry with a preview (one name per line), an unassigned pool, and registration links. League owners can add to any team or the pool. Active team admins can add to their own team and assign active, unassigned players to that team. Assignment is transactional: competing admins cannot take the same membership.

Matching names trigger a confirmation before creating distinct player records. Names are deliberately not unique. The warning checks the accessible roster; the server additionally checks the current season roster for admin entry and the league's player records for public registration. Existing players in the unassigned pool should be assigned rather than recreated.

Admin-created players are active immediately. Public submissions are accepted automatically by default for existing and new leagues. The approval toggle is hidden for now; existing pending entries still need review. Owners review registrations in the Players tab. Pending, rejected, and unassigned players cannot be selected for a team lineup.

## Browser registration

Shared links point to the backend's public Inertia page at `/join/:token`; they do not require an installed app or account. The server determines the league, season, and team from the invite, not from submitted form fields. League-only links place players in the unassigned pool. Account-specific legacy invites still require the invited account and are not anonymous-registration links.

The form uses CSRF protection, per-IP throttling, image validation, and a submission ID for retry safety. Duplicate-name confirmation does not expose another player's identity or contact information. The confirmation page shows approval/assignment status. Anonymous editing is not supported.

## Account claims

On eligible unclaimed roster entries, an owner or the player's team admin can share a single-use claim link after verifying the recipient. Links expire after 48 hours; issuing another replaces earlier unused links. The recipient verifies their email using the existing OTP login/signup flow and explicitly claims the profile. The temporary browser access token stays in memory and is revoked after successful linking.

Claiming updates the original player's account association and preserves membership and match references. Accounts already associated with another player are rejected; no automatic profile merging occurs. Issuer permissions are checked again at redemption. Tokens are hashed in storage, and claims record a versioned verification method so additional verification methods can be added later.

## API contracts

All `/api/v1/roster` routes require a bearer token and enforce league/team scope.

- `GET /api/v1/roster/:leagueId/:seasonId` returns `{ data: rosterRows }`. Optional `teamId` filters a team; `teamId=null` selects the pool. Teams may be null; private management responses include `player.userId` for claim availability.
- `POST /api/v1/roster/:leagueId/:seasonId/players` accepts `{ teamId: number | null, names: string[], requestId: string, confirmDuplicates?: boolean }`. Maximum 200 names. Success returns `{ data: rosterRows }`; an unconfirmed match returns HTTP 409 with `{ code: 'DUPLICATE_NAMES', matches }`. Retain the request ID when retrying the same preview.
- `POST /api/v1/roster/:leagueId/:seasonId/assign` accepts `{ teamId, rosterIds }` and assigns active pool memberships atomically.
- `PATCH /api/v1/roster/:leagueId/:seasonId/:id` accepts `{ status: 'active' | 'rejected' }` for reviewing pending registrations.
- `GET/PATCH /api/v1/roster/:leagueId/settings` reads/writes `{ requiresApproval: boolean }`, owner only.
- `GET /api/v1/invites/generate` accepts league/season plus optional team. Owners can generate league-only links; team admins must specify an authorized team.
- `POST /api/v1/player-claims` accepts `{ playerId, leagueId, seasonId }` and returns `{ claimLink }`.
- `POST /api/v1/player-claims/:token/redeem` requires authentication and returns `{ data: { playerId } }`.

## Release order

1. Deploy the backend with the roster, public-registration, and claim migrations, including the Inertia assets.
2. Run pending migrations through the normal deployment process. They make `players.user_id` and `country_id` nullable, add registration approval settings, widen roster statuses, and add retry/claim records. `league_players.team_id` is already nullable.
3. Ensure backend `APP_URL` is the externally reachable HTTPS origin used for claim links, and existing mail delivery is configured for OTP verification.
4. Release the mobile app. Public registration links use `EXPO_PUBLIC_API_URL` (or the existing backend default), which must be reachable by recipients.

No production migrations or deployment are performed by these source changes. Rollback of the roster foundation deliberately retains nullable fields and expanded statuses to avoid invalidating players already created without accounts.

## Completion and web fallback

Successful claims and accepted registration submissions (active or pending) attempt to close the browser tab after five seconds. Browsers may block closing tabs opened by the user or another app; the confirmation remains visible with a safe-to-close message and website link. Claim confirmations retain the app download link. Failed, rejected, and unavailable flows do not auto-close.

Undefined HTML GET/HEAD pages, including `/` and `/test`, redirect to `https://sportykore.com`. API requests, missing assets, JSON requests, and errors from existing routes retain their normal error behavior.

Release verification: backend/Inertia and mobile type checks, production backend build including static branding assets, 27 focused backend tests, and 33 mobile tests pass. Production PostgreSQL migration execution, live email delivery, and a native-device smoke test against the deployed backend remain release checks. Automated browser claim checks mock OTP/account endpoints; they do not prove email delivery.
