import fs from 'fs';

const regexExtends = /<!-- extends\s+([^\s]+)\s*-->/;

export const renderTemplate = (fileName, context) => {
  const content = fs.readFileSync(fileName, 'utf-8');

  const match = content.match(regexExtends);
  let base = '';
  if (match && match[1]) {
    base = fs.readFileSync(match[1], 'utf-8');
  }

  let result = content.replace(regexExtends, '');
  const blocks = extractBlocksTemplate(result);
  if (base) {
      result = replaceBlocks(base, blocks);
  }
  if (context) {
    result = replaceContext(result, context);
  }
  return result;
}

const extractBlocksTemplate = (content) => {
  const blockRegex = /<!-- block (\w+) start -->([\s\S]*?)<!-- block \1 end -->/g;
  const blocks = {};
  let match;

  while ((match = blockRegex.exec(content)) !== null) {
    const blockName = match[1]; // Der Blockname (z. B. "head", "content")
    const blockContent = match[2].trim(); // Der Inhalt des Blocks
    blocks[blockName] = blockContent;
  }

  return blocks;
}

const replaceBlocks = (content, blocks) => {
  return content.replace(/<!-- block (\w+) -->/g, (match, blockName) => {
    return blocks[blockName] || match;
  });
}

const replaceContext = (content, context) => {
  return content.replace(/<!-- contextVariable (\w+) -->/g, (match, varName) => {
    return context[varName] || match;
  });
}
