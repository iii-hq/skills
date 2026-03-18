---
name: common-misunderstandings
description: >-
  Tracks recurring iii platform misconceptions that the user has corrected. Use
  when a wrong assumption or misunderstanding repeats across skills, examples,
  or responses, and after the user confirms it should be captured as shared
  guidance.
---

# Common Misunderstandings

Use this skill as a lightweight registry of corrected assumptions.

## How To Use It

- Apply the correction in the current task first.
- If the misunderstanding looks reusable, suggest adding it here.
- Only add or change entries after the user confirms.
- Keep entries short and scoped to the misunderstanding, the correction, and when it applies.
- Prefer concrete iii-specific misunderstandings over style preferences.

## Current Entries

### Traditional Backend Adaptation

- Misunderstanding: the `traditional-backend` pattern is for building a new iii-native backend from scratch.
  Correction: it is primarily for adapting existing traditional backends into iii with minimal changes.

- Misunderstanding: `state::` operations are an inherent part of the pattern.
  Correction: use `state::` operations only when the application actually has shared application state that belongs in iii.

- Misunderstanding: `registerFunction` is mainly for helpers or route handlers.
  Correction: `registerFunction` registers regular iii functions. HTTP endpoints are mapped with triggers, and HTTP adaptation is especially useful when a backend or third-party service cannot be modified with middleware.

- Misunderstanding: cron is iii's version of background jobs.
  Correction: iii has cron triggers for scheduled work. Avoid framing cron as a generic background-job abstraction.

- Misunderstanding: shared state is a simple key value store.
  Correction: shared state is for storing small amounts of data using primitive types such as string. It is subject to the same
  constraints as Redis or similar key value stores.
