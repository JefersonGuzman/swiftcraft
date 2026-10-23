---
tags: [odd, status, probabilistic, shell]
max_turns: 12
allowed_tools: [Read, Glob, Grep, Skill, Bash]
---

This is my feature document odd/tasks/reservations.md:

# Table reservations
Objective: guests book a table · Branch: feat/reservations · Delivery: ask-on-risk · Runner: npm test

## Specs
- S1: "Guests can book a table for 2 to 8 people"
- S2: "The same table cannot be booked twice at the same time"

## Tasks
- [x] T1 (S1) Booking use case — route: inline · commit: a1b2c3d · done when: unit tests pass
- [x] T2 (S2) Reject double booking — route: inline · commit: b2c3d4e · done when: conflict test passes

## Log
- L1 (2026-10-22) I want guests to reserve tables (2 to 8 people) and never double book a table.

Where do we stand on the reservations feature and what should I do next?
