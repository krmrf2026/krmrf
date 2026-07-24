(() => {
  'use strict';

  const normalize = value => String(value || '')
    .toLocaleLowerCase('ru-RU')
    .replace(/ё/g, 'е')
    .replace(/[–—-]/g, ' ')
    .replace(/[^a-zа-я0-9\s]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const distance = (a, b) => {
    if (a === b) return 0;
    if (!a.length) return b.length;
    if (!b.length) return a.length;
    const previous = Array.from({ length: b.length + 1 }, (_, index) => index);
    for (let i = 1; i <= a.length; i += 1) {
      let diagonal = previous[0];
      previous[0] = i;
      for (let j = 1; j <= b.length; j += 1) {
        const old = previous[j];
        previous[j] = Math.min(
          previous[j] + 1,
          previous[j - 1] + 1,
          diagonal + (a[i - 1] === b[j - 1] ? 0 : 1)
        );
        diagonal = old;
      }
    }
    return previous[b.length];
  };

  const intersect = sets => {
    if (!sets.length) return new Set();
    const [smallest, ...rest] = [...sets].sort((a, b) => a.size - b.size);
    return new Set([...smallest].filter(value => rest.every(set => set.has(value))));
  };

  const create = payload => {
    if (payload?.version !== 2 || !Array.isArray(payload.documents) || !payload.terms || typeof payload.terms !== 'object') {
      throw new Error('Некорректный формат поискового индекса');
    }

    const documents = payload.documents.map((document, id) => {
      const metadata = normalize([
        document.title, document.description, document.section, document.type,
        document.topics, document.locations, document.period
      ].join(' '));
      return {
        ...document,
        id,
        _title: normalize(document.title),
        _description: normalize(document.description),
        _metadata: metadata,
        _metadataWords: metadata.split(' ').filter(Boolean)
      };
    });
    const entries = Object.entries(payload.terms);
    const exact = new Map(entries.map(([term, ids]) => [term, ids]));
    const matchCache = new Map();

    const relatedTerms = (term, allowFuzzy = false) => {
      const key = `${allowFuzzy ? 'f' : 'e'}:${term}`;
      if (matchCache.has(key)) return matchCache.get(key);
      const result = [];
      if (exact.has(term)) result.push([term, exact.get(term), 3]);
      if (term.length >= 3) {
        for (const [candidate, ids] of entries) {
          if (candidate === term) continue;
          if (candidate.startsWith(term) || (term.length >= 5 && term.startsWith(candidate))) {
            result.push([candidate, ids, 2]);
            if (result.length >= 80) break;
          }
        }
      }
      if (!result.length && allowFuzzy && term.length >= 4) {
        const limit = term.length >= 8 ? 2 : 1;
        for (const [candidate, ids] of entries) {
          if (Math.abs(candidate.length - term.length) > limit || candidate[0] !== term[0]) continue;
          if (distance(term, candidate) <= limit) {
            result.push([candidate, ids, 1]);
            if (result.length >= 30) break;
          }
        }
      }
      matchCache.set(key, result);
      return result;
    };

    const find = (rawQuery, { fuzzy = true, limit = 50 } = {}) => {
      const terms = normalize(rawQuery).split(' ').filter(Boolean).slice(0, 8);
      if (!terms.length) return [];
      let suggestion = false;
      const groups = terms.map(term => {
        let matches = relatedTerms(term, false);
        if (!matches.length && fuzzy) {
          matches = relatedTerms(term, true);
          suggestion ||= matches.length > 0;
        }
        const ids = new Set(matches.flatMap(([, postings]) => postings));
        return { term, matches, ids };
      });
      if (groups.some(group => !group.ids.size)) return [];

      const candidates = intersect(groups.map(group => group.ids));
      return [...candidates].map(id => {
        const document = documents[id];
        let score = 0;
        for (const group of groups) {
          const term = group.term;
          if (document._title.includes(term)) score += 18;
          if (document._description.includes(term)) score += 7;
          if (normalize(document.topics).includes(term)) score += 4;
          if (normalize(document.locations).includes(term)) score += 4;
          const bestBodyWeight = group.matches
            .filter(([, postings]) => postings.includes(id))
            .reduce((best, [, , weight]) => Math.max(best, weight), 0);
          score += bestBodyWeight;
        }
        if (document._metadata.includes(normalize(rawQuery))) score += 8;
        return { document, score, suggestion };
      }).sort((a, b) => b.score - a.score || String(b.document.date).localeCompare(String(a.document.date)))
        .slice(0, limit);
    };

    return {
      documents,
      normalize,
      find,
      urls: query => new Set(find(query, { limit: documents.length }).map(result => result.document.url))
    };
  };

  window.KRMSearchIndex = Object.freeze({ normalize, create });
})();
