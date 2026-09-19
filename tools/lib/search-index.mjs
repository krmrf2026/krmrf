const BASE = 36;

const postingWidthForCount = count => {
  const maxId = Math.max(0, Number(count || 0) - 1);
  return Math.max(2, Math.ceil(Math.log(Math.max(1, maxId + 1)) / Math.log(BASE)));
};

const encodeId = (id, width) => Number(id).toString(BASE).padStart(width, '0');

export const encodeSearchTerms = (termMap, documentCount) => {
  const postingWidth = postingWidthForCount(documentCount);
  const terms = [];
  let previous = '';
  for (const [term, postings] of [...termMap.entries()].sort(([a], [b]) => a.localeCompare(b, 'ru'))) {
    let prefix = 0;
    const limit = Math.min(previous.length, term.length);
    while (prefix < limit && previous[prefix] === term[prefix]) prefix += 1;
    terms.push(prefix, term.slice(prefix), postings.map(id => encodeId(id, postingWidth)).join(''));
    previous = term;
  }
  return { postingWidth, terms };
};

export const decodeSearchTerms = payload => {
  if (payload?.version === 2) {
    if (!payload.terms || typeof payload.terms !== 'object' || Array.isArray(payload.terms)) {
      throw new Error('Некорректная таблица терминов search-index v2');
    }
    return Object.entries(payload.terms);
  }
  if (payload?.version !== 3 || !Array.isArray(payload.terms)) {
    throw new Error('Неподдерживаемый формат search-index');
  }
  const width = Number(payload.postingWidth);
  if (!Number.isInteger(width) || width < 1 || width > 6 || payload.terms.length % 3 !== 0) {
    throw new Error('Некорректные параметры search-index v3');
  }
  const entries = [];
  let previous = '';
  for (let index = 0; index < payload.terms.length; index += 3) {
    const prefix = Number(payload.terms[index]);
    const suffix = String(payload.terms[index + 1] ?? '');
    const encoded = String(payload.terms[index + 2] ?? '');
    if (!Number.isInteger(prefix) || prefix < 0 || prefix > previous.length || encoded.length % width !== 0) {
      throw new Error('Повреждённая запись search-index v3');
    }
    const term = previous.slice(0, prefix) + suffix;
    const postings = [];
    for (let offset = 0; offset < encoded.length; offset += width) {
      const id = Number.parseInt(encoded.slice(offset, offset + width), BASE);
      if (!Number.isInteger(id)) throw new Error(`Некорректный posting для термина «${term}»`);
      postings.push(id);
    }
    entries.push([term, postings]);
    previous = term;
  }
  return entries;
};
