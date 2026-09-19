/* ═══════════════════════════════════════════
   PORTFOLIO PAGE — 影视传媒录取案例
   数据源：data/portfolio.json（DATA.portfolio）
   卡片：院校 / 专业 / 学生背景 / 方向标签（无图占位，沿用 IST 卡片视觉语言）
   点击：侧栏展示完整案例（背景 · 实习 · 作品 · 奖项 · 申请策略）

   筛选：两条独立筛选栏——
     1) 层次（本科 / 研究生）：portfolio.json 本身没有这个字段，客户端按
        两级信号推断——① primary_program 文案里出现的学位关键词
        （MFA/Master/硕士 → 研究生，BFA/Bachelor/本科 → 本科）；
        ② 兜底看 bg_school 背景校是"大学/学院"（说明在读/毕业于大学，
        当前申请多为读研）还是"高中/学校"（说明本科申请）。48 条里 41 条
        能靠这两条信号判定，剩下 7 条背景文案太模糊（如"（未明示）"
        "UCL-media"）——这 7 条不强行归类，落入「未标注」筛选项，不
        混进本科/研究生里，避免呈现看似确定实则是猜的数据。
     2) 国家：按 primary_school_en / primary_school 反查 DATA.programs 的
        school_en / school_zh 拿到 country_group（US/UK/HK_SG/OTHER），
        48 条 100% 能匹配到（院校库的院校对录取案例的院校是超集）。标签
        沿用院校库同一套 SFK_GROUP_LABELS 分组口径。
═══════════════════════════════════════════ */
const PortfolioPage = {
  LEVEL_ORDER: ['undergraduate', 'graduate', 'unknown'],
  LEVEL_LABELS: { undergraduate: '本科', graduate: '研究生', unknown: '未标注' },

  _items: null,
  _level: null,        // null = 全部
  _country: null,      // null = 全部
  _branchFilter: null, // 由 Router.goToPortfolioFilter 带入的产业方向深链，不在筛选栏里露出

  build() {
    this._items = (DATA.portfolio || []).map(p => ({
      ...p,
      _level: this._inferLevel(p),
      _country: this._inferCountry(p),
    }));
    this._level = null;
    this._country = null;
    this._branchFilter = null;
    this._renderLevelFilter();
    this._renderCountryFilter();
    this._render();
  },

  // 从产业规划页「优秀案例 →」跳转过来：按 academic_branch 做一次隐式过滤
  // （层次/国家筛选栏本身重置为「全部」），网格上方给一条可清除的提示条，
  // 避免用户看到结果变少却不知道是被筛过的。
  filterByBranch(branch) {
    this._level = null;
    this._country = null;
    this._branchFilter = branch || null;
    document.querySelectorAll('#portfolio-level-filter .filter-btn, #portfolio-country-filter .filter-btn')
      .forEach(b => b.classList.toggle('is-active', b.hasAttribute('data-all')));
    this._render();
  },

  clearBranchFilter() {
    this._branchFilter = null;
    this._render();
  },

  // ── 层次推断：学位关键词优先，其次看背景校类型 ──────────────
  _inferLevel(p) {
    const prog = (p.primary_program || '');
    const bg = (p.bg_school || '');
    const progLow = prog.toLowerCase();

    const gradKw = ['mfa', 'm.f.a', 'ma ', 'm.a.', 'msc', 'master', '硕士', '研究生'];
    const undergradKw = ['bfa', 'b.f.a', 'ba ', 'b.a.', 'bachelor', '本科'];
    if (gradKw.some(kw => progLow.includes(kw))) return 'graduate';
    if (undergradKw.some(kw => progLow.includes(kw))) return 'undergraduate';

    if (bg.includes('本科')) return 'undergraduate';

    const uniKw = ['大学', '学院', 'university', 'college', '分校', '211', '985', '师范'];
    const hsKw = ['高中', '中学', 'secondary', 'academy', '美高', 'school', '学校', '国际'];
    const bgLow = bg.toLowerCase();
    if (uniKw.some(kw => bg.includes(kw) || bgLow.includes(kw))) return 'graduate';
    if (hsKw.some(kw => bg.includes(kw) || bgLow.includes(kw))) return 'undergraduate';

    return 'unknown';
  },

  // ── 国家推断：反查院校库拿 country_group ──────────────────
  _inferCountry(p) {
    const programs = DATA.programs || [];
    const en = (p.primary_school_en || '').trim().toLowerCase();
    const zh = (p.primary_school || '').trim();
    const hit = programs.find(pr => (pr.school_en || '').trim().toLowerCase() === en)
      || programs.find(pr => (pr.school_zh || '').trim() === zh);
    return (hit && hit.country_group) || 'OTHER';
  },

  _countryLabelPlain(group) {
    const label = (window.SFK_GROUP_LABELS && window.SFK_GROUP_LABELS[group]) || group;
    const parts = label.split(' ');
    return parts.length > 1 ? parts.slice(1).join(' ') : label;
  },

  _renderLevelFilter() {
    const bar = document.getElementById('portfolio-level-filter');
    if (!bar) return;
    const counts = {};
    this._items.forEach(p => { counts[p._level] = (counts[p._level] || 0) + 1; });
    bar.innerHTML = `<span class="filter-bar__label">层次</span>` +
      `<button class="filter-btn is-active" data-all onclick="PortfolioPage.setLevel(null,this)">全部</button>` +
      this.LEVEL_ORDER.filter(l => counts[l]).map(l =>
        `<button class="filter-btn" data-level="${l}" onclick="PortfolioPage.setLevel('${l}',this)">${this.LEVEL_LABELS[l]} · ${counts[l]}</button>`
      ).join('');
  },

  _renderCountryFilter() {
    const bar = document.getElementById('portfolio-country-filter');
    if (!bar) return;
    const order = (window.SchoolLibrary && window.SchoolLibrary.REGION_ORDER) || ['US', 'UK', 'HK_SG', 'OTHER'];
    const counts = {};
    this._items.forEach(p => { counts[p._country] = (counts[p._country] || 0) + 1; });
    bar.innerHTML = `<span class="filter-bar__label">国家</span>` +
      `<button class="filter-btn is-active" data-all onclick="PortfolioPage.setCountry(null,this)">全部</button>` +
      order.filter(g => counts[g]).map(g =>
        `<button class="filter-btn" data-country="${g}" onclick="PortfolioPage.setCountry('${g}',this)">${this._countryLabelPlain(g)} · ${counts[g]}</button>`
      ).join('');
  },

  setLevel(level, btn) {
    this._level = level;
    document.querySelectorAll('#portfolio-level-filter .filter-btn').forEach(b => b.classList.remove('is-active'));
    if (btn) btn.classList.add('is-active');
    this._render();
  },

  setCountry(country, btn) {
    this._country = country;
    document.querySelectorAll('#portfolio-country-filter .filter-btn').forEach(b => b.classList.remove('is-active'));
    if (btn) btn.classList.add('is-active');
    this._render();
  },

  // 无图卡片用院校英文名首字母做占位符
  _initials(p) {
    const en = (p.primary_school_en || '').replace(/[^A-Za-z ]/g, '').trim();
    if (en) return en.split(/\s+/).slice(0, 2).map(w => w[0].toUpperCase()).join('');
    return (p.primary_school || '·').slice(0, 2);
  },

  _render() {
    const items = (this._items || []).filter(p =>
      (!this._level || p._level === this._level) &&
      (!this._country || p._country === this._country) &&
      (!this._branchFilter || p.academic_branch === this._branchFilter)
    );
    const grid = document.getElementById('portfolio-grid');
    if (!grid) return;

    const banner = document.getElementById('portfolio-branch-banner');
    if (this._branchFilter) {
      const html = `<div class="portfolio-branch-banner" id="portfolio-branch-banner">已按「${this._branchFilter}」筛选 · <button type="button" onclick="PortfolioPage.clearBranchFilter()">清除</button></div>`;
      if (banner) banner.outerHTML = html;
      else grid.insertAdjacentHTML('beforebegin', html);
    } else if (banner) {
      banner.remove();
    }

    if (!items.length) {
      grid.innerHTML = '<p class="u-muted" style="padding:32px 0;font-size:13px;">该条件下暂无案例数据</p>';
      return;
    }
    grid.innerHTML = items.map(p => {
      const otherSchools = (p.other_schools || []).filter(Boolean);
      const ctx = [p.student, p.bg_school].filter(Boolean).join(' · ');
      return `
      <div class="port-card" onclick="PortfolioPage.open('${p.id}')">
        <div class="port-card__img port-card__img--empty">
          <span>${this._initials(p)}</span>
          <span class="port-card__cat-tag">${p.academic_branch || ''}</span>
        </div>
        <div class="port-card__body">
          <div class="port-card__title">${p.primary_school || '—'}</div>
          <div class="port-card__program">${p.primary_program || ''}</div>
          ${ctx ? `<div class="port-card__other-schools">${ctx}${p.fall ? ' · ' + p.fall : ''}</div>` : ''}
          ${otherSchools.length ? `<div class="port-card__other-schools">另获：${otherSchools.join('　')}</div>` : ''}
          ${p.tags && p.tags.length ? `<div class="port-card__tags">${p.tags.map(t => `<span class="port-card__tag">${t}</span>`).join('')}</div>` : ''}
        </div>
      </div>`;
    }).join('');
  },

  // ── 案例详情侧栏 ──────────────────────────────────────────────
  _list(arr, limit) {
    const items = (arr || []).filter(x => x && String(x).trim().length > 4).slice(0, limit);
    if (!items.length) return '';
    return `<ul style="margin:0;padding-left:18px;font-size:13px;line-height:1.85;color:var(--color-text-secondary);">
      ${items.map(x => `<li>${x}</li>`).join('')}
    </ul>`;
  },

  open(id) {
    const p = (DATA.portfolio || []).find(x => x.id === id);
    if (!p) return;
    const scores = Object.entries(p.scores || {});
    const otherSchools = (p.other_schools || []).filter(Boolean);

    const block = (label, body) => body ? `
      <div class="sidebar__section">
        <div class="sidebar__section-label">${label}</div>
        ${body}
      </div>
      <hr class="sidebar__divider">` : '';

    Sidebar.open(`
      <div class="sidebar__header">
        <div class="sidebar__eyebrow">${p.industry_label || ''} · ${p.academic_branch || ''}</div>
        <div class="sidebar__title">${p.primary_school || '录取案例'}</div>
        <div class="sidebar__subtitle">${[p.primary_program, p.fall].filter(Boolean).join(' · ')}</div>
      </div>
      <div class="sidebar__body">
        <div class="sidebar__section">
          <div class="sidebar__section-label">录取结果</div>
          <div class="sidebar__tags">
            <span class="sidebar__tag" style="border-color:var(--color-primary-bright);color:var(--color-primary-bright)">${p.primary_school || ''}</span>
            ${otherSchools.map(s => `<span class="sidebar__tag">${s}</span>`).join('')}
          </div>
        </div>
        <hr class="sidebar__divider">

        <div class="sidebar__section">
          <div class="sidebar__section-label">学生背景</div>
          <p style="font-size:13px;margin:0 0 6px">${[p.student, p.bg_school].filter(Boolean).join(' · ')}</p>
          ${scores.length ? `<div class="sidebar__tags">${scores.map(([k, v]) =>
            `<span class="sidebar__tag">${k}：${v}</span>`).join('')}</div>` : ''}
        </div>
        <hr class="sidebar__divider">

        ${block('实习 / 背景', this._list(p.intern, 6))}
        ${block('影视作品', this._list(p.works, 4))}
        ${block('获奖经历', this._list(p.awards, 6))}
        ${block('申请策略', this._list(p.strategy, 5))}

        <div class="sidebar__section">
          <div class="sidebar__section-label">继续探索</div>
          <button class="sidebar__tag" style="cursor:pointer"
                  onclick="Sidebar.close();Router.goToIndustry('${p.industry_id || ''}')">查看「${p.industry_label || '对应方向'}」岗位与院校 →</button>
        </div>
      </div>`);
  },
};
window.PortfolioPage = PortfolioPage;
