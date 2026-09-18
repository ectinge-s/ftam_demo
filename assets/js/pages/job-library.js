/* ═══════════════════════════════════════════
   JOB LIBRARY（岗位详情 / 岗位库）
   ───────────────────────────────────────────
   参考 _archive/ 原项目「岗位库」的搜索 + 详细岗位介绍交互，
   数据完全复用当前站内已有的两份数据（不新增数据源）：
     - data/careers.json（按 role_id 聚合出 61 个核心岗位，取企业、职责、薪资等字段）
     - data/role_recruitment.json（61 个核心岗位的招聘画像：日常工作 / 雇主类型 /
       入行路径 / 岗位要求 / 作品集建议 / 升学方向 / SFK 可提供资源）
   暂不落地原项目里的「岗位对比」功能。
═══════════════════════════════════════════ */
const JobLibrary = {
  _roles: [],
  _activeId: null,
  _activeIndustry: 'all',
  _query: '',

  build() {
    this._roles = this._buildRoles();
    this._renderIndustryFilter();
    this._bindSearch();
    this._renderList();
    if (this._roles.length && this._activeId == null) this.selectRole(this._roles[0].roleId);
  },

  // 按 role_id 把 careers.json 的逐企业条目聚合成 61 个「岗位」，再挂上对应的招聘画像
  _buildRoles() {
    const profiles = (DATA.role_recruitment && DATA.role_recruitment.profiles) || {};
    const byRole = new Map();
    (DATA.careers || []).forEach(c => {
      if (!byRole.has(c.role_id)) {
        byRole.set(c.role_id, {
          roleId: c.role_id,
          industryId: c.industry_id,
          industry: c.industry,
          directionZh: c.direction_zh,
          directionEn: c.direction_en,
          isAiTrack: !!c.is_ai_track,
          jobs: [],
        });
      }
      byRole.get(c.role_id).jobs.push(c);
    });
    return [...byRole.values()]
      .map(r => ({ ...r, profile: profiles[String(r.roleId)] || null }))
      .sort((a, b) => a.roleId - b.roleId);
  },

  _renderIndustryFilter() {
    const bar = document.getElementById('jobs-industry-filter');
    if (!bar) return;
    const industries = (typeof INDUSTRIES !== 'undefined' && INDUSTRIES.length) ? INDUSTRIES : (DATA.industries || []);
    bar.innerHTML = `<button class="filter-btn is-active" data-ind="all" onclick="JobLibrary.filterIndustry('all',this)">全部</button>` +
      industries.map(ind =>
        `<button class="filter-btn" data-ind="${ind.id}" onclick="JobLibrary.filterIndustry('${ind.id}',this)">${ind.name}</button>`
      ).join('');
  },

  filterIndustry(indId, btn) {
    document.querySelectorAll('#jobs-industry-filter .filter-btn').forEach(b => b.classList.remove('is-active'));
    btn.classList.add('is-active');
    this._activeIndustry = indId;
    this._renderList();
  },

  _bindSearch() {
    const input = document.getElementById('jobs-search-input');
    if (!input || input.dataset.bound) return;
    input.dataset.bound = '1';
    input.addEventListener('input', () => {
      this._query = input.value.trim().toLowerCase();
      this._renderList();
    });
  },

  _filteredRoles() {
    return this._roles.filter(r => {
      if (this._activeIndustry !== 'all' && r.industryId !== this._activeIndustry) return false;
      if (!this._query) return true;
      const hay = [r.directionZh, r.directionEn, r.profile && r.profile.standardTitle,
        ...((r.profile && r.profile.searchNames) || []), ...r.jobs.map(j => j.company)]
        .filter(Boolean).join(' ').toLowerCase();
      return hay.includes(this._query);
    });
  },

  _renderList() {
    const list = document.getElementById('jobs-role-list');
    if (!list) return;
    const roles = this._filteredRoles();
    const picked = id => window.CareerCart && CareerCart.has(id);
    list.innerHTML = roles.length ? roles.map(r => `
      <div class="job-dir-list__item${r.roleId === this._activeId ? ' is-active' : ''}" onclick="JobLibrary.selectRole(${r.roleId})">
        <span>${r.directionZh}</span>
        <span class="job-dir-list__item-en">${r.directionEn}</span>
        <span class="job-dir-list__count">${r.jobs.length}</span>
        <button type="button" class="job-dir-list__pick${picked(r.roleId) ? ' is-picked' : ''}" title="加入／移除职业目标" onclick="event.stopPropagation(); JobLibrary.toggleTarget(${r.roleId})">${picked(r.roleId) ? '✓' : '+'}</button>
      </div>`).join('') : '<div class="pl-empty">没有匹配的岗位，换个关键词试试。</div>';
  },

  selectRole(roleId) {
    this._activeId = roleId;
    this._renderList();
    const role = this._roles.find(r => r.roleId === roleId);
    this._renderDetail(role);
  },

  // 供「购物车」已选岗位点击后跳转到本视图并定位到该岗位：先清空搜索／产业筛选，
  // 确保对应列表项不会被筛选条件隐藏，再选中该岗位并把列表项滚动到可视区域。
  selectRoleAndFocus(roleId) {
    this._query = '';
    this._activeIndustry = 'all';
    const input = document.getElementById('jobs-search-input');
    if (input) input.value = '';
    const filterBar = document.getElementById('jobs-industry-filter');
    if (filterBar) {
      filterBar.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('is-active'));
      const allBtn = filterBar.querySelector('[data-ind="all"]');
      if (allBtn) allBtn.classList.add('is-active');
    }
    this.selectRole(roleId);
    const item = document.querySelector('#jobs-role-list .job-dir-list__item.is-active');
    if (item) item.scrollIntoView({ block: 'nearest' });
  },

  // 加入／移除职业目标购物车（CareerCart，跨产业全景／岗位详情／我的规划三个视图共享）
  toggleTarget(roleId) {
    const role = this._roles.find(r => r.roleId === roleId);
    if (!role || !window.CareerCart) return;
    CareerCart.toggle({ roleId: role.roleId, industryId: role.industryId, directionZh: role.directionZh, directionEn: role.directionEn });
  },

  // CareerCart 变化后回调：刷新列表勾选状态与详情面板按钮状态
  _refreshSelectionUI() {
    this._renderList();
    if (this._activeId != null) {
      const role = this._roles.find(r => r.roleId === this._activeId);
      if (role) this._renderDetail(role);
    }
  },

  _listBlock(label, items) {
    if (!items || !items.length) return '';
    return `
      <div class="sidebar__section">
        <div class="sidebar__section-label">${label}</div>
        <ul class="sidebar__list">${items.map(x => `<li>${x}</li>`).join('')}</ul>
      </div>`;
  },

  _employerBlock(profile) {
    const groups = profile && profile.employerGroups;
    if (!groups || !groups.length) return '';
    return `
      <div class="sidebar__section">
        <div class="sidebar__section-label">典型雇主类型</div>
        ${groups.map(g => `
          <div style="margin-bottom:12px">
            <p style="font-weight:600;margin:0 0 4px">${g.type || ''}</p>
            ${g.examples && g.examples.length ? `<div class="sidebar__tags" style="margin-bottom:6px">${g.examples.map(e => `<span class="sidebar__tag">${e}</span>`).join('')}</div>` : ''}
            ${g.roles && g.roles.length ? `<p style="font-size:12px;color:var(--color-text-muted)">对应职位：${g.roles.join(' / ')}</p>` : ''}
          </div>`).join('')}
      </div>`;
  },

  _renderDetail(role) {
    const el = document.getElementById('jobs-role-detail');
    if (!el) return;
    if (!role) { el.innerHTML = '<div class="pl-empty">没有找到该岗位。</div>'; return; }
    const p = role.profile;
    const companies = [...new Set(role.jobs.map(j => j.company))];
    const first = role.jobs[0] || {};
    const tools = [...new Set(role.jobs.map(j => j.tools).filter(Boolean).join('；').split(/[,，、；]/).map(t => t.trim()).filter(Boolean))];

    const picked = window.CareerCart && CareerCart.has(role.roleId);
    el.innerHTML = `
      <div class="sidebar__header" style="padding:0 0 var(--space-4);border-bottom:1px solid var(--color-border);margin-bottom:var(--space-4);">
        <div class="sidebar__eyebrow">${role.industry || ''}${role.isAiTrack ? ' · AI 方向' : ''}</div>
        <div class="sidebar__title" style="font-size:var(--text-xl);">${(p && p.standardTitle) || role.directionZh}</div>
        <div class="sidebar__subtitle">${role.directionEn}</div>
        <button type="button" class="pl-btn ${picked ? '' : 'pl-btn--primary'}" style="margin-top:var(--space-3)" onclick="JobLibrary.toggleTarget(${role.roleId})">${picked ? '✓ 已加入职业目标 · 点击移除' : '+ 加入职业目标（用于生成职业规划）'}</button>
      </div>

      ${first.responsibilities ? `<div class="sidebar__section"><div class="sidebar__section-label">典型职责</div><p>${first.responsibilities}</p></div>` : ''}
      ${this._listBlock('日常工作', p && p.dailyWork)}
      ${first.talent_summary ? `<div class="sidebar__section"><div class="sidebar__section-label">人才要求</div><p>${first.talent_summary}</p></div>` : ''}
      ${this._listBlock('岗位要求', p && p.requirements)}
      ${this._listBlock('作品集 / 材料建议', p && p.portfolio)}
      ${tools.length ? `<div class="sidebar__section"><div class="sidebar__section-label">核心工具</div><div class="sidebar__tags">${tools.map(t => `<span class="sidebar__tag">${t}</span>`).join('')}</div></div>` : ''}
      ${first.career_path ? `<div class="sidebar__section"><div class="sidebar__section-label">晋升路径</div><p>${first.career_path}</p></div>` : ''}
      ${this._employerBlock(p)}
      ${this._listBlock('入行路径', p && p.entry)}
      ${p && p.schoolDirection ? `<div class="sidebar__section"><div class="sidebar__section-label">升学方向建议</div><p>${p.schoolDirection}</p></div>` : ''}
      ${this._listBlock('SFK 可提供资源', p && p.sfkResources)}

      <div class="sidebar__section">
        <div class="sidebar__section-label">正在招聘该岗位的企业（${companies.length}）</div>
        <div class="sidebar__tags">${companies.map(c =>
          `<span class="sidebar__tag" style="cursor:pointer" onclick="PlanningPage.openCompanyGroupSidebar('${role.industryId}','${c.replace(/'/g, "\\'")}')">${c}</span>`
        ).join('')}</div>
      </div>`;
  },
};
window.JobLibrary = JobLibrary;
