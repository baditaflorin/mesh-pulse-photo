# Security audit — mesh-pulse-photo

Generated: **2026-08-26T00:33:24.952Z** · 16 checks · 16 pass · 0 fail

> A programmatic, CPU-only verification of every claim in the four-layer security stack.
> Re-run with `npm run audit:security` from this repo. Source: `mesh-common/tests/securityAudit.test.ts`
> This app does not render the moderator badge yet — only the shared crypto invariants are exercised. The layer-1 guarantees still apply by virtue of bundling `mesh-common`.

## Result

✅ **All checks pass.**

- crypto / Y.Doc invariants: **16 / 16**
- UI-flow checks: **0**  _(this app does not yet expose the moderator UI; pass 2 skipped)_

## Checks

| ID | Claim | Method | Result |
|---|---|---|:---:|
| `L1.IDENTITY.persists` | Identity key persists across reloads via localStorage | loadOrCreateIdentity called twice with same prefix; both keypairs match | ✅ |
| `L1.IDENTITY.uniquePerApp` | Each storagePrefix produces a distinct keypair (no cross-app reuse) | loadOrCreateIdentity with two different prefixes; private keys differ | ✅ |
| `L1.MODERATOR.claimSyncs` | A claims moderator → B's hook reports A as current moderator | linkMockRooms relays Y.Doc updates; A.claim() then read on B | ✅ |
| `L1.MODERATOR.expiredClaimIgnored` | A signed claim with expiresAt in the past is treated as vacant | Plant claim with expiresAt = now - 60s; hook reports current=null | ✅ |
| `L1.MODERATOR.forgedClaimRejected` | A claim with a signature not matching its embedded pubkey is treated as vacant | Plant {pubkey:real, sig:forger}; hook rejects and reports current=null | ✅ |
| `L1.MODERATOR.releaseSyncs` | Relinquish by the current moderator clears the slot for all peers | After A.relinquish() both A and B observe current=null | ✅ |
| `L1.MODERATOR.signedClaim` | The moderator claim's signature verifies against the embedded pubkey | verify({peerId,pubkey,claimedAt,expiresAt,nonce}, sig, pubkey) === true | ✅ |
| `L1.MODERATOR.vacantDefault` | Fresh room reports no moderator and isMe=false | useModerator hook on a fresh mock room returns {current:null, isMe:false} | ✅ |
| `L1.SIGN.rejectGarbage` | Invalid signature / pubkey inputs return false instead of crashing | verify({x:1}, 'not-hex', 'also-bad') and verify({x:1}, '', '') both false | ✅ |
| `L1.SIGN.rejectTampered` | A signed payload with any byte modified fails verification | Sign {msg:'hello'}, then verify({msg:'HELLO'}, …) returns false | ✅ |
| `L1.SIGN.rejectWrongKey` | A's signature does not verify under B's public key | Sign with kpA.priv, verify with kpB.pub returns false | ✅ |
| `L1.SIGN.roundtrip` | A signed payload verifies against the matching pubkey | Ed25519 sign(payload, privkey) then verify(payload, sig, pubkey) | ✅ |
| `L1.TOFU.fingerprint` | trustFingerprint emits a 4x2-hex grouped string for in-person verification | fingerprint(peerId, pubkey) matches /^xx-xx-xx-xx$/ | ✅ |
| `L1.TOFU.peerIdFromPubkey` | peerIdFromPubkey is deterministic and uses 64-bit prefix of pubkey | Two calls with same pubkey return the same 16-hex-char id | ✅ |
| `L1.TOFU.register` | register() writes a self-signed PubkeyRecord into the registry Y.Map | Verify the stored record's signature against its own pubkey | ✅ |
| `L1.TOFU.rejectImposter` | A forged record signed by the wrong key does not block the real peer from publishing | Pre-write mallory-signed alice claim; alice arrives and overwrites with her own | ✅ |

## Evidence

Selected captured evidence (full payloads in `security-audit.json`):

### `L1.IDENTITY.persists`

```json
{
  "pubkeyA": "fbfd3af834edcaad1da26763af25c03773c35e9ae6ca30d5c6ea31852a00de00",
  "pubkeyB": "fbfd3af834edcaad1da26763af25c03773c35e9ae6ca30d5c6ea31852a00de00"
}
```

### `L1.IDENTITY.uniquePerApp`

```json
{
  "pubkeyA": "cc2d3ff5f77b0e03",
  "pubkeyB": "bdc89f6bd31adb26"
}
```

### `L1.MODERATOR.claimSyncs`

```json
{
  "claimer": "alice",
  "ttlMs": 1800000
}
```

### `L1.MODERATOR.expiredClaimIgnored`

```json
{
  "plantedExpiresAt": 1787704344945,
  "now": 1787704404948
}
```

### `L1.MODERATOR.forgedClaimRejected`

```json
{
  "realPubkey": "b509533127db9577",
  "forgerPubkey": "d56830b6d07869f5"
}
```

### `L1.MODERATOR.signedClaim`

```json
{
  "sigLen": 128,
  "nonceLen": 32
}
```

### `L1.SIGN.roundtrip`

```json
{
  "sigLen": 128,
  "pubkeyPrefix": "5b4fce7c1f20f9bd"
}
```

### `L1.TOFU.fingerprint`

```json
{
  "fingerprint": "e1-33-23-59"
}
```

### `L1.TOFU.peerIdFromPubkey`

```json
{
  "peerId": "6838e56caf9e38e4"
}
```

### `L1.TOFU.register`

```json
{
  "peerId": "alice",
  "pubkeyPrefix": "12e7f2cd273736de",
  "sigLen": 128
}
```

### `L1.TOFU.rejectImposter`

```json
{
  "forgedPubkey": "24b11f77eb8a0072",
  "realPubkey": "dfd3ea2af3da2ce8"
}
```

---

## How to re-run

```bash
cd mesh-pulse-photo
npm run audit:security
```

The audit runs in two passes:

1. **Crypto invariants** (Vitest, ~1s) — sign/verify roundtrips, TOFU registry, moderator role state machine, forged-claim rejection, expired-claim rejection. Uses in-memory Yjs mock rooms; no browser.
2. **UI flow** (Playwright, ~5s) — opens two peer browsers, exercises the visible moderator badge: vacant → claim → sync → release.

Both run **headless, CPU-only**. No GPU acceleration is required; no signaling server is contacted. The fleet's `judge.sh` aggregator includes these checks alongside per-app feature tests.
