/* ═══════════════════════════════════════════
   COURSE PRODUCTS PAGE — standalone page (like Portfolio/Timeline)
   listing all 7 "课程产品" as full-width cards, split into two
   visually distinct zones: 长线旗舰产品 (longform) and 课程目录 (catalog).
   Clicking any card opens CourseOverlay with that product's full
   long-form-style content (see assets/js/course-demo.js).
═══════════════════════════════════════════ */
const CourseProductsPage = {
  // 长线/目录两组的顺序直接取 data/course_products.json 的对象 key 顺序
  // （按 group 字段分流），新增/调整产品只需要改 json，不用同时维护这两个数组。
  build() {
    const keys = Object.keys(window.PRODUCTS || {});
    const longformOrder = keys.filter(id => window.PRODUCTS[id].group === 'longform');
    const catalogOrder = keys.filter(id => window.PRODUCTS[id].group === 'catalog');
    const lf = document.getElementById('cp-longform-grid');
    const cat = document.getElementById('cp-catalog-grid');
    if (lf) lf.innerHTML = longformOrder.map(id => this._longformCard(id)).join('');
    if (cat) cat.innerHTML = catalogOrder.map(id => this._catalogCard(id)).join('');
  },

  _longformCard(id) {
    const p = window.PRODUCTS[id];
    const bannerCls = 'cp-card__banner' + (p.tileVariant ? ' cp-card__banner--' + p.tileVariant : '');
    return `<div class="cp-card cp-card--longform" onclick="CourseOverlay.open('${id}')">
      <div class="${bannerCls}">
        <span class="cp-card__badge cp-card__badge--longform">长线内容</span>
      </div>
      <div class="cp-card__body">
        <div class="cp-card__eyebrow">${p.meta.eyebrow}</div>
        <div class="cp-card__title">${p.meta.titleCn}</div>
        <div class="cp-card__subtitle"><span class="u-en">${p.meta.titleEn}</span></div>
        <p class="cp-card__desc">${p.meta.desc}</p>
        <div class="cp-card__chips">${p.meta.chips.map(c => `<span class="cd-chip">${c}</span>`).join('')}</div>
      </div>
    </div>`;
  },

  _catalogCard(id) {
    const p = window.PRODUCTS[id];
    return `<div class="cp-card cp-card--catalog" onclick="CourseOverlay.open('${id}')">
      <div class="cp-card__banner cp-card__banner--catalog">
        <span class="cp-card__badge cp-card__badge--catalog">${p.count}个课程</span>
      </div>
      <div class="cp-card__body">
        <div class="cp-card__eyebrow">${p.meta.eyebrow}</div>
        <div class="cp-card__title">${p.meta.titleCn}</div>
        <div class="cp-card__subtitle"><span class="u-en">${p.meta.titleEn}</span></div>
        <p class="cp-card__desc">${p.meta.desc}</p>
      </div>
    </div>`;
  },
};
window.CourseProductsPage = CourseProductsPage;
