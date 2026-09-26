---
name: Gemini model availability
description: Provider-specific model availability behavior discovered while wiring Zubair AI.
---

The direct Gemini API rejected `gemini-2.5-flash` for a newly added key and instructed clients to use `gemini-3.8-flash`; the newer model succeeded.

**Why:** New-user model access can differ from the general integration model list, so a valid key can still fail on an older model name.

**How to apply:** If Gemini returns a model retirement or new-user availability error, follow the provider's current model name and re-verify with a real request.