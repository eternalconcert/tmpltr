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
    if (context[iterable]) {
      return context[iterable].map((i, idx) => {
        const regex = new RegExp(`{{ ${item} }}`, "g");
        const innerMatchesRe = /{{\s*([\w.\-]+)\s*}}/g
        const replaced = inner.replace(innerMatchesRe, (match, varName) => {
          const splittedVarname = varName.split('.');

          varName = splittedVarname[0];
          const varProps = splittedVarname.slice(1, splittedVarname.length);
          if (context[iterable][idx][varProps] === undefined) {
            return match;
          }
          if (varProps.length === 0) {
            return context[iterable][idx];
          }
          return context[iterable][idx][varProps];
        })
        return replaced.replace(regex, i);
      }).join('');
    }
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

export const replaceConditionals = (content, context) => {
  // Helper für verschachtelte Keys
  const getNestedValue = (obj, path) => {
    return path.split('.').reduce((acc, key) => {
      if (Array.isArray(acc?.[key]) && acc[key].length === 0) return false;
      if (Array.isArray(acc?.[key]) && acc[key].length > 0) return true;
      return acc && acc[key] !== undefined ? acc[key] : false;
    }, obj);
  };

  // Rekursive Funktion zum Parsen von verschachtelten Ifs
  const parseIfBlocks = (input) => {
    let output = '';
    let pos = 0;
    while (pos < input.length) {
      const ifStart = input.indexOf('{% if', pos);
      if (ifStart === -1) {
        output += input.slice(pos);
        break;
      }
      output += input.slice(pos, ifStart);
      const condStart = ifStart + 5;
      const condEnd = input.indexOf('%}', condStart);
      const condition = input.slice(condStart, condEnd).trim();

      // Finde das zugehörige endif (verschachtelt!)
      let innerStart = condEnd + 2;
      let depth = 1;
      let searchPos = innerStart;
      while (depth > 0) {
        const nextIf = input.indexOf('{% if', searchPos);
        const nextEndif = input.indexOf('{% endif %}', searchPos);
        if (nextEndif === -1) break;
        if (nextIf !== -1 && nextIf < nextEndif) {
          depth++;
          searchPos = nextIf + 5;
        } else {
          depth--;
          searchPos = nextEndif + 11;
        }
      }
      const innerEnd = searchPos - 11;
      const innerContent = input.slice(innerStart, innerEnd);

      // Vergleichsprüfung (a === b)
      let show = false;
      if (condition.includes('===')) {
        const [leftRaw, rightRaw] = condition.split('===').map(s => s.trim());
        const resolve = (atom) => {
          if (/^'.*'$/.test(atom)) return atom.slice(1, -1);
          return getNestedValue(context, atom);
        };
        const left = resolve(leftRaw);
        const right = resolve(rightRaw);
        show = left !== undefined && right !== undefined && left === right;
      } else {
        const value = getNestedValue(context, condition);
        show = !!value;
      }

      if (show) {
        output += parseIfBlocks(innerContent);
      }
      pos = searchPos;
    }
    return output;
  };

  return parseIfBlocks(content);
};

export const replaceModifications = (content, modifications) => {
  const modificationsRegex = /{% modify (\w+) %}([\s\S]*?){% endmodify %}/g;
  return content.replace(modificationsRegex, (_match, callback, innerText) => modifications[callback](innerText));
};
