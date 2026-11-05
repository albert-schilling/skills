# <Project>

<One or two sentences: what this project is and who it is for.>

## Where decisions live

Read the relevant source before you design anything; decisions are already made there.

- [`GLOSSARY.md`](GLOSSARY.md): the domain terms. Use them in code, tests, commits and pull requests.
- [`docs/adr/`](docs/adr/): architecture decisions.

## Conventions

`./scripts/validate.sh` runs what CI runs. A Stop hook runs it at the end of every agent turn and keeps the turn going while it fails.

- [`docs/conventions/tooling.md`](docs/conventions/tooling.md): commands, and tool behaviour that has surprised us. Read it before you run, configure or debug a tool.
- [`docs/conventions/code.md`](docs/conventions/code.md): project layout, comments and config files. Read it before you write code or config.
- [`docs/conventions/pull-requests.md`](docs/conventions/pull-requests.md): size, tests, workflow files and the harness log. Read it before you commit, push or open a pull request.
- [`docs/conventions/issues-and-records.md`](docs/conventions/issues-and-records.md): the issue template, labels, and how decision records name tools. Read it before you write an issue or a decision record.
