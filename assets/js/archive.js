async function loadArchive() {
  try {

    const [newsRes, assessmentRes] = await Promise.all([
      fetch('/data/news.json', { cache: 'no-cache' }),
      fetch('/data/assessment.json', { cache: 'no-cache' })
    ]);

    if (!newsRes.ok) {
      throw new Error(`news.json HTTP ${newsRes.status}`);
    }

    if (!assessmentRes.ok) {
      throw new Error(`assessment.json HTTP ${assessmentRes.status}`);
    }

    const news = await newsRes.json();
    const assessment = await assessmentRes.json();

    // обычные новости
    const regularNews = Array.isArray(news)
      ? news.filter(item => item.section !== 'warcrimes')
      : [];

    // war crimes
    const warCrimes = Array.isArray(news)
      ? news.filter(item => item.section === 'warcrimes')
      : [];

    renderArchive(
      regularNews,
      document.getElementById('archiveNews')
    );

    renderArchive(
      warCrimes,
      document.getElementById('archiveWarCrimes')
    );

    renderArchive(
      assessment,
      document.getElementById('archiveAssessment')
    );

  } catch (e) {

    console.error('Ошибка загрузки архива:', e);

    showArchiveError('archiveNews');
    showArchiveError('archiveWarCrimes');
    showArchiveError('archiveAssessment');
  }
}

function showArchiveError(id) {

  const container = document.getElementById(id);

  if (!container) return;

  container.innerHTML = `
    <div class="card">
      <p>Не удалось загрузить материалы.</p>
      <p><a href="/archive/">Попробовать снова →</a></p>
    </div>
  `;
}

function renderArchive(items, container) {

  if (!container) return;

  container.innerHTML = '';

  if (!Array.isArray(items) || items.length === 0) {

    const empty = document.createElement('p');

    empty.textContent = 'Материалы пока отсутствуют.';

    container.appendChild(empty);

    return;
  }

  // сортировка по дате
  const sorted = [...items]
    .filter(item =>
      item &&
      item.updated &&
      item.url &&
      item.title
    )
    .sort((a, b) =>
      b.updated.localeCompare(a.updated)
    );

  const grouped = {};

  sorted.forEach(item => {

    const month = item.updated.slice(0, 7);

    if (!grouped[month]) {
      grouped[month] = [];
    }

    grouped[month].push(item);
  });

  Object.keys(grouped).forEach(month => {

    const block = document.createElement('div');

    block.className = 'archive-month';

    // заголовок месяца
    const title = document.createElement('h4');

    title.textContent = formatMonth(month);

    const list = document.createElement('ul');

    grouped[month].forEach(item => {

      const li = document.createElement('li');

      const link = document.createElement('a');

      link.href = item.url;

      // дата
      const date = document.createElement('span');

      date.className = 'date';
      date.textContent = item.updated;

      link.appendChild(date);

      // заголовок
      const text = document.createTextNode(item.title);

      link.appendChild(text);

      li.appendChild(link);

      list.appendChild(li);
    });

    block.appendChild(title);
    block.appendChild(list);

    container.appendChild(block);
  });
}

function formatMonth(month) {

  const [year, m] = month.split('-');

  const names = [
    'Январь',
    'Февраль',
    'Март',
    'Апрель',
    'Май',
    'Июнь',
    'Июль',
    'Август',
    'Сентябрь',
    'Октябрь',
    'Ноябрь',
    'Декабрь'
  ];

  return `${names[parseInt(m, 10) - 1]} ${year}`;
}

loadArchive();
