/* ═══════════════════════════════════════════
   SCHOOL LIBRARY（院校库）
   ───────────────────────────────────────────
   复刻 _archive/ 原项目「院校库」（10-school-library.js）的浏览 + 搜索 + 筛选 +
   详情交互，但数据完全复用当前站内已有的 data/programs.json（按 school_en
   聚合出 149 所学校，而不是新增一份 data/schools.json）：
     - 地区筛选：原先用 country_group（US/UK/HK_SG/OTHER 四组合并，跟我的
       规划侧边栏国家 Tab 同一口径），现改成按单个国家逐个列出（美国/英国/
       澳洲/新西兰/香港/澳门/日本/韩国/加拿大共 9 个），顺序和标签复刻
       archive 站 10-school-library.js 的 REGION_ORDER，直接用 program.country
       原始字段（不再用 country_group），只影响院校库这一个页面——
       country_group 这个字段本身是 programs.json 里预算好的原始数据，
       我的规划页（portfolio.js._inferCountry）是直接读原始 JSON 里的
       country_group，不经过这里，两边互不影响。
     - 类别筛选：archive 站原本按 category 字符串关键词分 6 类，当前项目
       programs.json 没有等价字段；改用站内已有的「八大影视传媒产业方向」
       （data/industries.json + 每个 program 的 industry_tags），跟产业全景 /
       岗位库共用同一套分类，更符合本站的信息架构。
     - 综合排名 = industry_rank（来自 school_priority.json 的 industry_score
       换算，已展平进每条 program）；rank 为 0 表示该校未进入优先名单，排序时
       视为「无排名」，排在最后而不是排在最前。
     - 「适配产业方向」= 该校名下所有 program 的 industry_tags 并集，点击直接
       跳转到产业全景对应赛道（Router.goToIndustry），不单独复刻
       role-school-coverage.json 这份很大的岗位覆盖表。
     - 「斯芬克历年录取数据」：programs.json 里的 sfk_total / has_sfk_data 只有
       历年累计总数，没有 archive 那样按年份拆分的明细；本季度的真实分布则
       从 data/cases.json 现有的 48 条案例里按 school + fall 聚合得到（只用
       计数，不读取姓名/成绩/实习等个人叙事字段）。两者都用「offer 展示」同款
       的 .offer-card 小卡片呈现，不做柱状图，也不编造没有的年份数据。
     - 「具体专业与学制」：列表页每个专业只显示学位/学制/学费速览 + 一条
       「查看完整要求」入口，点击后用独立的全屏 overlay 展示完整内容——
       不再用 Sidebar 或 <details> 手风琴，避免大段文字被折叠/挤在窄侧栏里。
       完整内容优先取自 data/application_requirements.json（经
       data/program_requirements.json 按 program.id 精确匹配），这份数据
       逐条列出申请材料/作品集要求（如 USC MFA 的 Personal Statement /
       Writing Sample / Creative Portfolio List / Creative Team Question /
       Video Introduction / Media Sample / 个人职责 / 短片附加材料 / 上传
       要求 / 面试 共 10 条），比 programs.json 里 portfolio_note 这个摘要
       字段更完整、更贴近 archive 站原本逐条罗列的呈现方式；没有匹配上的
       专业（program_requirements 里 matchStatus 为 unavailable）回退用
       programs.json 自带的 background_note / portfolio_note / caution。
   明确不迁移的部分（按需求：学生成功案例先留空占位）：
     - archive 的 openCasesModal / renderCaseModal（逐个学生的录取案例卡片，
       含测试成绩/实习/作品/获奖/规划策略/导师评语）
     - archive 的 cases-by-school.json 数据
     顶部「查看录取案例」按钮同样改用全屏 overlay 承载「整理中」占位提示，
     跟「查看申请要求」统一交互方式，但内容仍是占位。
   ═══════════════════════════════════════════ */
