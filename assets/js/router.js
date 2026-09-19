/* ═══════════════════════════════════════════
   ROUTER — page switching + scroll helpers
═══════════════════════════════════════════ */

// Disable browser's native scroll restoration so we control it fully
if ('scrollRestoration' in history) history.scrollRestoration = 'manual';

const Router = {
  current: 'home',

  go(pageId, opts = {}) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('is-active'));
    document.querySelectorAll('.navbar__btn').forEach(b => b.classList.remove('is-active'));

    const page = document.getElementById('page-' + pageId);
    if (!page) return;
    page.classList.add('is-active');
    this.current = pageId;

    // Persist page in URL hash; push new history entry so browser back button works
    const pagesToHash = ['portfolio','planning','timeline','course-products','schools'];
    const newHash = pagesToHash.includes(pageId) ? '#' + pageId : location.pathname + location.search;
    if (!this._fromPopstate && location.hash !== '#' + pageId) {
      history.pushState(null, '', newHash);
    }

    // Sync navbar active state
    // 'timeline' 已从主导航第二组移除（仍是可直接访问的独立页面，
    // 通过首页 roadmap 卡片「07」和 footer 链接进入），因此不再占用导航高亮位。
    const navMap = { home: 0, portfolio: 6, schools: 7, 'course-products': 8 };
    if (navMap[pageId] !== undefined)
      document.querySelectorAll('.navbar__btn')[navMap[pageId]]?.classList.add('is-active');

    if (opts.scrollTo) {
      setTimeout(() => this.scrollTo(opts.scrollTo), 100);
    } else {
      window.scrollTo(0, 0);
    }
  },

  scrollTo(selector, extraOffset = 0) {
    const el = typeof selector === 'string' ? document.querySelector(selector) : selector;
    if (!el) return;
    const navbarH = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--navbar-h'), 10) || 56;
    const indNav = document.querySelector('.industry-nav');
    const navH = navbarH + (indNav ? indNav.offsetHeight : 0);
    const top = el.getBoundingClientRect().top + window.scrollY - navH - extraOffset;
    window.scrollTo({ top, behavior: 'smooth' });
  },

  goToPortfolioFilter(branch) {
    // 案例展示页的筛选栏已改为「层次 / 国家」两个维度（不再是 academic_branch
    // 分类按钮），但产业规划页仍会按学术分支跳转过来看该方向的案例，所以
    // 这里改为让 PortfolioPage 按 academic_branch 做一次隐式的内容过滤
    // （见 PortfolioPage.filterByBranch），而不是去点一个已经不存在的按钮。
    this.go('portfolio');
    setTimeout(() => {
      if (window.PortfolioPage) PortfolioPage.filterByBranch(branch);
    }, 100);
  },

  goToCoursesTab(tabId) {
    const PRODUCT_MAP = { internship: 'internship', summer: 'summerwinter', bizpractice: 'bizpractice', masterclass: 'masterclass' };
    const productId = PRODUCT_MAP[tabId];
    if (productId && window.CourseOverlay) CourseOverlay.open(productId);
  },

  goToIndustry(indId) {
    if (this.current !== 'planning') {
      this.go('planning');
      setTimeout(() => this._scrollToIndustry(indId), 250);
    } else {
      this._scrollToIndustry(indId);
    }
  },

  _scrollToIndustry(indId) {
    const el = document.getElementById('sec-' + indId);
    if (el) this.scrollTo(el);
    document.querySelectorAll('.industry-nav__btn').forEach(b => b.classList.remove('is-active'));
    document.getElementById('nav-' + indId)?.classList.add('is-active');
  },
};

const Tabs = {
  switchCountrySidebar(group, btn) {
    const sid = document.getElementById('sidebar');
    sid.querySelectorAll('.country-tab').forEach(b => b.classList.remove('is-active'));
    sid.querySelectorAll('.country-tab-panel').forEach(p => p.classList.remove('is-active'));
    btn.classList.add('is-active');
    sid.querySelector('.country-tab-panel[data-group="' + group + '"]')?.classList.add('is-active');
  },
};

// Handle browser back/forward
window.addEventListener('popstate', () => {
  const PAGES = ['portfolio','planning','timeline','course-products','schools'];
  const hashPage = location.hash.replace('#', '');
  Router._fromPopstate = true;
  if (hashPage === 'assessment') {
    PlanningViews.goToAssessment();
  } else if (hashPage === 'plan') {
    PlanningViews.goToCareer();
  } else {
    Router.go(PAGES.includes(hashPage) ? hashPage : 'home');
  }
  Router._fromPopstate = false;
});

/* Keep the navbar selection box on whichever item the user actually clicked.
   The in-page scroll links all route to 'home', so positional sync alone
   can't tell them apart — this lets the clicked button win. */
document.addEventListener('DOMContentLoaded', () => {
  const links = document.querySelector('.navbar__links');
  if (!links) return;
  links.addEventListener('click', (e) => {
    const btn = e.target.closest('.navbar__btn');
    if (!btn || !links.contains(btn)) return;
    links.querySelectorAll('.navbar__btn').forEach(b => b.classList.remove('is-active'));
    btn.classList.add('is-active');
  });
});
