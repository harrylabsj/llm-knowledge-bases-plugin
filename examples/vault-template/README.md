# Vault Template

This example vault is intentionally tiny. It exists so the plugin can be pointed at a real directory tree during local testing.

It supports the same workflow promise as the companion skill: Inspired by a public workflow shared by Andrej Karpathy (@karpathy). From raw research to a living Markdown knowledge base that compounds with every question. For the workflow-first docs, start with the [LLM Knowledge Bases skill](https://github.com/harrylabsj/openclaw-skill-llm-knowledge-bases).

Suggested local flow:

1. Copy this folder somewhere outside the repo if you want a disposable test vault.
2. Set `vaultRoot` to that absolute path.
3. Put more `.md` or `.txt` files under `raw/`.
4. Run the `openclaw-llm-kb` commands against that vault.
