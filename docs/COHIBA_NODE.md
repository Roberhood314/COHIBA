# COHIBA Node / Desktop Agent v0.1

COHIBA Node is an **explicit opt-in resource agent** for Hybrid Human + Resource Mining.

It does not:
- mine with hidden CPU/GPU hashing;
- proxy third-party traffic;
- scan the local network;
- read arbitrary files;
- execute server-supplied shell commands;
- store wallet private keys or recovery phrases.

## Current production job type

### DATA_INTEGRITY_V1
The server issues a short-lived deterministic integrity challenge containing:
- protocol/version;
- nonce;
- bounded canonical data chunks.

The agent computes a SHA-256 digest of the canonical payload and submits it.

The server independently computes the expected digest and accepts the job only if:
- the session is authenticated;
- the profile has an active mining session;
- the job belongs to that profile;
- the job is still within its 5-minute TTL;
- the result is correctly formatted;
- the result matches using timing-safe comparison.

A profile can receive at most one new job per 10-minute cooldown. A pending unexpired job is reused rather than duplicated.

## Running the agent

The agent is intentionally not started automatically.

Set values only in the local environment:

- `COHIBA_BASE_URL=https://cohibameme.site`
- `COHIBA_SESSION_TOKEN=<current authenticated session token>`

One job:

`npm run node:agent`

Explicit continuous mode:

`npm run node:agent -- --loop`

Continuous mode waits for the server cooldown and does not attempt sub-minute work.

Never commit or paste a session token into source code, GitHub issues, screenshots or public logs.

## Resource accounting

A successfully verified Node job becomes a verified Useful Work proof in the profile resource ledger.

Current Resource Score:

`Q = 0.30 Uptime + 0.25 UsefulWork + 0.20 Reliability + 0.15 Storage + 0.10 Network`

v0.1 activates:
- browser authenticated uptime;
- deterministic verified Useful Work.

Storage and Network components remain zero unless future protocols provide real challenge/response evidence.

## Security boundaries

Server-issued jobs are a fixed allowlist. The agent has no general-purpose remote command execution capability.

The job payload is data only. It cannot contain shell commands, URLs to relay, file paths to read, or code to execute.

This is deliberate: useful resource mining must remain bounded, transparent and independently verifiable.
