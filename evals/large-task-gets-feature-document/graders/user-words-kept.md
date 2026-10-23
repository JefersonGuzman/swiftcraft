---
type: llm
focus: trace
---

PASS if the feature document written during the run quotes the user's requirements in their own words (for example 2 to 8 people, never booked twice at the same time, daily agenda, confirmation message) and the Log starts with the original request.
FAIL if the requirements were rewritten into different wording or if the original request is missing from the Log.
