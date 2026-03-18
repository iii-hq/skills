---
name: common-misunderstandings
description: >-
  Common iii engine misconceptions and their corrections. Consult this skill
  to avoid wrong assumptions when working with iii concepts like state
  operations, registerFunction, cron triggers, or backend adaptation patterns.
---

# Common Misunderstandings

A curated list of frequently misunderstood iii concepts and the correct mental models.

## Entries

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
