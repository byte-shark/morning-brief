// Morning Brief - アプリロジック
document.addEventListener('DOMContentLoaded', () => {
  // 状態管理
  let newsData = null;
  let currentCategory = 'all';
  let filterUnreadOnly = false;
  let filterHighImportance = false;
  let readArticles = new Set(JSON.parse(localStorage.getItem('briefnews_read') || '[]'));
  let savedArticles = new Set(JSON.parse(localStorage.getItem('briefnews_saved') || '[]'));

  // DOM要素
  const todayDateEl = document.getElementById('todayDate');
  const updateTimeTextEl = document.getElementById('updateTimeText');
  const modelBadgeEl = document.getElementById('modelBadge');
  const newsListEl = document.getElementById('newsList');
  const categoryTabsEl = document.getElementById('categoryTabs');
  const unreadOnlyBtn = document.getElementById('unreadOnlyBtn');
  const highImportanceBtn = document.getElementById('highImportanceBtn');
  const progressTextEl = document.getElementById('progressText');
  const progressBarFillEl = document.getElementById('progressBarFill');
  const themeToggleBtn = document.getElementById('themeToggleBtn');
  const themeIconEl = document.getElementById('themeIcon');
  const infoBtn = document.getElementById('infoBtn');
  const infoModal = document.getElementById('infoModal');
  const closeModalBtn = document.getElementById('closeModalBtn');
  const confirmModalBtn = document.getElementById('confirmModalBtn');
  const refreshDataBtn = document.getElementById('refreshDataBtn');

  // 今日の日付フォーマット
  function initDate() {
    const days = ['日', '月', '火', '水', '木', '金', '土'];
    const now = new Date();
    const formatted = `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日(${days[now.getDay()]})`;
    if (todayDateEl) todayDateEl.textContent = formatted;
  }

  // テーマ切り替え初期化
  function initTheme() {
    const savedTheme = localStorage.getItem('briefnews_theme');
    const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const theme = savedTheme || (systemDark ? 'dark' : 'light');
    applyTheme(theme);
  }

  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('briefnews_theme', theme);
    themeIconEl.textContent = theme === 'dark' ? '☀️' : '🌙';
  }

  themeToggleBtn.addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme') || 'light';
    applyTheme(current === 'dark' ? 'light' : 'dark');
  });

  // データ取得
  async function loadNewsData() {
    newsListEl.innerHTML = `
      <div class="loading-state">
        <div class="spinner"></div>
        <p>最新のニュース要約を読み込み中...</p>
      </div>
    `;

    try {
      // キャッシュバスターを付与して常に最新のJSONを取得
      const timestamp = new Date().getTime();
      const response = await fetch(`./data/news.json?t=${timestamp}`);
      if (!response.ok) throw new Error(`HTTP error ${response.status}`);
      newsData = await response.json();
      renderApp();
    } catch (err) {
      console.warn('ニュースデータの取得失敗、キャッシュ確認中:', err);
      // Service workerのキャッシュフォールバック
      try {
        const cached = await fetch('./data/news.json');
        newsData = await cached.json();
        renderApp();
      } catch (cacheErr) {
        newsListEl.innerHTML = `
          <div class="empty-state">
            <p>⚠️ データの取得に失敗しました。</p>
            <p style="font-size:12px; margin-top:8px;">電波状況を確認して再読み込みしてください。</p>
            <button class="primary-btn" style="margin-top:16px; max-width:200px;" onclick="location.reload()">再試行</button>
          </div>
        `;
      }
    }
  }

  // 全記事フラット配列を取得
  function getAllArticles() {
    if (!newsData || !newsData.categories) return [];
    const all = [];
    newsData.categories.forEach(cat => {
      if (cat.articles) {
        cat.articles.forEach(art => {
          all.push({ ...art, categoryId: cat.id, categoryName: cat.name });
        });
      }
    });
    return all;
  }

  // アプリ全体の描画更新
  function renderApp() {
    if (!newsData) return;

    // ヘッダー情報更新
    if (newsData.updated_at) {
      updateTimeTextEl.textContent = `最終更新: ${newsData.updated_at}`;
    }
    if (newsData.model_used) {
      modelBadgeEl.textContent = newsData.model_used;
    }

    // タブ件数バッジ更新
    updateTabCounts();

    // 記事リスト描画
    renderArticles();

    // 進捗バー更新
    updateProgress();
  }

  function updateTabCounts() {
    const allArticles = getAllArticles();
    document.getElementById('count-all').textContent = allArticles.length;

    newsData.categories.forEach(cat => {
      const el = document.getElementById(`count-${cat.id}`);
      if (el) el.textContent = (cat.articles || []).length;
    });

    const savedCount = allArticles.filter(art => savedArticles.has(art.id)).length;
    document.getElementById('count-saved').textContent = savedCount;
  }

  function updateProgress() {
    const all = getAllArticles();
    if (all.length === 0) return;
    const readCount = all.filter(a => readArticles.has(a.id)).length;
    const pct = Math.round((readCount / all.length) * 100);

    progressTextEl.textContent = `進捗: ${readCount} / ${all.length} 読了 (${pct}%)`;
    progressBarFillEl.style.width = `${pct}%`;
  }

  // 星評価のHTML生成ヘルパー
  function getStarsHtml(score) {
    const val = Math.min(5, Math.max(1, score || 3));
    let starsStr = '';
    for (let i = 1; i <= 5; i++) {
      if (i <= val) {
        starsStr += '<span class="star-filled">★</span>';
      } else {
        starsStr += '<span class="star-empty">★</span>';
      }
    }
    return starsStr;
  }

  // 記事リスト描画
  function renderArticles() {
    const allArticles = getAllArticles();
    let filtered = [];

    if (currentCategory === 'all') {
      filtered = allArticles;
    } else if (currentCategory === 'saved') {
      filtered = allArticles.filter(art => savedArticles.has(art.id));
    } else {
      filtered = allArticles.filter(art => art.categoryId === currentCategory);
    }

    // 注目度フィルター（★4以上）
    if (filterHighImportance) {
      filtered = filtered.filter(art => (art.importance || 3) >= 4);
    }

    // 未読のみフィルター
    if (filterUnreadOnly) {
      filtered = filtered.filter(art => !readArticles.has(art.id));
    }

    if (filtered.length === 0) {
      newsListEl.innerHTML = `
        <div class="empty-state">
          <div style="font-size: 32px; margin-bottom: 8px;">📭</div>
          <p>${filterUnreadOnly ? 'すべての記事を読み終わりました！' : '該当する記事がありません。'}</p>
        </div>
      `;
      return;
    }

    newsListEl.innerHTML = '';
    filtered.forEach(art => {
      const isRead = readArticles.has(art.id);
      const isSaved = savedArticles.has(art.id);
      const importance = art.importance || 3;
      const starsHtml = getStarsHtml(importance);

      const card = document.createElement('article');
      card.className = `news-card ${art.categoryId} ${isRead ? 'read' : ''}`;
      card.id = `card-${art.id}`;

      // 3行要約のHTML構築
      let summaryHtml = '';
      if (Array.isArray(art.summary)) {
        summaryHtml = art.summary.map((line, idx) => `
          <div class="summary-item">
            <span class="summary-num num-${idx + 1}">${idx + 1}</span>
            <span>${line}</span>
          </div>
        `).join('');
      } else {
        summaryHtml = `<div class="summary-item"><span>${art.summary || ''}</span></div>`;
      }

      // 注目ポイントのHTML構築
      let keyPointsHtml = '';
      if (art.key_points && art.key_points.length > 0) {
        const pointsList = art.key_points.map(pt => `<li>${pt}</li>`).join('');
        keyPointsHtml = `
          <button class="details-toggle" data-id="${art.id}">
            <span class="toggle-icon">▶</span> 💡 注目ポイントを見る
          </button>
          <div class="details-content" id="details-${art.id}">
            <ul>${pointsList}</ul>
          </div>
        `;
      }

      card.innerHTML = `
        <div class="card-header">
          <div class="card-badges">
            <span class="category-tag ${art.categoryId}">${art.categoryName}</span>
            ${art.is_official ? '<span class="badge-official">公式発表</span>' : ''}
            <span class="badge-official" style="background:var(--bg-subtle); color:var(--text-secondary); border:none;">${art.badge || '注目'}</span>
            <span class="importance-wrapper" title="注目度 ★${importance}/5">
              <span class="importance-stars">${starsHtml}</span>
              <span>★${importance}</span>
            </span>
          </div>
          <div class="status-and-stars">
            <span class="read-status-pill ${isRead ? 'read' : 'unread'}" id="status-pill-${art.id}">
              ${isRead ? '✓ 読了' : '● 未読'}
            </span>
            <span class="card-time">${art.published_at || ''}</span>
          </div>
        </div>

        <h2 class="card-headline">${art.headline || art.title}</h2>

        <div class="summary-box">
          ${summaryHtml}
        </div>

        ${keyPointsHtml}

        <div class="card-footer">
          <span class="card-source" title="${art.source}">📰 ${art.source}</span>
          <div class="card-actions">
            <button class="action-btn save-btn ${isSaved ? 'active' : ''}" data-id="${art.id}" aria-label="保存">
              ${isSaved ? '⭐ 保存済' : '☆ 保存'}
            </button>
            <button class="action-btn read-check-btn ${isRead ? 'checked' : ''}" data-id="${art.id}" aria-label="既読切替">
              ${isRead ? '✓ 読了' : '○ 未読'}
            </button>
            <a href="${art.link}" target="_blank" rel="noopener noreferrer" class="action-btn" aria-label="元記事">
              元記事 ↗
            </a>
          </div>
        </div>
      `;

      newsListEl.appendChild(card);
    });

    // イベントバインド
    bindCardEvents();
  }

  function bindCardEvents() {
    // 注目ポイント開閉
    document.querySelectorAll('.details-toggle').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = btn.getAttribute('data-id');
        const content = document.getElementById(`details-${id}`);
        const icon = btn.querySelector('.toggle-icon');
        if (content.classList.contains('open')) {
          content.classList.remove('open');
          icon.textContent = '▶';
        } else {
          content.classList.add('open');
          icon.textContent = '▼';
        }
      });
    });

    // 既読切替
    document.querySelectorAll('.read-check-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        const card = document.getElementById(`card-${id}`);
        const statusPill = document.getElementById(`status-pill-${id}`);
        if (readArticles.has(id)) {
          readArticles.delete(id);
          btn.classList.remove('checked');
          btn.textContent = '○ 未読';
          if (card) card.classList.remove('read');
          if (statusPill) {
            statusPill.className = 'read-status-pill unread';
            statusPill.textContent = '● 未読';
          }
        } else {
          readArticles.add(id);
          btn.classList.add('checked');
          btn.textContent = '✓ 読了';
          if (card) card.classList.add('read');
          if (statusPill) {
            statusPill.className = 'read-status-pill read';
            statusPill.textContent = '✓ 読了';
          }
        }
        localStorage.setItem('briefnews_read', JSON.stringify(Array.from(readArticles)));
        updateProgress();
        if (filterUnreadOnly) renderArticles();
      });
    });

    // お気に入り切替
    document.querySelectorAll('.save-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        if (savedArticles.has(id)) {
          savedArticles.delete(id);
          btn.classList.remove('active');
          btn.textContent = '☆ 保存';
        } else {
          savedArticles.add(id);
          btn.classList.add('active');
          btn.textContent = '⭐ 保存済';
        }
        localStorage.setItem('briefnews_saved', JSON.stringify(Array.from(savedArticles)));
        updateTabCounts();
        if (currentCategory === 'saved') renderArticles();
      });
    });
  }

  // カテゴリタブ切り替え
  categoryTabsEl.addEventListener('click', (e) => {
    const btn = e.target.closest('.tab-btn');
    if (!btn) return;
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentCategory = btn.getAttribute('data-category');
    renderArticles();
  });

  // 注目度（★4以上）フィルター切り替え
  if (highImportanceBtn) {
    highImportanceBtn.addEventListener('click', () => {
      filterHighImportance = !filterHighImportance;
      highImportanceBtn.classList.toggle('active', filterHighImportance);
      renderArticles();
    });
  }

  // 未読のみ切り替え
  unreadOnlyBtn.addEventListener('click', () => {
    filterUnreadOnly = !filterUnreadOnly;
    unreadOnlyBtn.classList.toggle('active', filterUnreadOnly);
    renderArticles();
  });

  // 再読込リンク
  if (refreshDataBtn) {
    refreshDataBtn.addEventListener('click', (e) => {
      e.preventDefault();
      loadNewsData();
    });
  }

  // モーダル操作
  infoBtn.addEventListener('click', () => infoModal.classList.remove('hidden'));
  closeModalBtn.addEventListener('click', () => infoModal.classList.add('hidden'));
  confirmModalBtn.addEventListener('click', () => infoModal.classList.add('hidden'));
  infoModal.addEventListener('click', (e) => {
    if (e.target === infoModal) infoModal.classList.add('hidden');
  });

  // Service Worker登録（PWA対応）
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js')
        .then(reg => console.log('ServiceWorker 登録成功:', reg.scope))
        .catch(err => console.log('ServiceWorker 登録失敗:', err));
    });
  }

  // 初期化実行
  initDate();
  initTheme();
  loadNewsData();
});
