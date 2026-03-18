---
name: general-engineering
description: >-
  General software engineering principles for iii projects. Consult when writing
  or reviewing iii code to ensure functions are focused, code is DRY, tests are
  written, and common misunderstandings are avoided.
---

# General Engineering Principles

- Keep functions small and focused — one responsibility each.
- Reuse functionality, keep code DRY, prefer to leverage `registerTrigger()` on existing functions rather than writing
  new functions when possible.
- Write tests alongside implementation.
- Prefer composition over inheritance.
- Use environment variables for configuration; never hardcode secrets.
- Always read the `common-misunderstandings` skill.
