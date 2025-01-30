export const types = {
    plain: 'text/plain',
    html: 'text/html',
    css: 'text/css',
    js: 'application/javascript',
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    json: 'application/json',
    xml: 'application/xml',
  };

export const extractBlocksTemplate = (content) => {
  const blockRegex = /{% block (\w+) %}([\s\S]*?){% endblock %}/g;
  const blocks = {};
  let match;
  while ((match = blockRegex.exec(content)) !== null) {
    const blockName = match[1];
    const blockContent = match[2].trim();
    blocks[blockName] = blockContent;
  }
  return blocks;
}

export const replaceBlocks = (content, blocks) => {
  return content.replace(/{% block (\w+) %}/g, (_match, blockName) => {
    return blocks[blockName] || '';
  });
}

export const replaceContext = (content, context) => {
  let contextReplaced = content.replace(/{{ (\w+) }}/g, (match, varName) => {
    if (context[varName] === undefined) {
      return match;
    }
    return context[varName];
  });
  contextReplaced = contextReplaced.replace(/{% for (\w+) in (\w+) %}([\s\S]*?){% endfor %}/, (_match, item, items, inner) => {
    return context[items].map(i => {
      const regex = new RegExp(`{{ ${item} }}`, "g");
      return inner.replace(regex, i)
    }).join('');
  });
  return contextReplaced;
}
