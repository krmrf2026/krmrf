(() => {
  'use strict';

  const normalize = value => String(value || '')
    .toLocaleLowerCase('ru-RU')
    .replace(/ё/g, 'е')
    .replace(/[–—-]/g, ' ')
    .replace(/[^a-zа-я0-9\s]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const stop = new Set('а в во и из к ко на но о об от по при с со у для как'.split(' '));
  const tokens = value => [...new Set(normalize(value).split(' ').filter(word =>
    (word.length > 1 || /^\d$/.test(word)) && !stop.has(word)))];

  // Group only inflections with a long common stem. Never match a short
  // indexed prefix inside a longer word (e.g. «на» inside «наследство»).
  const root = word => {
    if (!/^[а-я]{5,}$/.test(word)) return word;
    const base = word.replace(/(?:иями|ями|ами|ого|его|ому|ему|ыми|ими|ах|ях|ов|ев|ом|ем|ой|ей|ам|ям|ую|юю|ые|ие|ый|ий|ых|их|ая|яя|ое|ее|а|я|у|ю|е|ы|и|о|ь)$/, '');
    return base.length >= 4 ? base : word;
  };

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

  const decodeEntries = payload => {
    if (payload?.version === 2 && payload.terms && typeof payload.terms === 'object' && !Array.isArray(payload.terms)) return Object.entries(payload.terms);
    if (payload?.version !== 3 || !Array.isArray(payload.terms)) throw new Error('Некорректный формат поискового индекса');
    const width = Number(payload.postingWidth);
    if (!Number.isInteger(width) || width < 1 || width > 6 || payload.terms.length % 3) throw new Error('Некорректные параметры поискового индекса');
    const entries = [];
    let previous = '';
    for (let index = 0; index < payload.terms.length; index += 3) {
      const prefix = Number(payload.terms[index]);
      const suffix = String(payload.terms[index + 1] ?? '');
      const encoded = String(payload.terms[index + 2] ?? '');
      if (!Number.isInteger(prefix) || prefix < 0 || prefix > previous.length || encoded.length % width) throw new Error('Повреждённая таблица терминов');
      const term = previous.slice(0, prefix) + suffix;
      const ids = [];
      for (let offset = 0; offset < encoded.length; offset += width) {
        const id = Number.parseInt(encoded.slice(offset, offset + width), 36);
        if (!Number.isInteger(id)) throw new Error('Повреждённая таблица postings');
        ids.push(id);
      }
      entries.push([term, ids]);
      previous = term;
    }
    return entries;
  };

  const create = payload => {
    if (!Array.isArray(payload?.documents)) throw new Error('Некорректный формат поискового индекса');
    const entries = decodeEntries(payload);
    const documents = payload.documents.map((document, id) => {
      const metadata = normalize([
        document.title, document.description, document.section, document.type,
        document.topics, document.locations, document.period
      ].join(' '));
      return {
        ...document,
        id,
        _aliases: (document.aliases || []).map(phrase => tokens(phrase).map(root).join(' ')),
        _title: normalize(document.title),
        _description: normalize(document.description),
        _metadata: metadata
      };
    });
    for (const [term, ids] of entries) {
      if (!term || !Array.isArray(ids) || !ids.length || ids.some(id => id < 0 || id >= documents.length)) {
        throw new Error('Повреждённая таблица терминов');
      }
    }
    const matchCache = new Map();

    const families = new Map();
    for (const entry of entries) {
      const base = root(entry[0]);
      if (!families.has(base)) families.set(base, []);
      families.get(base).push(entry);
    }

    const relatedTerms = (term, allowFuzzy = false) => {
      const key = allowFuzzy ? 'f:' + term : term;
      if (matchCache.has(key)) return matchCache.get(key);
      const result = (families.get(root(term)) || []).map(([word, ids]) =>
        [word, ids, word === term ? 3 : 2]);
      if (!result.length && term.length >= 4 && !allowFuzzy) {
        for (const [word, ids] of entries) {
          if (word.startsWith(term) && word.length <= term.length + 4) result.push([word, ids, 2]);
        }
      }
      if (!result.length && allowFuzzy && term.length >= 4) {
        const limit = term.length >= 8 ? 2 : 1;
        for (const [word, ids] of entries) {
          if (word[0] === term[0] && Math.abs(word.length - term.length) <= limit
              && distance(term, word) <= limit) result.push([word, ids, 1]);
        }
      }
      if (matchCache.size >= 256) matchCache.clear();
      matchCache.set(key, result);
      return result;
    };

    const find = (rawQuery, { fuzzy = true, limit = 50 } = {}) => {
      const terms = tokens(String(rawQuery || '').slice(0, 100)).slice(0, 8);
      if (!terms.length) return [];
      const phrase = terms.map(root).join(' ');
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
        let score = document._aliases.includes(phrase) ? 55 : 0;
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

  const scope = typeof window === 'undefined' ? globalThis : window;
  scope.KRMSearchIndex = Object.freeze({ normalize, tokens, create });
})();
