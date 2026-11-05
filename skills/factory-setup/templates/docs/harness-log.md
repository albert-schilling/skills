# Harness log

Entries for each pull request, added in that pull request: what the coding agent got wrong or needed to be told, and what changed in the harness so it won't happen again.

## Entries

| PR  | What went wrong | Harness change |
| --- | --------------- | -------------- |

## Factory runs

One row for each pull request the Factory opens, added in its retro and updated when something happens later. These numbers decide when a person can stop reading the code of High Risk Tier pull requests.

- **Risk tier**: low, medium or high, as the Alignment Document ended up.
- **Stops / questions**: how often a phase stopped, and how many questions the person answered.
- **Review rounds**: rounds of the spec and standards reviewers before they had no findings left.
- **Review minutes**: the person's active minutes on the Alignment Document and, for High, the code; an estimate.
- **Reverts / incidents**: anything reverted or broken after the merge, each with a root-cause entry in the table above that ends in a harness change.

| PR  | Issue | Risk tier | Stops / questions | Review rounds | Review minutes | Reverts / incidents |
| --- | ----- | --------- | ----------------- | ------------- | -------------- | ------------------- |
