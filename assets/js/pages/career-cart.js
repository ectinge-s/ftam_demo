/* ═══════════════════════════════════════════
   CAREER CART — 职业目标选择（购物车式、跨视图共享）
   ───────────────────────────────────────────
   对应归档项目「岗位库选择3个职业目标（主/次/探索）」的选择步骤。
   在「岗位详情」视图里点击岗位卡片上的「+」加入，最多 3 个；
   选择结果挂载在 Planning 页级别（#cp-cart，位于三个 view 之外），
   因此产业全景／岗位详情／我的规划三个视图都能看到同一个购物车，
   并被「我的规划」视图读取用于生成报告。
   仅做轻量 localStorage 持久化，不做归档项目里的多学生档案管理。
═══════════════════════════════════════════ */
const CAREER_CART_STORE = 'sfk_film_career_targets_v1';

const CareerCart = {
  _targets: [],
  _open: false,

  // 最多可选职业目标数（主/次/探索），来自 data/career_planning.json 的
  // principles.maxCareerTargets，改数字只需要改 JSON。
  get _max() {
    return (DATA.career_planning && DATA.career_planning.principles && DATA.career_planning.principles.maxCareerTargets) || 3;
  },

  _load() {
    try {
      const raw = JSON.parse(localStorage.getItem(CAREER_CART_STORE));
      if (Array.isArray(raw)) this._targets = raw.filter(t => t && t.roleId != null).slice(0, this._max);
    } catch (e) { /* 忽略 */ }
  },
  _save() {
    try { localStorage.setItem(CAREER_CART_STORE, JSON.stringify(this._targets)); } catch (e) { /* 忽略 */ }
  },

  build() {
    this._load();
    this.render();
  },

  getTargets() { return this._targets; },
  has(roleId) { return this._targets.some(t => t.roleId === roleId); },

  // role: { roleId, industryId, directionZh, directionEn }
  toggle(role) {
    const idx = this._targets.findIndex(t => t.roleId === role.roleId);
    if (idx >= 0) {
      this._targets.splice(idx, 1);
    } else {
      if (this._targets.length >= this._max) {
        window.alert(`最多只能选择 ${this._max} 个职业目标（主目标／次目标／探索目标），请先移除一个再添加。`);
        return;
      }
      this._targets.push({
        roleId: role.roleId, industryId: role.industryId,
        directionZh: role.directionZh, directionEn: role.directionEn,
      });
    }
    this._save();
    this.render();
    if (window.JobLibrary && typeof JobLibrary._refreshSelectionUI === 'function') JobLibrary._refreshSelectionUI();
    if (window.CareerPlanPage && typeof CareerPlanPage._onCartChanged === 'function') CareerPlanPage._onCartChanged();
  },

  remove(roleId) {
    this._targets = this._targets.filter(t => t.roleId !== roleId);
    this._save();
    this.render();
    if (window.JobLibrary && typeof JobLibrary._refreshSelectionUI === 'function') JobLibrary._refreshSelectionUI();
    if (window.CareerPlanPage && typeof CareerPlanPage._onCartChanged === 'function') CareerPlanPage._onCartChanged();
  },

  // 「职业测评」视图算出 Top 3 匹配岗位后调用：整段覆盖式写入（而不是逐个 toggle），
  // 每次测评完成或重新测评都会用最新结果替换当前已选择的职业目标，对齐 archive 站
  // 职业测评「自动加入/更新」的规则。roles 最多取前 3 个，超出部分会被忽略。
  // roles: [{ roleId, industryId, directionZh, directionEn }, ...]
  setFromAssessment(roles) {
    this._targets = (roles || []).slice(0, this._max).map(r => ({
      roleId: r.roleId, industryId: r.industryId, directionZh: r.directionZh, directionEn: r.directionEn,
    }));
    this._save();
    this.render();
    if (window.JobLibrary && typeof JobLibrary._refreshSelectionUI === 'function') JobLibrary._refreshSelectionUI();
    if (window.CareerPlanPage && typeof CareerPlanPage._onCartChanged === 'function') CareerPlanPage._onCartChanged();
  },

  toggleOpen() { this._open = !this._open; this.render(); },
  // 测评刚生成新结果时用来主动展开购物车，提示已把匹配岗位加入职业目标
  open() { this._open = true; this.render(); },
  // 供购物车里已选岗位点击后跳转到「岗位详情」视图并定位到对应岗位
  goToJobDetail(roleId) {
    this._open = false;
    this.render();
    if (window.PlanningViews) PlanningViews.goToJobDetail(roleId);
  },

  render() {
    const el = document.getElementById('cp-cart');
    if (!el) return;
    const labels = ['主目标', '次目标', '探索目标'];
    el.innerHTML = `
      <button type="button" class="cp-cart__tab" onclick="CareerCart.toggleOpen()">
        我的职业目标 <span class="cp-cart__badge">${this._targets.length}/${this._max}</span>
      </button>
      <div class="cp-cart__panel${this._open ? ' is-open' : ''}">
        <div class="cp-cart__head">已选职业目标<button type="button" class="cp-cart__close" onclick="CareerCart.toggleOpen()">×</button></div>
        ${this._targets.length ? this._targets.map((t, i) => `
          <div class="cp-cart__item" onclick="CareerCart.goToJobDetail(${t.roleId})">
            <small>${labels[i]}</small>
            <b>${t.directionZh}</b>
            <button type="button" class="cp-cart__remove" onclick="event.stopPropagation(); CareerCart.remove(${t.roleId})">移除</button>
          </div>`).join('') : `<div class="cp-cart__empty">还没有选择职业目标。前往「岗位详情」，点击岗位卡片上的「+」即可加入，最多 ${this._max} 个（主目标／次目标／探索目标）。</div>`}
        <button type="button" class="pl-btn pl-btn--primary" style="width:100%;margin-top:var(--space-3)" onclick="CareerCart.goToCareerPlan()">去生成我的规划 →</button>
      </div>`;
  },

  goToCareerPlan() {
    this._open = false;
    this.render();
    const btn = document.querySelector('#planning-view-tabs [data-view="career"]');
    if (btn && window.PlanningViews) PlanningViews.switch('career', btn);
    if (window.CareerPlanPage) CareerPlanPage._renderFlow();
    if (window.Router) Router.scrollTo('#planning-view-tabs');
  },
};
window.CareerCart = CareerCart;
