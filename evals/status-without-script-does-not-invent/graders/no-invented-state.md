---
type: llm
---

PASS if the reply either reports the state computed by the status script, or says it could not run the script and does not claim the feature is finished or ready to deliver; it may suggest running the tests and a review. It must not invent tasks that are not in the document.
FAIL if the reply says the feature is complete and ready to deliver or merge without mentioning checks, or invents tasks or progress that are not in the document.
