# Code Fold Manager

Code Fold Manager is a VS Code extension that adds a native editor title action for folding top-level functions in the active file.

## Features

- Adds a `Code Fold Manager: Toggle Top-Level Functions` action to the editor title bar.
- First click folds top-level functions in the active editor.
- Second click unfolds all folded regions in the file.
- Supports common brace-based languages and Python top-level `def` blocks.
- Uses lightweight parsing so it works without language-specific dependencies.

## How It Works

The extension scans the active document for top-level function ranges:

- Brace-based languages use pattern matching plus brace-depth checks.
- Python files use indentation to detect top-level function bodies.

Nested functions are ignored. The command only targets top-level functions.

## Install Locally

1. Open this folder in VS Code.
2. Press `F5` to launch an Extension Development Host.
3. Open a code file.
4. Click the fold icon in the editor title bar.

You can also install the packaged VSIX:

1. Run `npx @vscode/vsce package`.
2. Install the generated `.vsix` with `code --install-extension code-fold-manager-0.0.1.vsix`.

## Command

- `Code Fold Manager: Toggle Top-Level Functions`

## Limitations

- The detector uses lightweight pattern matching, so uncommon syntax styles may not be matched perfectly.
- The toggle state resets when the document changes.
- Unfold uses VS Code's `Unfold All`, so it expands all folded regions, not just those created by the extension.