const SchoolLibrary = {
  _schools: [],
  _activeEn: null,
  _query: '',
  _regions: new Set(),     // 空集合 = 不限地区
  _industries: new Set(),  // 空集合 = 不限产业
  _aiOnly: false,
  _sfkOnly: false,
  _sort: 'rank',
  _listExpanded: false, // true = 隐藏右侧常驻详情，左侧列表占满整行

  // 地区筛选按单个国家列出，顺序和标签复刻 archive 站 10-school-library.js
  // 的 REGION_ORDER（美国/英国/澳洲/新西兰/香港/澳门/日本/韩国/加拿大），
  // 不是按数量排序，是当时人工定的地区聚簇顺序；国旗 emoji 是新配的（archive
  // 原版没有）。数据现在统一放在 data/school_priority.json 的 _meta.country_order
  // / _meta.country_labels 里（跟 career-plan.js 共用同一份，避免多处维护），
  // 这里只读不改。只用在院校库这一个页面，不影响 school_priority.json 里
  // 那套 US/UK/HK_SG/OTHER 四组分类（school_priority 数据本身仍按四组织，
  // 是另一件事，见 _buildSchools）。
  AI_TIER_RANK: { none: 0, weak: 1, basic: 2, embed: 3, strong: 4, core: 5 },

  build() {
    this._schools = this._buildSchools();
    this._renderKpi();
    this._renderRegionFilter();
    this._renderIndustryFilter();
    this._renderToggleFilter();
    this._renderSortBar();
    this._bindSearch();
    this._bindOverlay();
    this._renderList();
    this._renderDetail(null);
  },

  // 全屏 overlay（专业申请要求 / 录取案例占位统一走这里，不再用 Sidebar 或
  // <details> 手风琴），DOM 结构见 index.html #schools-overlay，视觉上仿照
  // 站内已有的 .course-overlay（course-demo.js）——同样是「大段内容需要
  // 充分展开阅读」的场景，复用同一套全屏浮层交互，只是换一套独立的类名
  // （.school-overlay*），避免跟课程产品页耦合。
  _bindOverlay() {
    const overlay = document.getElementById('schools-overlay');
    if (!overlay || overlay.dataset.bound) return;
    overlay.dataset.bound = '1';
    overlay.querySelector('.school-overlay__backdrop')?.addEventListener('click', () => this.closeOverlay());
    overlay.querySelector('.school-overlay__close')?.addEventListener('click', () => this.closeOverlay());
    document.addEventListener('keydown', e => { if (e.key === 'Escape') this.closeOverlay(); });
  },
  _openOverlay(html) {
    const body = document.getElementById('schools-overlay-body');
    const overlay = document.getElementById('schools-overlay');
    if (!body || !overlay) return;
    body.innerHTML = html;
    overlay.classList.add('is-open');
    document.body.style.overflow = 'hidden';
    body.scrollTop = 0;
  },
  closeOverlay() {
    document.getElementById('schools-overlay')?.classList.remove('is-open');
    document.body.style.overflow = '';
  },

  // 把 344 条 program 记录按 school_en 聚合成 149 所学校的「学校卡片」，
  // 学校级字段（school_intro / school_ai / school_tags 等）在 programs.json
  // 里本就是按学校冗余写在每条 program 上的，取第一条即可；ai_level /
  // industry_tags / program_url 等在同校内可能因专业而异，取并集或最高档。
  _buildSchools() {
    const byEn = new Map();
    const priorityByEn = new Map();
    ['US', 'UK', 'HK_SG', 'OTHER'].forEach(g => {
      (DATA.school_priority && DATA.school_priority[g] || []).forEach(s => priorityByEn.set(s.school_en, s));
    });

    (DATA.programs || []).forEach(p => {
      if (!byEn.has(p.school_en)) {
        byEn.set(p.school_en, {
          school_en: p.school_en, school_zh: p.school_zh, school_short: p.school_short,
          country: p.country,
          school_city: p.school_city, school_region: p.school_region, school_college: p.school_college,
          ai_level: 'none', industry_rank: p.industry_rank || 0, prestige_score: p.prestige_score || 0,
          school_intro: p.school_intro, school_ai: p.school_ai, school_advantages: p.school_advantages,
          school_positioning: p.school_positioning, school_ranking: p.school_ranking,
          school_tags: p.school_tags || [], school_faculty: [], school_alumni: [],
          sfk_total: 0, has_sfk_data: false,
          industry_tags: new Set(), urls: new Set(), programs: [],
        });
      }
      const s = byEn.get(p.school_en);
      s.programs.push(p);
      (p.industry_tags || []).forEach(t => s.industry_tags.add(t));
      if (p.program_url) s.urls.add(p.program_url);
      if (p.has_sfk_data) s.has_sfk_data = true;
      s.sfk_total = Math.max(s.sfk_total, p.sfk_total || 0);
      if ((this.AI_TIER_RANK[p.ai_level] || 0) > (this.AI_TIER_RANK[s.ai_level] || 0)) s.ai_level = p.ai_level;
      (p.school_faculty || []).forEach(f => { if (!s.school_faculty.includes(f)) s.school_faculty.push(f); });
      (p.school_alumni || []).forEach(a => { if (!s.school_alumni.includes(a)) s.school_alumni.push(a); });
    });

    return [...byEn.values()].map(s => {
      const pr = priorityByEn.get(s.school_en);
      return {
        ...s,
        industry_tags: [...s.industry_tags],
        urls: [...s.urls],
        category: pr ? pr.category : '',
        programs: s.programs.sort((a, b) => (a.level === b.level ? 0 : a.level === 'undergraduate' ? -1 : 1)),
      };
    });
  },

  _regionLabel(country) {
    const c = (DATA.school_priority && DATA.school_priority._meta && DATA.school_priority._meta.country_labels || {})[country];
    return c ? `${c.flag} ${c.name}` : country;
  },
  // 筛选栏专用：_regionLabel 里国旗 emoji 和文字用空格拼在一起
  // （如"🇺🇸 美国"），筛选栏要去掉 emoji 省空间，去掉后取剩余文字；
  // 徽章（_badgeHtml）取的是 emoji 本身，不受影响，仍用 _regionLabel。
  _regionLabelPlain(group) {
    const label = this._regionLabel(group);
    const parts = label.split(' ');
    return parts.length > 1 ? parts.slice(1).join(' ') : label;
  },

  _renderKpi() {
    const el = document.getElementById('schools-kpi');
    if (!el) return;
    const total = this._schools.length;
    const countries = new Set(this._schools.map(s => s.country)).size;
    const aiCore = this._schools.filter(s => this.AI_TIER_RANK[s.ai_level] >= this.AI_TIER_RANK.core).length;
    const sfkSchools = this._schools.filter(s => s.has_sfk_data).length;
    const sfkTotal = this._schools.reduce((sum, s) => sum + (s.has_sfk_data ? s.sfk_total : 0), 0);
    const items = [
      [total, '所院校'],
      [countries, '个国家/地区'],
      [aiCore, 'AI 核心院校'],
      [sfkSchools, '所已有斯芬克录取数据'],
      [sfkTotal, '枚历年累计录取（有数据院校）'],
    ];
    el.innerHTML = items.map(([num, label]) =>
      `<div class="schools-kpi__item"><div class="schools-kpi__num">${num}</div><div class="schools-kpi__label">${label}</div></div>`
    ).join('');
  },

  _renderRegionFilter() {
    const bar = document.getElementById('schools-region-filter');
    if (!bar) return;
    const counts = {};
    this._schools.forEach(s => { counts[s.country] = (counts[s.country] || 0) + 1; });
    const regionOrder = (DATA.school_priority && DATA.school_priority._meta && DATA.school_priority._meta.country_order) || [];
    bar.innerHTML = `<span class="filter-bar__label">地区</span>` +
      `<button class="filter-btn is-active" data-all onclick="SchoolLibrary.resetRegions(this)">全部</button>` +
      regionOrder.filter(g => counts[g]).map(g =>
        `<button class="filter-btn" data-group="${g}" onclick="SchoolLibrary.toggleRegion('${g}',this)">${this._regionLabelPlain(g)} · ${counts[g]}</button>`
      ).join('');
  },

  // 筛选按钮文案用缩短版（跟 archive 站筛选栏的用词长度对齐），只在院校库
  // 这一条筛选栏生效；industries.json 里的 ind.name 全名在其它用到 industries
  // 的地方（产业全景导航、适配产业方向标签等）保持不变，不受影响。缩短版本身
  // 存在 data/industries.json 每条记录的 ind.short 字段里。
  // 去掉产业图标 emoji 省空间（同样只影响这条筛选栏，ind.icon 本身不改）。
  _renderIndustryFilter() {
    const bar = document.getElementById('schools-industry-filter');
    if (!bar) return;
    const industries = DATA.industries || [];
    bar.innerHTML = `<span class="filter-bar__label">产业方向</span>` +
      `<button class="filter-btn is-active" data-all onclick="SchoolLibrary.resetIndustries(this)">全部</button>` +
      industries.map(ind =>
        `<button class="filter-btn" data-ind="${ind.id}" onclick="SchoolLibrary.toggleIndustry('${ind.id}',this)">${ind.short || ind.name}</button>`
      ).join('');
  },

  // 「仅看 AI 核心院校 / 仅看有斯芬克录取数据」跟地区/产业方向不是一回事——
  // 不是「分类」而是「数据来源」开关，单独给个 label + 特殊配色
  // （.filter-btn--special，金琥珀调），放在整组筛选栏最后、加一条虚线
  // 分隔，跟前面几条 categorical 筛选拉开视觉层级。
  _renderToggleFilter() {
    const bar = document.getElementById('schools-toggle-filter');
    if (!bar) return;
    bar.innerHTML = `
      <span class="filter-bar__label">专项筛选</span>
      <button class="filter-btn filter-btn--special" id="schools-toggle-ai" onclick="SchoolLibrary.toggleAiOnly(this)">仅看AI相关</button>
      <button class="filter-btn filter-btn--special" id="schools-toggle-sfk" onclick="SchoolLibrary.toggleSfkOnly(this)">仅看SFK过往录取</button>`;
  },

  _renderSortBar() {
    const bar = document.getElementById('schools-sort-bar');
    if (!bar) return;
    // 去掉「校名 A-Z」这个排序选项（按需求）；「行业声誉」「SFK 录取数」文案
    // 对齐 archive 站排序栏的叫法。
    const opts = [['rank', '行业声誉'], ['sfk', 'SFK 录取数']];
    bar.innerHTML = `<span class="filter-bar__label">排序</span>` + opts.map(([k, label]) =>
      `<button class="filter-btn${k === this._sort ? ' is-active' : ''}" data-sort="${k}" onclick="SchoolLibrary.setSort('${k}',this)">${label}</button>`
    ).join('');
  },

  resetRegions(btn) {
    this._regions.clear();
    document.querySelectorAll('#schools-region-filter .filter-btn').forEach(b => b.classList.remove('is-active'));
    btn.classList.add('is-active');
    this._renderList();
  },
  toggleRegion(group, btn) {
    document.querySelector('#schools-region-filter [data-all]')?.classList.remove('is-active');
    if (this._regions.has(group)) { this._regions.delete(group); btn.classList.remove('is-active'); }
    else { this._regions.add(group); btn.classList.add('is-active'); }
    if (!this._regions.size) document.querySelector('#schools-region-filter [data-all]')?.classList.add('is-active');
    this._renderList();
  },
  resetIndustries(btn) {
    this._industries.clear();
    document.querySelectorAll('#schools-industry-filter .filter-btn').forEach(b => b.classList.remove('is-active'));
    btn.classList.add('is-active');
    this._renderList();
  },
  toggleIndustry(indId, btn) {
    document.querySelector('#schools-industry-filter [data-all]')?.classList.remove('is-active');
    if (this._industries.has(indId)) { this._industries.delete(indId); btn.classList.remove('is-active'); }
    else { this._industries.add(indId); btn.classList.add('is-active'); }
    if (!this._industries.size) document.querySelector('#schools-industry-filter [data-all]')?.classList.add('is-active');
    this._renderList();
  },
  toggleAiOnly(btn) {
    this._aiOnly = !this._aiOnly;
    btn.classList.toggle('is-active', this._aiOnly);
    this._renderList();
  },
  toggleSfkOnly(btn) {
    this._sfkOnly = !this._sfkOnly;
    btn.classList.toggle('is-active', this._sfkOnly);
    this._renderList();
  },
  setSort(key, btn) {
    this._sort = key;
    document.querySelectorAll('#schools-sort-bar .filter-btn').forEach(b => b.classList.remove('is-active'));
    btn.classList.add('is-active');
    this._renderList();
  },

  // 左侧列表「展开列表」——不改左右两栏的浏览逻辑本身，只是临时把右侧
  // 常驻详情藏起来、列表占满整行，方便一次看更多院校；再点一下（或选中
  // 某所院校，见 selectSchool）收回来，变回现在的二分栏，选中的院校详情
  // 还在。拆成 setListExpanded(bool) 而不是只有 toggle，是因为
  // selectSchool 需要单向地「强制收起」，不能简单取反。
  toggleListExpand() {
    this.setListExpanded(!this._listExpanded);
    this._renderList(); // 展开/收起切换渲染形式（卡片网格 ⇄ 列表行），数据和筛选状态不变
  },
  setListExpanded(expanded) {
    if (this._listExpanded === expanded) return;
    this._listExpanded = expanded;
    const view = document.getElementById('schools-jobs-view');
    const btn = document.getElementById('schools-list-toggle');
    if (view) view.classList.toggle('is-list-expanded', expanded);
    if (btn) {
      btn.innerHTML = expanded
        ? '<span class="schools-list-toggle__arrow">◂</span> 收起'
        : '<span class="schools-list-toggle__arrow">▸</span> 展开';
    }
  },

  _bindSearch() {
    const input = document.getElementById('schools-search-input');
    if (!input || input.dataset.bound) return;
    input.dataset.bound = '1';
    input.addEventListener('input', () => {
      this._query = input.value.trim().toLowerCase();
      this._renderList();
    });
  },

  _filtered() {
    return this._schools.filter(s => {
      if (this._regions.size && !this._regions.has(s.country)) return false;
      if (this._industries.size && !s.industry_tags.some(t => this._industries.has(t))) return false;
      if (this._aiOnly && this.AI_TIER_RANK[s.ai_level] < this.AI_TIER_RANK.core) return false;
      if (this._sfkOnly && !s.has_sfk_data) return false;
      if (this._query) {
        const hay = [s.school_zh, s.school_en, s.school_short, s.school_city, s.school_region,
          s.school_positioning, s.school_ranking, ...(s.school_tags || [])].filter(Boolean).join(' ').toLowerCase();
        if (!hay.includes(this._query)) return false;
      }
      return true;
    });
  },

  _sorted(list) {
    const arr = list.slice();
    if (this._sort === 'sfk') {
      arr.sort((a, b) => (b.sfk_total - a.sfk_total) || this._rankOf(a) - this._rankOf(b));
    } else {
      arr.sort((a, b) => this._rankOf(a) - this._rankOf(b));
    }
    return arr;
  },
  _rankOf(s) { return s.industry_rank > 0 ? s.industry_rank : 9999; },

  _badgeHtml(s) {
    const flag = this._regionLabel(s.country).split(' ')[0];
    const bits = [`<span class="school-dir-list__flag">${flag}</span>`];
    if (s.school_short) bits.push(`<span class="school-dir-list__chip">${s.school_short}</span>`);
    if (this.AI_TIER_RANK[s.ai_level] >= this.AI_TIER_RANK.core) bits.push(`<span class="school-dir-list__chip school-dir-list__chip--ai">✨ AI核心</span>`);
    if (s.has_sfk_data) bits.push(`<span class="school-dir-list__chip school-dir-list__chip--sfk">🎓 ${s.sfk_total}</span>`);
    return bits.join('');
  },

  // 收起（二分栏）时用原来的紧凑列表行；展开（列表占满整行）时改用之前
  // 做过的卡片网格版本（.school-card-grid/.school-card，一屏能看更多院校、
  // 也更配得上展开后多出来的宽度）——同一份 filtered/sorted 数据、同一个
  // selectSchool() 点击行为，只是两种呈现形式，不是两套逻辑。
  _renderList() {
    const list = document.getElementById('schools-list');
    if (!list) return;
    const filtered = this._sorted(this._filtered());
    document.getElementById('schools-count') && (document.getElementById('schools-count').textContent = filtered.length);
    if (!filtered.length) {
      list.innerHTML = '<div class="pl-empty">没有匹配的院校，换个筛选条件试试。</div>';
      return;
    }
    list.innerHTML = this._listExpanded ? this._cardGridHtml(filtered) : this._rowListHtml(filtered);
  },
  _rowListHtml(filtered) {
    return filtered.map(s => `
      <div class="school-dir-list__item${s.school_en === this._activeEn ? ' is-active' : ''}" onclick="SchoolLibrary.selectSchool('${s.school_en.replace(/'/g, "\\'")}')">
        <div class="school-dir-list__name">${s.school_zh}<span class="school-dir-list__name-en">${s.school_en}</span></div>
        <div class="school-dir-list__badges">${this._badgeHtml(s)}</div>
      </div>`).join('');
  },
  _cardGridHtml(filtered) {
    return `<div class="school-card-grid">${filtered.map(s => `
      <div class="school-card${s.school_en === this._activeEn ? ' is-active' : ''}" onclick="SchoolLibrary.selectSchool('${s.school_en.replace(/'/g, "\\'")}')">
        <div class="school-card__eyebrow">${this._regionLabel(s.country)}${s.school_city ? ' · ' + s.school_city : ''}</div>
        <div class="school-card__name">${s.school_zh}<span class="school-card__name-en">${s.school_en}</span></div>
        <div class="school-card__badges">${this._badgeHtml(s)}</div>
        ${s.school_positioning ? `<p class="school-card__blurb">${s.school_positioning}</p>` : ''}
        <span class="school-card__hint">查看详情 ›</span>
      </div>`).join('')}</div>`;
  },

  selectSchool(en) {
    this._activeEn = en;
    this._programLevel = null; // 切换学校后本科/研究生 tab 重置为默认（本科优先）
    const s = this._schools.find(x => x.school_en === en);
    this._renderDetail(s); // 先把内容渲染好，收起动画一开始详情就是新选的这所，不会先闪一下旧内容
    this.setListExpanded(false); // 展开态下点了某所院校，视为「要看详情」，自动收回二分栏（带滑入动效）
    this._renderList();
    document.getElementById('schools-detail')?.scrollIntoView({ block: 'nearest' });
  },

  // 未选择任何学校时，展示综合排名 Top 5 作为「概览」，呼应 archive 原本的
  // 默认视图，引导用户先看到最强校再深入某一所。
  _renderOverview() {
    const top5 = this._sorted(this._schools.filter(s => s.industry_rank > 0)).slice(0, 5);
    return `
      <div class="sidebar__header schools-hero-header">
        <div class="sidebar__eyebrow">School Library · Overview</div>
        <div class="sidebar__title" style="font-size:var(--text-xl);">院校库综合排名 Top 5</div>
        <div class="sidebar__subtitle">从左侧列表选择任意一所院校，查看完整介绍、专业与产业匹配。</div>
      </div>
      <div class="ind-detail-grid">
        ${top5.map((s, i) => `
          <div class="ind-detail-card" style="cursor:pointer" onclick="SchoolLibrary.selectSchool('${s.school_en.replace(/'/g, "\\'")}')">
            <b>${i + 1}. ${s.school_zh}</b>
            <small>${s.school_en}</small>
            <p>${s.school_positioning || s.school_college || ''}</p>
          </div>`).join('')}
      </div>`;
  },

  _infoCard(title, en, text) {
    if (!text) return '';
    return `<div class="ind-detail-card"><b>${title}</b><small>${en}</small><p>${text}</p></div>`;
  },

  _levelLabel(level) {
    return level === 'undergraduate' ? '本科' : level === 'graduate' ? '研究生' : level === 'professional' ? '职业学位' : '';
  },

  // 按 program.id 查完整申请要求：program_requirements.json 里每条 program
  // 要么直接内联一份 requirement（program-details，多是官方非标准项目人工
  // 补写的），要么给一个 requirementRef 指向 application_requirements.json
  // 里 [school_zh][level][index] 那一条；matchStatus 为 unavailable 时说明
  // archive 也没有更细的数据，返回 null，调用方回退用 programs.json 自带字段。
  _fullRequirement(programId) {
    const idx = DATA.program_requirements && DATA.program_requirements.byProgramId;
    const entry = idx && idx[programId];
    if (!entry || entry.matchStatus === 'unavailable') return null;
    if (entry.requirement && Object.keys(entry.requirement).length) return entry.requirement;
    if (entry.requirementRef) {
      const { schoolCn, level, index } = entry.requirementRef;
      const bucket = DATA.application_requirements && DATA.application_requirements[schoolCn] && DATA.application_requirements[schoolCn][level];
      return (bucket && bucket[index]) || null;
    }
    return null;
  },

  _findProgram(id) {
    for (const s of this._schools) {
      const p = s.programs.find(x => x.id === id);
      if (p) return { school: s, program: p };
    }
    return null;
  },

  // 专业列表里每一行只保留速览信息（学位/学制/学费）+ 一个入口，完整内容
  // 全部放进 openProgram() 打开的全屏 overlay，不再用 <details> 就地展开。
  _programCard(p) {
    const facts = [p.degree_type, this._levelLabel(p.level), p.duration, p.fee].filter(Boolean).join(' · ');
    return `
      <div class="school-prog" onclick="SchoolLibrary.openProgram('${p.id}')">
        <div class="school-prog__head">
          <div>
            <div class="school-prog__name">${p.program_name_en || p.program_name_zh}</div>
            <div class="school-prog__meta">${facts}</div>
          </div>
          <span class="school-prog__hint">查看完整申请要求 ›</span>
        </div>
      </div>`;
  },

  // 本科/研究生切换 tab（呼应 archive 站 application-level-tabs-v3），
  // 学校详情页「具体专业与学制」区块和「查看申请要求」overlay 共用同一套
  // 生成逻辑：只有一个层级时不显示 tab，直接列出全部专业。
  _levelTabsHtml(s, activeLevel, onClickFn) {
    const levels = [...new Set(s.programs.map(p => p.level))];
    if (levels.length <= 1) return { html: '', activeLevel: levels[0] || '' };
    const counts = {};
    s.programs.forEach(p => { counts[p.level] = (counts[p.level] || 0) + 1; });
    const order = ['undergraduate', 'graduate', 'professional'].filter(l => levels.includes(l));
    const level = order.includes(activeLevel) ? activeLevel : order[0];
    const enSafe = s.school_en.replace(/'/g, "\\'");
    const html = `<div class="level-tabs">${order.map(l =>
      `<button type="button" class="level-tabs__btn${l === level ? ' is-active' : ''}" onclick="${onClickFn}('${enSafe}','${l}')">${this._levelLabel(l)} ${counts[l] || 0}</button>`
    ).join('')}</div>`;
    return { html, activeLevel: level };
  },

  // 学校详情页「具体专业与学制」区块：按本科/研究生分层展示，默认本科。
  _programsSection(s, activeLevel) {
    if (!s.programs.length) return '<p class="u-muted">暂无具体专业信息。</p>';
    const { html: tabs, activeLevel: level } = this._levelTabsHtml(s, activeLevel || this._programLevel, 'SchoolLibrary.setProgramLevel');
    const shown = level ? s.programs.filter(p => p.level === level) : s.programs;
    return tabs + (shown.length ? shown.map(p => this._programCard(p)).join('') : '<p class="u-muted">该层级暂无专业信息。</p>');
  },

  // tab 切换只重绘专业列表这一块（有独立容器 #schools-programs-body），
  // 不重新渲染整个详情页，避免切换层级时把滚动位置弹回顶部。
  setProgramLevel(en, level) {
    this._programLevel = level;
    const s = this._schools.find(x => x.school_en === en);
    const body = document.getElementById('schools-programs-body');
    if (!s || !body) return;
    body.innerHTML = this._programsSection(s, level);
  },

  // 单个专业的完整内容——用于全屏 overlay，同一份渲染逻辑被「查看申请要求」
  // 汇总视图和逐条点开的单专业视图共用。信息拆成 info-box 网格（label+正文，
  // 不是一段段纯文字），作品集要求用 stack-list 逐条编号、交替底色区分，
  // 对齐归档站 application-portfolio-item-v3 的呈现方式。archive 数据没有
  // gpa_requirement / language_scores 这两个字段，回退用 programs.json 自带
  // 值；portfolio 优先取完整的分条数组，不做任何摘要或截断。
  _fullProgramHtml(p) {
    const full = this._fullRequirement(p.id);
    const facts = [p.degree_type, this._levelLabel(p.level), p.duration, p.fee].filter(Boolean).join(' · ');
    const portfolioItems = full && Array.isArray(full.portfolio) && full.portfolio.length
      ? full.portfolio : (p.portfolio_note ? [p.portfolio_note] : []);
    const audience = (full && full.audience) || p.audience;
    const deadline = (full && full.deadline) || p.deadline;
    const academics = (full && full.academics) || p.background_note;
    const caution = (full && full.caution) || p.caution;
    const links = (full && full.links && full.links.length) ? full.links : (p.program_url ? [p.program_url] : []);
    const status = full && full.status;
    const boxes = [
      ['招生对象', audience],
      ['申请截止', deadline],
      ['GPA 要求', p.gpa_requirement],
      ['语言成绩', p.language_scores],
      ['申请材料与学术要求', academics, true],
    ].filter(([, text]) => text);
    return `
      <div class="school-overlay__program" id="prog-${p.id}">
        <div class="school-overlay__program-head">
          <div>
            <h3>${p.program_name_en || p.program_name_zh}</h3>
            <div class="school-overlay__program-meta">${facts}</div>
          </div>
          ${status ? `<span class="school-overlay__status-pill">✓ ${status}</span>` : ''}
        </div>
        ${p.program_name_zh ? `<p class="school-overlay__zh">${p.program_name_zh}</p>` : ''}
        <div class="info-grid">
          ${boxes.map(([label, text, wide]) => `<div class="info-box${wide ? ' info-box--wide' : ''}"><div class="info-box__label">${label}</div><div class="info-box__copy">${text}</div></div>`).join('')}
          ${portfolioItems.length ? `<div class="info-box info-box--wide"><div class="info-box__label">作品集 / 创意材料要求</div><div class="stack-list">${portfolioItems.map((t, i) => `<div class="stack-list__item"><span class="stack-list__num">${i + 1}.</span><span>${t}</span></div>`).join('')}</div></div>` : ''}
        </div>
        ${caution ? `<div class="callout-block"><strong>注意事项：</strong>${caution}</div>` : ''}
        ${links.length ? `<div class="school-overlay__links">${links.map(u => `<a class="pl-btn" href="${u}" target="_blank" rel="noopener">相关页面 ↗</a>`).join('')}</div>` : ''}
      </div>`;
  },

  // 从专业列表某一行点进来：只展示这一个专业的完整要求。
  openProgram(id) {
    const hit = this._findProgram(id);
    if (!hit) return;
    const { school, program } = hit;
    this._openOverlay(`
      <div class="school-overlay__eyebrow">${school.school_zh} · Application Requirements</div>
      ${this._fullProgramHtml(program)}`);
  },

  _industryFitSection(s) {
    if (!s.industry_tags.length) return '<p class="u-muted">暂未标注适配的产业方向。</p>';
    const byId = {};
    (DATA.industries || []).forEach(i => { byId[i.id] = i; });
    return `<div class="sidebar__tags">${s.industry_tags.map(id => {
      const ind = byId[id];
      if (!ind) return '';
      return `<span class="sidebar__tag" style="cursor:pointer" onclick="Router.goToIndustry('${id}')">${ind.icon || ''} ${ind.name}</span>`;
    }).join('')}</div>`;
  },

  // 展示形式改为「offer 展示」同款卡片（.offer-card），不用柱状图：
  //   - 累计总数：来自 programs.json 里已展平的 sfk_total（历年口径，无法再拆分到年份）。
  //   - 本季度按季度细分：真实取自 data/cases.json（当季已确认的录取案例，
  //     字段只用 schools + fall，不读取姓名/成绩/实习等个人叙事字段——
  //     那部分是「学生成功案例」，按需求仍保持占位、不在此处展示）。
  _sfkBreakdown(s) {
    const cases = (DATA.cases || []).filter(c => (c.schools || []).includes(s.school_zh));
    if (!cases.length) return null;
    const bySeason = {};
    cases.forEach(c => { const f = c.fall || '未标注季度'; bySeason[f] = (bySeason[f] || 0) + 1; });
    const seasons = Object.keys(bySeason).sort();
    return { total: cases.length, seasons: seasons.map(f => [f, bySeason[f]]) };
  },

  _sfkSection(s) {
    const breakdown = this._sfkBreakdown(s);
    if (!s.has_sfk_data && !breakdown) {
      return '<div class="page-placeholder" style="padding:var(--space-5);"><div class="page-placeholder__title">录取数据整理中</div><div class="page-placeholder__desc">该校暂无可展示的斯芬克历年录取数据，正在整理中。</div></div>';
    }
    const cards = [];
    if (s.has_sfk_data) cards.push(`<div class="offer-card"><div class="offer-card__count">${s.sfk_total}</div><div class="offer-card__school-zh">历年累计</div><div class="offer-card__school-en">All-Time SFK Admits</div></div>`);
    if (breakdown) {
      breakdown.seasons.forEach(([season, count]) => {
        cards.push(`<div class="offer-card"><div class="offer-card__count">${count}</div><div class="offer-card__school-zh">${season}</div><div class="offer-card__school-en">本季度已确认录取</div></div>`);
      });
    }
    return `<div class="offers-grid" style="border:1px solid var(--color-border);border-radius:var(--radius-md);overflow:hidden;">${cards.join('')}</div>` +
      (!s.has_sfk_data ? '<p class="u-muted" style="margin-top:var(--space-3);">该校历年累计数据仍在整理中，以上为本季度已确认的录取记录。</p>' : '');
  },

  _linksSection(s) {
    if (!s.urls.length) return '<p class="u-muted">暂无官方链接。</p>';
    return s.urls.map(u => `<a class="pl-btn" href="${u}" target="_blank" rel="noopener">访问官网 / 项目页面 ↗</a>`).join(' ');
  },

  // 顶部快捷按钮同一行：查看申请要求／查看录取案例（都走全屏 overlay）
  // 分一组、左对齐；查看历年录取数据是「跳到页面下方分区」而不是叠加
  // 浏览，功能不同但同样是普通按钮，放在同一行右对齐，不再单独另起一行。
  _heroActions(s) {
    const enSafe = s.school_en.replace(/'/g, "\\'");
    return `
      <div class="schools-hero-actions">
        <div class="schools-hero-actions__group">
          <button type="button" class="pl-btn" onclick="SchoolLibrary.openApplicationRequirements('${enSafe}')">📋 查看申请要求</button>
          <button type="button" class="pl-btn" onclick="SchoolLibrary.openCasesPlaceholder('${enSafe}')">🎓 查看录取案例</button>
        </div>
        <button type="button" class="pl-btn" onclick="SchoolLibrary.jumpToSfk()">📊 查看历年录取数据</button>
      </div>`;
  },

  // 「查看申请要求」——不再用 Sidebar，改成全屏 overlay：按本科/研究生分 tab
  // （呼应 archive 站 application-level-tabs-v3，也就是这里之前缺失的
  // 本科/研究生筛选），tab 内把该层级所有专业的完整申请要求（每条都是
  // _fullProgramHtml 渲染出的未截断内容，专业之间用分隔线隔开，不做手风琴
  // 折叠）一次性铺开；单个专业的内容跟从列表页逐条点开的 openProgram()
  // 是同一份渲染逻辑。
  openApplicationRequirements(en, level) {
    const s = this._schools.find(x => x.school_en === en);
    if (!s) return;
    if (!s.programs.length) {
      this._openOverlay(`
        <div class="school-overlay__eyebrow">${s.school_zh} · Application Requirements</div>
        <div class="school-overlay__title">申请要求一览</div>
        <p class="u-muted">暂无具体专业信息。</p>`);
      return;
    }
    const { html: tabs, activeLevel } = this._levelTabsHtml(s, level, 'SchoolLibrary.openApplicationRequirements');
    const shown = activeLevel ? s.programs.filter(p => p.level === activeLevel) : s.programs;
    this._openOverlay(`
      <div class="school-overlay__eyebrow">${s.school_zh} · Application Requirements</div>
      <div class="school-overlay__title">申请要求一览</div>
      <p class="school-overlay__hint">以下按专业逐条列出完整的申请材料、截止日期、语言/GPA 要求与作品集要求，不做摘要或省略。</p>
      ${tabs}
      ${shown.length ? shown.map(p => this._fullProgramHtml(p)).join('') : '<p class="u-muted">该层级暂无专业信息。</p>'}`);
  },

  // 「查看录取案例」——学生成功案例本轮仍按需求保持占位，同样用全屏 overlay
  // 承载「整理中」提示，而不是做一个假的按钮（禁用态说不清楚原因）。
  openCasesPlaceholder(en) {
    const s = this._schools.find(x => x.school_en === en);
    if (!s) return;
    this._openOverlay(`
      <div class="school-overlay__eyebrow">${s.school_zh} · Success Cases</div>
      <div class="school-overlay__title">学生录取案例</div>
      <div class="page-placeholder" style="padding:var(--space-5);">
        <div class="page-placeholder__title">内容建设中</div>
        <div class="page-placeholder__desc">该校的学员录取案例正在整理中，即将上线。</div>
      </div>`);
  },

  jumpToSfk() {
    const details = document.getElementById('schools-sfk-detail');
    if (!details) return;
    details.open = true;
    details.scrollIntoView({ block: 'start', behavior: 'smooth' });
  },

  _renderDetail(s) {
    const el = document.getElementById('schools-detail');
    if (!el) return;
    if (!s) { el.innerHTML = this._renderOverview(); return; }

    el.innerHTML = `
      <div class="sidebar__header schools-hero-header">
        <div class="sidebar__eyebrow">${this._regionLabel(s.country)}${s.school_city ? ' · ' + s.school_city : ''}${s.category ? ' · ' + s.category : ''}</div>
        <div class="schools-hero-titlerow">
          <div>
            <div class="sidebar__title" style="font-size:var(--text-xl);">${s.school_zh}</div>
            <div class="sidebar__subtitle">${s.school_en}</div>
          </div>
          ${s.urls[0] ? `<a class="pl-btn pl-btn--primary" href="${s.urls[0]}" target="_blank" rel="noopener">访问官网 ↗</a>` : ''}
        </div>
        <div class="sidebar__tags" style="margin-top:var(--space-3)">${this._badgeHtml(s)}</div>
        ${this._heroActions(s)}
      </div>

      <details class="ind-detail" open>
        <summary class="ind-detail__head"><h4>具体专业与学制</h4><span>Programs</span></summary>
        <div class="ind-detail__body" id="schools-programs-body">${this._programsSection(s)}</div>
      </details>

      <details class="ind-detail" open>
        <summary class="ind-detail__head"><h4>为什么选择这所学校</h4><span>Why This School</span></summary>
        <div class="ind-detail__body">
          <div class="ind-detail-grid">
            ${this._infoCard('培养逻辑', 'Philosophy', s.school_intro)}
            ${this._infoCard('AI 相关训练', 'AI Training', s.school_ai)}
            ${this._infoCard('院校定位', 'Positioning', s.school_positioning)}
            ${this._infoCard('行业口碑', 'Reputation', s.school_ranking)}
          </div>
          ${s.school_advantages ? `<div class="ind-detail-card" style="margin-top:var(--space-3)"><b>特色优势</b><small>Advantages</small><p>${s.school_advantages}</p></div>` : ''}
        </div>
      </details>

      <details class="ind-detail">
        <summary class="ind-detail__head"><h4>适配产业方向</h4><span>Industry Fit</span></summary>
        <div class="ind-detail__body">${this._industryFitSection(s)}</div>
      </details>

      <details class="ind-detail">
        <summary class="ind-detail__head"><h4>导师与校友</h4><span>Faculty & Alumni</span></summary>
        <div class="ind-detail__body">
          ${s.school_faculty.length ? `<div class="sidebar__section"><div class="sidebar__section-label">导师</div><ul class="sidebar__list">${s.school_faculty.map(f => `<li>${f}</li>`).join('')}</ul></div>` : ''}
          ${s.school_alumni.length ? `<div class="sidebar__section"><div class="sidebar__section-label">知名校友</div><ul class="sidebar__list">${s.school_alumni.map(a => `<li>${a}</li>`).join('')}</ul></div>` : ''}
          ${!s.school_faculty.length && !s.school_alumni.length ? '<p class="u-muted">暂无导师或校友信息。</p>' : ''}
        </div>
      </details>

      <details class="ind-detail" id="schools-sfk-detail">
        <summary class="ind-detail__head"><h4>斯芬克历年录取数据</h4><span>SFK Admits</span></summary>
        <div class="ind-detail__body">${this._sfkSection(s)}</div>
      </details>

      <details class="ind-detail">
        <summary class="ind-detail__head"><h4>官网与官方链接</h4><span>Links</span></summary>
        <div class="ind-detail__body">${this._linksSection(s)}</div>
      </details>`;
  },
};
window.SchoolLibrary = SchoolLibrary;
