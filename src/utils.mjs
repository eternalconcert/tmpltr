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

export const getContentType = (type) => {
  return types[type] || types['plain'];
}

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

  let contextReplaced = content.replace(/{% for (\w+) in (\w+) %}([\s\S]*?){% endfor %}/g, (_match, item, iterable, inner) => {
    return context[iterable].map(i => {
      const regex = new RegExp(`{{ ${item} }}`, "g");
      const result = inner;
      return result.replace(regex, i);
    }).join('');
  });

  contextReplaced = contextReplaced.replace(/{{\s*([\w.\-]+)\s*}}(?![^]*?{%\s*for\b[^]*?{%\s*endfor\s*%})/g, (match, varName) => {
    const splittedVarname = varName.split('.');
    varName = splittedVarname[0];
    const varProps = splittedVarname.slice(1, splittedVarname.length);
    if (context[varName] === undefined) {
      return match;
    }
    if (varProps.length === 0) {
      return context[varName];
    }
    let nextLevelProp = context[varName];
    varProps.forEach(prop => {
      nextLevelProp = nextLevelProp[prop];
    })
    return nextLevelProp;
  });
  return contextReplaced;
}
