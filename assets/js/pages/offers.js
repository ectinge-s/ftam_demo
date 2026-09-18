/* ═══════════════════════════════════════════
   OFFERS PAGE — 2026 申请季 offer 展示
   （所有国家 / 地区合并展示，不再分组筛选）
═══════════════════════════════════════════ */
const OffersPage = {
  build() {
    this._render();
    let resizeTimer;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => this._render(), 150);
    });
  },

  _render() {
    const grid = document.getElementById('offers-grid');
    if (!grid || !DATA.offers_featured) return;
    const featured = DATA.offers_featured;

    // Build lookup: school_zh → offer_count from flat offers.json
    const countMap = {};
    (DATA.offers?.schools || []).forEach(s => { countMap[s.school_zh] = s.offer_count; });

    // 合并全部国家 / 地区分组，按原有分组顺序拼接；没有 offer 记录的院校不展示卡片
    const GROUP_ORDER = ['US', 'UK', 'HK_SG', 'OTHER'];
    const schools = GROUP_ORDER.flatMap(g => (featured.groups[g] || [])
      .map(s => ({ ...s, offer_count: countMap[s.school_zh] || 0 })))
      .filter(s => s.offer_count > 0);

    grid.innerHTML = `
      <div class="offers-grid">
        ${schools.map(s => `
          <div class="offer-card">
            <div class="offer-card__count">${s.offer_count}</div>
            <div class="offer-card__school-zh">${s.school_zh}</div>
            <div class="offer-card__school-en">${s.school_en}</div>
          </div>`).join('')}
      </div>`;
  },
};
// expose for inline event handlers
window.OffersPage = OffersPage;
