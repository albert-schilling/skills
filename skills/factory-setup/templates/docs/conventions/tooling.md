# Tooling

## Commands

- `./scripts/validate.sh`: everything CI runs. Add each check here as the project gets it, so CI, people and the Stop hook run the same thing.

## The Stop hook

At the end of every agent turn, the Stop hook runs `validate` from `.agents/factory.json`. It prints nothing when it passes; when it fails, the agent gets the output and the turn goes on until it passes.

## The Factory

`/factory <issue>` runs one issue through the Factory, installed by `factory-setup`. Its settings are in `.agents/factory.json`; `factory.schema.json`, next to the Factory's skill, explains each key. Don't edit the Factory's installed files: an update replaces them. Propose changes to it as an issue in the repository it was installed from.

## Gotchas

<!-- Tool behaviour that surprised an agent or a person, one line each, with what to do instead. -->
