---
name: factory-pull-request
description: The body of a pull request the Factory opens, so a person can judge it without reading the run. Used by the factory skill's pull request phase; not for direct use.
user-invocable: false
---

# The Factory's pull request body

A person decides from this body whether to merge, and for a High Risk Tier change, how carefully to read the code. Write for that decision: lead with what changed, show that it works, say what could go wrong. Keep prose short and use the terms of `config.glossary` (`config` is `.agents/factory.json`, as in the `factory` skill).

Write the sections in this order, each as a `##` heading:

1. **First line**, before any heading: `Closes #<issue>`.
2. **Summary**: what changes, as the smallest picture that makes it clear, then at most three sentences. Pick one:
   - a call tree or pseudocode for changed behaviour;
   - a shallow file tree with a comment per file for a change across files;
   - a `diff` block of the few lines that matter for a config or interface change;
   - a Mermaid diagram when the point is how parts talk to each other.
3. **Evidence**: that it works. The new tests, each with the failure it showed before the implementation; the summary of the last `config.validate` run; for a change people can see, screenshots or output from the running thing. Link the commits.
4. **Risk Tier**: the tier, the paths that set it, and why the planner or the person raised it, if they did. For High, say that a person reads the code before merging.
5. **Merge danger**:
   - **Door**: two-way (reverting the merge undoes it) or one-way (it leaves something a revert doesn't undo: migrated data, sent messages, a published interface, deleted resources). For one-way, say what stays.
   - **Blast radius**: what breaks if it is wrong, and for whom.
6. **Review**: each finding of every review round (spec, standards and, for High, security), with its fix commit or the answer that keeps it; how many rounds ran; issues filed for untouched code.
7. **Stops**: each question a phase asked, the person's answer, and where it was recorded. Write `None.` when the run didn't stop.
8. **Size**: only above `config.maxChangedLines`: the changed lines, and why it wasn't split.

Don't restate the issue, list every file, or describe the Factory's phases; the run log on the issue holds that.
