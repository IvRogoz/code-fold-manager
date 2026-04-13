const vscode = require('vscode');

const BLOCK_TYPES = [
  { key: 'function', label: 'Functions' },
  { key: 'class', label: 'Classes' },
  { key: 'if', label: 'If Blocks' },
  { key: 'for', label: 'For Loops' },
  { key: 'while', label: 'While Loops' },
  { key: 'switch', label: 'Switch Blocks' },
  { key: 'try', label: 'Try Blocks' },
  { key: 'catch', label: 'Catch Blocks' }
];

const BRACE_PATTERNS = {
  function: [
    /\bfunction\b[^\n{]*\{/g,
    /\b(?:const|let|var)\s+[A-Za-z_$][\w$]*\s*=\s*(?:async\s*)?(?:function\b[^\n{]*|\([^\n)]*\)\s*=>|[A-Za-z_$][\w$]*\s*=>)\s*\{/g,
    /\b[A-Za-z_$][\w$]*\s*\([^\n)]*\)\s*\{/g
  ],
  class: [/\bclass\b[^\n{]*\{/g],
  if: [/\bif\s*\([^\n)]*\)\s*\{/g, /\belse\s+if\s*\([^\n)]*\)\s*\{/g, /\belse\s*\{/g],
  for: [/\bfor\s*\([^\n)]*\)\s*\{/g],
  while: [/\bwhile\s*\([^\n)]*\)\s*\{/g, /\bdo\s*\{/g],
  switch: [/\bswitch\s*\([^\n)]*\)\s*\{/g],
  try: [/\btry\s*\{/g],
  catch: [/\bcatch\s*\([^\n)]*\)\s*\{/g, /\bfinally\s*\{/g]
};

const PYTHON_PATTERNS = {
  function: /^\s*(?:async\s+)?def\s+[A-Za-z_]\w*\s*\(/,
  class: /^\s*class\s+[A-Za-z_]\w*\s*(?:\(|:)/,
  if: /^\s*(?:if|elif|else)\b.*:\s*(?:#.*)?$/,
  for: /^\s*for\b.*:\s*(?:#.*)?$/,
  while: /^\s*while\b.*:\s*(?:#.*)?$/,
  switch: /^\b$^/,
  try: /^\s*try\b.*:\s*(?:#.*)?$/,
  catch: /^\s*(?:except|finally)\b.*:\s*(?:#.*)?$/
};

const foldedTopLevelFunctions = new Map();

function activate(context) {
  context.subscriptions.push(
    vscode.commands.registerCommand('codeFoldManager.toggleTopLevelFunctions', async () => {
      await toggleTopLevelFunctions();
    }),
    vscode.workspace.onDidChangeTextDocument((event) => {
      foldedTopLevelFunctions.delete(event.document.uri.toString());
    }),
    vscode.workspace.onDidCloseTextDocument((document) => {
      foldedTopLevelFunctions.delete(document.uri.toString());
    })
  );
}

function deactivate() {}

async function toggleTopLevelFunctions() {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    void vscode.window.showInformationMessage('Open a file to manage top-level function folding.');
    return;
  }

  const ranges = getTopLevelFunctionRanges(editor.document);
  if (ranges.length === 0) {
    void vscode.window.showInformationMessage('No top-level functions found in this file.');
    return;
  }

  const key = editor.document.uri.toString();
  const shouldFold = foldedTopLevelFunctions.get(key) !== true;
  const selectionLines = [...new Set(ranges.map((range) => range.startLine).sort((a, b) => a - b))];

  if (shouldFold) {
    await vscode.commands.executeCommand('editor.fold', {
      selectionLines
    });
  } else {
    await vscode.commands.executeCommand('editor.unfoldAll');
  }

  foldedTopLevelFunctions.set(key, shouldFold);
}

function getTopLevelFunctionRanges(document) {
  if (document.languageId === 'python') {
    return getPythonTopLevelFunctionRanges(document);
  }

  return getBraceTopLevelFunctionRanges(document);
}

function getBraceTopLevelFunctionRanges(document) {
  const text = document.getText();
  const entries = [];

  for (const pattern of BRACE_PATTERNS.function) {
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const braceOffset = match.index + match[0].lastIndexOf('{');
      if (getBraceDepthAt(text, braceOffset) !== 0) {
        continue;
      }

      const closeOffset = findMatchingBrace(text, braceOffset);
      if (closeOffset === -1) {
        continue;
      }

      const startLine = document.positionAt(match.index).line;
      const endLine = document.positionAt(closeOffset).line;
      if (endLine > startLine) {
        entries.push({ startLine, endLine });
      }
    }
  }

  return dedupeRanges(entries);
}

function getPythonTopLevelFunctionRanges(document) {
  const lines = document.getText().split(/\r?\n/);
  const entries = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!PYTHON_PATTERNS.function.test(line) || getIndent(line) !== 0) {
      continue;
    }

    let endLine = index;
    for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
      const candidate = lines[cursor];
      if (candidate.trim() === '') {
        continue;
      }

      if (getIndent(candidate) <= 0) {
        break;
      }

      endLine = cursor;
    }

    if (endLine > index) {
      entries.push({ startLine: index, endLine });
    }
  }

  return dedupeRanges(entries);
}

function getIndent(line) {
  const match = line.match(/^\s*/);
  return match ? match[0].length : 0;
}

function dedupeRanges(ranges) {
  const seen = new Set();
  return ranges.filter((range) => {
    const key = `${range.startLine}:${range.endLine}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function getBraceDepthAt(text, targetIndex) {
  let depth = 0;
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let inTemplate = false;
  let inLineComment = false;
  let inBlockComment = false;

  for (let index = 0; index < targetIndex; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    const previous = text[index - 1];

    if (inLineComment) {
      if (char === '\n') {
        inLineComment = false;
      }
      continue;
    }

    if (inBlockComment) {
      if (previous === '*' && char === '/') {
        inBlockComment = false;
      }
      continue;
    }

    if (!inSingleQuote && !inDoubleQuote && !inTemplate) {
      if (char === '/' && next === '/') {
        inLineComment = true;
        index += 1;
        continue;
      }

      if (char === '/' && next === '*') {
        inBlockComment = true;
        index += 1;
        continue;
      }
    }

    if (!inDoubleQuote && !inTemplate && char === '\'' && previous !== '\\') {
      inSingleQuote = !inSingleQuote;
      continue;
    }

    if (!inSingleQuote && !inTemplate && char === '"' && previous !== '\\') {
      inDoubleQuote = !inDoubleQuote;
      continue;
    }

    if (!inSingleQuote && !inDoubleQuote && char === '`' && previous !== '\\') {
      inTemplate = !inTemplate;
      continue;
    }

    if (inSingleQuote || inDoubleQuote || inTemplate) {
      continue;
    }

    if (char === '{') {
      depth += 1;
    } else if (char === '}') {
      depth = Math.max(0, depth - 1);
    }
  }

  return depth;
}

function findMatchingBrace(text, openIndex) {
  let depth = 0;
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let inTemplate = false;
  let inLineComment = false;
  let inBlockComment = false;

  for (let index = openIndex; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    const previous = text[index - 1];

    if (inLineComment) {
      if (char === '\n') {
        inLineComment = false;
      }
      continue;
    }

    if (inBlockComment) {
      if (previous === '*' && char === '/') {
        inBlockComment = false;
      }
      continue;
    }

    if (!inSingleQuote && !inDoubleQuote && !inTemplate) {
      if (char === '/' && next === '/') {
        inLineComment = true;
        index += 1;
        continue;
      }
      if (char === '/' && next === '*') {
        inBlockComment = true;
        index += 1;
        continue;
      }
    }

    if (!inDoubleQuote && !inTemplate && char === '\'' && previous !== '\\') {
      inSingleQuote = !inSingleQuote;
      continue;
    }
    if (!inSingleQuote && !inTemplate && char === '"' && previous !== '\\') {
      inDoubleQuote = !inDoubleQuote;
      continue;
    }
    if (!inSingleQuote && !inDoubleQuote && char === '`' && previous !== '\\') {
      inTemplate = !inTemplate;
      continue;
    }

    if (inSingleQuote || inDoubleQuote || inTemplate) {
      continue;
    }

    if (char === '{') {
      depth += 1;
    } else if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        return index;
      }
    }
  }

  return -1;
}


module.exports = {
  activate,
  deactivate
};
